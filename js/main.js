// 主控逻辑：串联 UI、模型、视频、编码、保存
import * as depth from './depth.js';
import * as video from './video.js';
import * as encoder from './encoder.js';
import * as edges from './edges.js';
import * as save from './save.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const fileInput = $('fileInput');
const fileSelectBtn = $('fileSelectBtn');
const fileName = $('fileName');
const deviceSelect = $('deviceSelect');
const fpsInput = $('fpsInput');
const outWidth = $('outWidth');
const outHeight = $('outHeight');
const lockRatio = $('lockRatio');
const startTime = $('startTime');
const endTime = $('endTime');
const confirmTimeBtn = $('confirmTimeBtn');
const overlayEdgesChk = $('overlayEdges');
const invertDepthChk = $('invertDepth');
const loadModelBtn = $('loadModelBtn');
const modelStatus = $('modelStatus');
const modelProgressBar = $('modelProgressBar');
const modelProgressText = $('modelProgressText');
const startBtn = $('startBtn');
const cancelBtn = $('cancelBtn');
const saveDirBtn = $('saveDirBtn');
const saveDirName = $('saveDirName');
const statusText = $('statusText');
const convProgressBar = $('convProgressBar');
const convProgressText = $('convProgressText');
const origCanvas = $('origCanvas');
const depthCanvas = $('depthCanvas');
const deviceWarn = $('deviceWarn');

// ---------- 状态 ----------
let videoInfo = null;       // { video, url, duration, width, height }
let segment = null;         // { start, end }
let cancelled = false;
let running = false;

// 关页自退心跳：仅本地 localhost 启用；云端静态托管没有 /heartbeat 端点，跳过以免无谓重连
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  try { new EventSource('/heartbeat'); } catch (_) {}
}

// 全局错误捕获，方便排查“点了没反应”
window.addEventListener('error', (e) => {
  const msg = `运行错误：${e.message || e.error}`;
  console.error(e.error);
  setStatus(msg);
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = `未处理异常：${e.reason && e.reason.message || e.reason}`;
  console.error(e.reason);
  setStatus(msg);
});

// 环境提示：WebGPU 不可用时自动选 WASM。
// 注意：WASM 单线程（numThreads=1）不依赖跨源隔离安全头（COOP/COEP），
// 任何手机/桌面浏览器都能直接跑，所以“缺安全头”不是错误，只是少了多线程加速。
if (!supportsWebGPU()) {
  deviceWarn.textContent = '提示：当前浏览器未启用 WebGPU，已自动选用 WASM（单线程，所有浏览器均可流畅运行）。';
  deviceSelect.value = 'wasm';
}

// 移动端视图判定（与 CSS 720px 断点一致）
function isMobileView() {
  return window.matchMedia('(max-width: 720px)').matches;
}
function supportsWebGPU() {
  try {
    return 'gpu' in navigator && navigator.gpu != null;
  } catch (_) { return false; }
}
// 是否支持 WASM 多线程（需要跨源隔离 COOP/COEP 安全头）。
// 注意：单线程 WASM 任何时候都能跑，不依赖安全头。本应用默认跑单线程，
// 所以这个标志只用于“能否额外多线程加速”，绝不作为“能不能用”的门槛。
function supportsWasmThreads() {
  try {
    return typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated === true;
  } catch (_) { return false; }
}
// 选设备：
//  - 手机端一律 WASM（单线程，最稳、所有浏览器可用；手机 WebGPU 支持差也不强求）
//  - 桌面端尊重下拉框选择（WebGPU 优先，加载失败会自动降级 WASM）
function chooseDevice() {
  if (isMobileView()) return 'wasm';
  return deviceSelect.value || (supportsWebGPU() ? 'webgpu' : 'wasm');
}

// ---------- 工具 ----------
function setStatus(msg) { statusText.textContent = msg; }
function setModelProgress(pct) {
  const v = Math.max(0, Math.min(100, pct));
  modelProgressBar.style.width = v + '%';
  modelProgressText.textContent = v.toFixed(1) + '%';
}
function setConvProgress(pct) {
  const v = Math.max(0, Math.min(100, pct));
  convProgressBar.style.width = v + '%';
  convProgressText.textContent = v.toFixed(1) + '%';
}
function clampFps() {
  let f = parseInt(fpsInput.value, 10);
  if (!f || f < 1) f = 1;
  if (f > 60) f = 60;
  return f;
}
function updateStartEnabled() {
  const ok = depth.isModelLoaded() && videoInfo && segment;
  startBtn.disabled = running || !ok;
}

// ---------- 视频加载 ----------
fileSelectBtn.addEventListener('click', () => {
  if (!running) fileInput.click();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    fileName.textContent = '未选择文件';
    return;
  }
  fileName.textContent = file.name;
  try {
    videoInfo = await video.loadVideo(file);
    startTime.value = '0';
    endTime.value = videoInfo.duration.toFixed(1);
    // 默认输出尺寸：按视频比例缩放，画面不变形。
    // 手机端最大 720p，避免单线程 WASM + ffmpeg 编码把主线程卡死；桌面端最大 1080p。
    const isMobile = isMobileView();
    const boxW = isMobile ? 720 : 1080;
    const boxH = isMobile ? 1280 : 1920;
    let w = videoInfo.width, h = videoInfo.height;
    const scale = Math.min(boxW / w, boxH / h, 1);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    // 保证偶数（编码器更稳）
    w = w - (w % 2);
    h = h - (h % 2);
    outWidth.value = w;
    outHeight.value = h;
    segment = { start: 0, end: videoInfo.duration };
    updateStartEnabled();
    setStatus(`视频已加载：${videoInfo.width}×${videoInfo.height}，时长 ${videoInfo.duration.toFixed(1)}s`);
  } catch (e) {
    fileName.textContent = '未选择文件';
    videoInfo = null;
    setStatus('视频加载失败：' + e.message);
    updateStartEnabled();
  }
});

// ---------- 宽高比锁定 ----------
outWidth.addEventListener('input', () => onSizeChange('width'));
outHeight.addEventListener('input', () => onSizeChange('height'));
function onSizeChange(changed) {
  if (!videoInfo || !lockRatio.checked) return;
  const w = parseInt(outWidth.value, 10) || 0;
  const h = parseInt(outHeight.value, 10) || 0;
  const res = video.applyAspectLock(changed, w, h, videoInfo.width, videoInfo.height, true);
  if (changed === 'width') outHeight.value = res.height;
  else outWidth.value = res.width;
}

// ---------- 时间段确定 ----------
confirmTimeBtn.addEventListener('click', () => {
  if (!videoInfo) { setStatus('请先选择视频'); return; }
  let start = parseFloat(startTime.value) || 0;
  let end = parseFloat(endTime.value);
  if (!end || isNaN(end) || end <= start) end = videoInfo.duration;
  start = Math.max(0, start);
  end = Math.min(end, videoInfo.duration);
  segment = { start, end };
  const fps = clampFps();
  const total = video.computeTotalFrames(start, end, fps);
  setStatus(`已确认片段：第 ${start.toFixed(1)}s – ${end.toFixed(1)}s，共 ${(end - start).toFixed(1)}s，约 ${total} 帧`);
  updateStartEnabled();
});

// ---------- 加载模型 ----------
let modelProgressTimer = null;
let modelProgressStarted = false;
function startIndeterminateProgress() {
  let v = 0;
  modelProgressStarted = false;
  if (modelProgressTimer) clearInterval(modelProgressTimer);
  modelProgressTimer = setInterval(() => {
    // 在收到真实进度前只缓慢爬到 35%，避免"先跳到 92% 再被拉回来"的乱跳感
    if (!modelProgressStarted) {
      if (v < 30) v += 0.8;
      setModelProgress(Math.min(v, 30));
    }
  }, 200);
}
function stopIndeterminateProgress() {
  if (modelProgressTimer) { clearInterval(modelProgressTimer); modelProgressTimer = null; }
}

function onModelProgress(p) {
  if (!p) return;
  // 只要收到任何真实进度信号，就停止不确定动画并显示真实值
  if (p.status === 'progress' && p.total && p.total > 0) {
    modelProgressStarted = true;
    stopIndeterminateProgress();
    setModelProgress((p.loaded / p.total) * 100);
  } else if (p.status === 'done' || p.status === 'ready') {
    modelProgressStarted = true;
    stopIndeterminateProgress();
    setModelProgress(100);
  }
}

loadModelBtn.addEventListener('click', async () => {
  // 选设备：手机端强制 WASM（单线程）；桌面端用下拉框所选（WebGPU 失败自动降级 WASM）
  let device = chooseDevice();
  if (device === 'webgpu' && !supportsWebGPU()) {
    device = 'wasm';
    deviceSelect.value = 'wasm';
  }
  const deviceLabel = device === 'webgpu' ? 'WebGPU' : 'WASM 单线程';
  modelStatus.textContent = '加载中…';
  modelStatus.className = 'status-pill status-loading';
  loadModelBtn.disabled = true;
  startBtn.disabled = true;
  setModelProgress(0);
  setStatus(`正在加载深度模型（${deviceLabel}），首次加载约需 5–20 秒…`);
  startIndeterminateProgress();
  try {
    await depth.loadModel(device, onModelProgress);
    stopIndeterminateProgress();
    setModelProgress(100);
    modelStatus.textContent = '已加载（' + deviceLabel + '）';
    modelStatus.className = 'status-pill status-ok';
    updateStartEnabled();
    setStatus('模型已就绪，可开始转换。');
  } catch (e) {
    stopIndeterminateProgress();
    console.error('模型加载失败：', e);
    // WebGPU 失败时自动降级 WASM（单线程，任何浏览器都能跑）
    if (device === 'webgpu') {
      setStatus('WebGPU 加载失败，自动改用 WASM…');
      device = 'wasm';
      deviceSelect.value = 'wasm';
      startIndeterminateProgress();
      try {
        await depth.loadModel('wasm', onModelProgress);
        stopIndeterminateProgress();
        setModelProgress(100);
        modelStatus.textContent = '已加载（WASM）';
        modelStatus.className = 'status-pill status-ok';
        updateStartEnabled();
        setStatus('模型已就绪（已自动降级到 WASM）。');
        return;
      } catch (e2) {
        stopIndeterminateProgress();
        e = e2;
        console.error('WASM 降级也失败：', e2);
      }
    }
    modelStatus.textContent = '加载失败';
    modelStatus.className = 'status-pill status-error';
    const msg = '模型加载失败：' + (e.message || String(e));
    setStatus(msg);
    alert(msg + '\n\n排查建议：\n1. 确认网络能访问 GitHub 上的模型文件（首次需下载约 100MB）；\n2. 刷新页面后重试；\n3. 手机上任意浏览器均可使用（自动跑 WASM 单线程），无需 Chrome/Edge 桌面版。');
    loadModelBtn.disabled = false;
  }
});

// ---------- 选择保存目录 ----------
saveDirBtn.addEventListener('click', async () => {
  try {
    await save.pickDir();
    saveDirName.textContent = '已选择：' + save.getDirName();
    saveDirName.className = 'status-pill status-ok';
  } catch (e) {
    saveDirName.textContent = '未选择（将提示下载）';
    saveDirName.className = 'status-pill status-idle';
    setStatus('未选择目录：' + e.message);
  }
});

// ---------- 转换 ----------
startBtn.addEventListener('click', startConversion);
cancelBtn.addEventListener('click', () => {
  cancelled = true;
  setStatus('正在停止…');
});

async function startConversion() {
  if (!depth.isModelLoaded() || !videoInfo || !segment) return;
  cancelled = false;
  running = true;
  setControls(true);
  setConvProgress(0);

  // 若已选目录且勾选了自动保存，在按钮点击的用户激活期内预先创建文件句柄，
  // 避免转换完成后再创建时报"User activation is required"。
  if (save.hasDir()) {
    try {
      await save.prepareWrite();
    } catch (e) {
      console.warn('目录预创建失败：', e);
      setStatus('目录写入权限不足，将使用浏览器下载兜底。');
      // 继续走下载兜底，不阻断转换
    }
  }

  let width = parseInt(outWidth.value, 10) || videoInfo.width;
  let height = parseInt(outHeight.value, 10) || videoInfo.height;
  // 手机端强制限制分辨率上限，避免卡死；桌面端也限制在合理范围
  const isMobile = isMobileView();
  const maxW = isMobile ? 720 : 1080;
  const maxH = isMobile ? 1280 : 1920;
  const scale = Math.min(maxW / width, maxH / height, 1);
  if (scale < 1) {
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  width = width - (width % 2);
  height = height - (height % 2);
  outWidth.value = width;
  outHeight.value = height;
  const fps = clampFps();
  // 直接读取开始/结束输入框（而非依赖“确定”按钮设置的 segment），
  // 这样即使没点“确定”，转换也会严格按界面上显示的时间片段进行。
  let segStart = parseFloat(startTime.value) || 0;
  let segEndRaw = parseFloat(endTime.value);
  let segEnd = (!segEndRaw || isNaN(segEndRaw) || segEndRaw <= segStart)
    ? videoInfo.duration
    : segEndRaw;
  segStart = Math.max(0, segStart);
  segEnd = Math.min(segEnd, videoInfo.duration);
  const start = segStart;
  const end = segEnd;
  const totalFrames = video.computeTotalFrames(start, end, fps);
  setStatus(`片段：${start.toFixed(1)}s – ${end.toFixed(1)}s，共 ${(end - start).toFixed(1)}s，约 ${totalFrames} 帧`);
  const invert = invertDepthChk.checked;
  const overlay = overlayEdgesChk.checked;

  origCanvas.width = width; origCanvas.height = height;
  depthCanvas.width = width; depthCanvas.height = height;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = width; srcCanvas.height = height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  const depthCtx = depthCanvas.getContext('2d');
  const origCtx = origCanvas.getContext('2d');

  let enc;
  try {
    enc = await encoder.createEncoder(width, height, fps);
  } catch (e) {
    setStatus('编码器初始化失败：' + e.message);
    running = false;
    setControls(false);
    return;
  }

  let done = 0;
  const yieldEvery = isMobileView() ? 1 : 3; // 手机每帧都让出，桌面每 3 帧让出
  try {
    for (let i = 0; i < totalFrames; i++) {
      if (cancelled) break;
      const t = start + i / fps;
      await video.seekTo(videoInfo.video, t);

      // 抽帧：如果抽到黑帧，最多再 seek 一次重试
      let srcImage = null;
      for (let retry = 0; retry < 2; retry++) {
        srcCtx.drawImage(videoInfo.video, 0, 0, width, height);
        srcImage = srcCtx.getImageData(0, 0, width, height);
        if (!video.isMostlyBlack(srcImage, 8) || retry === 1) break;
        await new Promise((r) => setTimeout(r, 50));
        await video.seekTo(videoInfo.video, t + 0.001);
      }
      origCtx.putImageData(srcImage, 0, 0);

      const depthImage = await depth.estimateDepth(srcImage, invert);
      if (overlay) {
        const mask = edges.computeEdges(srcImage, 55);
        edges.overlayEdges(depthImage, mask, 0.5);
      }
      depthCtx.putImageData(depthImage, 0, 0);

      // 必须 await，否则帧会乱序/丢失，导致 MP4 损坏
      await encoder.encodeFrame(enc, depthCanvas, i, fps);

      done++;
      setConvProgress((done / totalFrames) * 100);
      if (i % 3 === 0 || i === totalFrames - 1) {
        setStatus(`正在处理第 ${done} / ${totalFrames} 帧`);
      }
      // 让出主线程，保证 UI（进度条、取消按钮）能响应，手机端尤为重要
      if (i % yieldEvery === 0) {
        await new Promise((r) => setTimeout(r, isMobileView() ? 5 : 1));
      }
    }
  } catch (e) {
    save.resetPending();
    setStatus('处理出错：' + e.message);
  }

  if (cancelled) {
    encoder.cancel(enc);
    save.resetPending();
    setStatus('已取消。');
  } else {
    setStatus('正在封装 mp4…');
    try {
      const blob = await encoder.finalize(enc);
      const res = await save.saveBlob(blob);
      if (res.method === 'dir') {
        setStatus(`完成，已保存到目录：「${res.name}」`);
      } else {
        setStatus(`完成，已触发下载：「${res.name}」`);
      }
    } catch (e) {
      save.resetPending();
      setStatus('保存失败：' + e.message);
    }
  }

  running = false;
  setControls(false);
}

function setControls(isRunning) {
  running = isRunning;
  startBtn.disabled = isRunning || !(depth.isModelLoaded() && videoInfo && segment);
  cancelBtn.disabled = !isRunning;
  loadModelBtn.disabled = isRunning;
  saveDirBtn.disabled = isRunning;
  fileSelectBtn.disabled = isRunning;
  fileInput.disabled = isRunning;
  confirmTimeBtn.disabled = isRunning;
}
