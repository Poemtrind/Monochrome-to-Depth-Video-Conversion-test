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
 * 把播放头跳到指定时间，并确保真正解码出一帧后再返回。
 * 手机浏览器常常在 seeked 事件触发时画面还是黑的，必须等 requestVideoFrameCallback
 * 或额外延时，drawImage 才能拿到有效帧。
 */
export function seekTo(video, t) {
  return new Promise((resolve) => {
    const clamped = Math.min(Math.max(t, 0), video.duration - 0.001);
    if (Math.abs(video.currentTime - clamped) < 1e-4 && video.readyState >= 2) {
      resolve();
      return;
    }

    let resolved = false;
    const doResolve = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      // seeked 只代表播放头到了，不代表画面已解码。等一帧真正渲染出来。
      if ('requestVideoFrameCallback' in video) {
        const handle = video.requestVideoFrameCallback(() => {
          try { video.cancelVideoFrameCallback(handle); } catch (_) {}
          doResolve();
        });
        // 保险：最多等 300ms
        setTimeout(doResolve, 300);
      } else {
        // 老浏览器 Fallback：等一小段时间让解码器出图
        setTimeout(doResolve, 80);
      }
    };

    video.addEventListener('seeked', onSeeked);
    video.currentTime = clamped;
  });
}

/**
 * 辅助：判断 ImageData 是否基本全黑（用于检测抽帧失败）。
 */
export function isMostlyBlack(imageData, threshold = 8) {
  const d = imageData.data;
  let dark = 0, total = d.length / 4;
  if (total <= 0) return true;
  for (let i = 0; i < d.length; i += 4) {
    const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (avg < threshold) dark++;
  }
  return dark / total > 0.95;
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
