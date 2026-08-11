// 深度模型加载与推理（Transformers.js + ONNX Runtime Web，本地离线）
// 借鉴 SECOND2（E:\SECOND2）验证过的写法：
//   - 用「动态 import('transformers')」懒加载，绝不在模块顶层静态 import，
//     避免重库加载失败把整个页面的按钮绑定一起拖垮；
//   - env 配置逐项 try/catch，且 wasm 路径用绝对路径字符串；
//   - 模型用绝对路径；ORT 版本与 transformers 版本已严格匹配（直接复用 SECOND2 的库）。

let tfModule = null;
let estimator = null;
let currentDevice = null;

// 本地模型目录 & ONNX wasm 目录
// 注意：模型 ID 必须是根目录相对路径字符串，不能是完整 URL，否则 Transformers.js
// 会把它当成远程模型，触发 env.allowRemoteModels=false 报错。
const MODEL_ID = './models/depth-anything-v2-small';
const ortBase = new URL('./libs/ort/', location.href).href;

// 懒加载 transformers 并一次性配置好离线环境（仅首次调用时执行）
async function ensureTF() {
  if (tfModule) return tfModule;
  tfModule = await import('transformers'); // 与 importmap 的 "transformers" 对应
  const { env } = tfModule;
  try { env.allowRemoteModels = false; } catch (e) {}
  try { env.allowLocalModels = true; } catch (e) {}
  try { env.useBrowserCache = false; } catch (e) {}
  try { env.wasm.wasmPaths = ortBase; } catch (e) {}
  try {
    if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
      env.backends.onnx.wasm.wasmPaths = ortBase;
    }
  } catch (e) {}
  try {
    // 仅在跨源隔离（COOP/COEP 到位，本地服务器已配置）时使用多线程；
    // 云端静态托管若未设隔离头，则降为单线程，避免 SharedArrayBuffer 缺失导致 WASM 后端崩溃。
    const isolated = (typeof crossOriginIsolated !== 'undefined') ? crossOriginIsolated : false;
    env.wasm.numThreads = isolated ? Math.min(navigator.hardwareConcurrency || 4, 4) : 1;
  } catch (e) {}
  return tfModule;
}

export function isModelLoaded() {
  return estimator !== null;
}

export function getDevice() {
  return currentDevice;
}

/**
 * 加载深度模型。
 * @param {('webgpu'|'wasm')} device 推理设备
 * @param {(p:any)=>void} onProgress 进度回调（Transformers.js 的 progress_callback）
 */
export async function loadModel(device, onProgress) {
  const { pipeline } = await ensureTF();
  currentDevice = device;
  // WebGPU 用 fp16 更快；WASM 用默认精度
  const cfg = device === 'webgpu'
    ? { device: 'webgpu', dtype: 'fp16' }
    : {};
  estimator = await pipeline('depth-estimation', MODEL_ID, {
    ...cfg,
    progress_callback: (p) => { if (onProgress) onProgress(p); },
  });
  return estimator;
}

export function disposeModel() {
  estimator = null;
}

/**
 * 对一帧 RGBA 图像估计深度，返回灰度 ImageData（0=远，255=近）。
 * 兼容 SECOND2 验证过的返回格式：result.predicted_depth 为 Tensor，
 * 需要按 min/max 归一化到 0–255。
 * @param {ImageData} imageData 源帧（输出分辨率）
 * @param {boolean} invert 是否反转深浅（远=亮）
 */
export async function estimateDepth(imageData, invert) {
  if (!estimator) throw new Error('模型尚未加载');
  const { RawImage } = tfModule;
  const { width, height, data } = imageData;

  // RGBA -> RGB（模型需要 3 通道）
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = data[i * 4];
    rgb[i * 3 + 1] = data[i * 4 + 1];
    rgb[i * 3 + 2] = data[i * 4 + 2];
  }
  const raw = new RawImage(rgb, width, height, 3);

  const result = await estimator(raw);
  // SECOND2 验证过的模型返回 predicted_depth；部分版本返回 depth
  const tensor = result.predicted_depth || result.depth;
  if (!tensor || !tensor.data) throw new Error('深度输出格式异常');

  // 从 Tensor 维度里取高宽
  const dims = tensor.dims || [];
  let dH = height, dW = width;
  if (dims.length === 4) { dH = dims[2]; dW = dims[3]; }
  else if (dims.length === 3) { dH = dims[1]; dW = dims[2]; }
  else if (tensor.height && tensor.width) { dH = tensor.height; dW = tensor.width; }
  dW = Math.max(1, Math.floor(Number(dW) || width));
  dH = Math.max(1, Math.floor(Number(dH) || height));

  const d = tensor.data;
  const len = Math.min(d.length, dW * dH);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < len; i++) {
    const v = d[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(max - min, 1e-7);

  // 若输出尺寸和输入不同，先写到临时 canvas 再缩放
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = dW; tmpCanvas.height = dH;
  const tmpCtx = tmpCanvas.getContext('2d');
  const tmpImg = tmpCtx.createImageData(dW, dH);
  for (let i = 0; i < len; i++) {
    let g = Math.max(0, Math.min(255, Math.round(((d[i] - min) / range) * 255)));
    if (invert) g = 255 - g;
    tmpImg.data[i * 4] = g;
    tmpImg.data[i * 4 + 1] = g;
    tmpImg.data[i * 4 + 2] = g;
    tmpImg.data[i * 4 + 3] = 255;
  }
  tmpCtx.putImageData(tmpImg, 0, 0);

  // 缩放到目标分辨率
  const outCanvas = document.createElement('canvas');
  outCanvas.width = width; outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d');
  outCtx.drawImage(tmpCanvas, 0, 0, width, height);
  return outCtx.getImageData(0, 0, width, height);
}
