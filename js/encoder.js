// 用 ffmpeg.wasm 把每帧 JPEG 直接封装成 mp4（本地浏览器内离线）
// 已验证的稳定做法：
//   - 使用「单线程 core」：多线程版（core-mt）在合成 mp4 时会卡在 ~99%，单线程稳定；
//   - 每帧以 JPEG 写入 ffmpeg 的 MEMFS，最后一次性 exec 用 libx264 封装成 mp4；
//   - ffmpeg 用「动态 import」懒加载，绝不在模块顶层静态 import，避免拖垮 UI 绑定。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ffmpeg = null;
let loading = false;

async function ensureFFmpeg() {
  if (ffmpeg) return ffmpeg;
  if (loading) { while (loading) await sleep(50); return ffmpeg; }
  loading = true;
  try {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    ffmpeg = new FFmpeg();
    const base = new URL('./libs/ffmpeg/core/', location.href).href;
    await ffmpeg.load({
      coreURL: await toBlobURL(base + 'ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL(base + 'ffmpeg-core.wasm', 'application/wasm'),
    });
  } finally {
    loading = false;
  }
  return ffmpeg;
}

/**
 * 初始化编码器（本质是加载 ffmpeg 内核并清理残留帧文件）。
 * @param {number} width
 * @param {number} height
 * @param {number} fps
 */
export async function createEncoder(width, height, fps) {
  const ff = await ensureFFmpeg();
  // 清理可能残留的帧文件，避免旧帧混进新视频
  for (let i = 4000; i >= 0; i--) {
    try { await ff.deleteFile('f' + String(i).padStart(4, '0') + '.jpg'); } catch (e) {}
  }
  return { ff, fps };
}

/**
 * 编码单帧：把深度画布写成一帧 JPEG 到 ffmpeg 内存文件系统。
 * @param {object} enc createEncoder 的返回值
 * @param {HTMLCanvasElement} canvas 深度帧画布
 * @param {number} frameIndex 帧序号（从 0）
 * @param {number} fps
 */
export async function encodeFrame(enc, canvas, frameIndex, fps) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
  await enc.ff.writeFile(
    'f' + String(frameIndex).padStart(4, '0') + '.jpg',
    new Uint8Array(await blob.arrayBuffer())
  );
}

/**
 * 收尾：用 libx264 把所有帧封装成 mp4，返回 Blob。
 */
export async function finalize(enc) {
  await enc.ff.exec([
    '-framerate', String(enc.fps),
    '-i', 'f%04d.jpg',
    '-c:v', 'libx264',
    '-preset', 'ultrafast', // 最快编码，封装大幅提速（文件略大）
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    '-y', 'out.mp4',
  ]);
  const data = await enc.ff.readFile('out.mp4');
  return new Blob([data], { type: 'video/mp4' });
}

/**
 * 取消：终止 ffmpeg 实例（真正中止合成），并重置以便下次重新加载。
 */
export function cancel(enc) {
  try { enc.ff.terminate(); } catch (e) {}
  ffmpeg = null;
  loading = false;
}
