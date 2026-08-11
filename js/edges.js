// 原图轮廓叠加（Sobel 边缘 -> 半透明白色线条描在深度图上）

/**
 * 计算 Sobel 边缘掩码（0/255）。
 */
export function computeEdges(imageData, threshold = 55) {
  const { width, height, data } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  }
  const mask = new Uint8ClampedArray(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] +
        gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      const mag = Math.sqrt(gx * gx + gy * gy);
      mask[i] = mag > threshold ? 255 : 0;
    }
  }
  return mask;
}

/**
 * 把边缘以半透明白色线条叠加到深度 ImageData 上。
 */
export function overlayEdges(depthImage, edgeMask, alpha = 0.5) {
  const { width, height, data } = depthImage;
  for (let i = 0; i < width * height; i++) {
    if (edgeMask[i]) {
      const idx = i * 4;
      data[idx] = 255 * alpha + data[idx] * (1 - alpha);
      data[idx + 1] = 255 * alpha + data[idx + 1] * (1 - alpha);
      data[idx + 2] = 255 * alpha + data[idx + 2] * (1 - alpha);
    }
  }
}
