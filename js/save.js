// 选择保存目录（File System Access API）与下载兜底

let dirHandle = null;
let pendingFileHandle = null;
let pendingName = '';

export function getDirHandle() {
  return dirHandle;
}

export function hasDir() {
  return dirHandle !== null;
}

/**
 * 弹出文件夹选择器（仅 Chromium 支持）。
 */
export async function pickDir() {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('当前浏览器不支持选择目录，将使用下载兜底');
  }
  dirHandle = await window.showDirectoryPicker();
  return dirHandle;
}

export function getDirName() {
  return dirHandle ? dirHandle.name : '';
}

function makeTimestampName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `depth_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.mp4`;
}

/**
 * 在用户激活期间（开始转换按钮点击时）预先创建好文件句柄。
 * 转换完成后直接写入，避免"User activation is required"报错。
 */
export async function prepareWrite() {
  if (!dirHandle) return false;
  pendingName = makeTimestampName();
  pendingFileHandle = await dirHandle.getFileHandle(pendingName, { create: true });
  return true;
}

export function resetPending() {
  pendingFileHandle = null;
  pendingName = '';
}

/**
 * 保存 Blob：有预先创建的文件句柄则写入目录，否则触发浏览器下载。
 */
export async function saveBlob(blob) {
  if (pendingFileHandle) {
    const writable = await pendingFileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    const name = pendingName;
    resetPending();
    return { name, method: 'dir' };
  }
  // 兜底下载
  const name = makeTimestampName();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { name, method: 'download' };
}
