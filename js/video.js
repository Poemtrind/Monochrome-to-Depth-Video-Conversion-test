// 视频加载、帧抽取、时间段、宽高比锁定

/**
 * 加载本地视频文件，返回 video 元素与元数据。
 */
export function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      resolve({
        video,
        url,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法加载该视频文件'));
    };
  });
}

/**
 * 把播放头跳到指定时间，返回 seeked 后的 Promise。
 */
export function seekTo(video, t) {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    // 夹在合法范围内，避免超出时长导致无法触发 seeked
    const clamped = Math.min(Math.max(t, 0), video.duration - 0.001);
    if (Math.abs(video.currentTime - clamped) < 1e-4) {
      // 已经在该位置，直接 resolve
      resolve();
    } else {
      video.currentTime = clamped;
    }
  });
}

/**
 * 计算片段总帧数。
 */
export function computeTotalFrames(start, end, fps) {
  const dur = Math.max(0, end - start);
  return Math.max(1, Math.floor(dur * fps));
}

/**
 * 根据锁定宽高比，联动计算另一边尺寸。
 * @param {'width'|'height'} changed 被用户改动的一边
 */
export function applyAspectLock(changed, width, height, srcW, srcH, lockRatio) {
  if (!lockRatio || !srcW || !srcH) return { width, height };
  const ratio = srcW / srcH;
  if (changed === 'width') {
    const h = Math.round(width / ratio);
    return { width, height: Math.max(1, h) };
  } else {
    const w = Math.round(height * ratio);
    return { width: Math.max(1, w), height };
  }
}
