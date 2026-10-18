import jsQR from 'jsqr';

// 太大的圖片先縮小再解析，速度快很多，對 QR Code 辨識沒影響
const MAX_SIZE = 1600;

// 解析畫面或圖片中的 QR Code，找不到時回傳 null
export const decodeQrFromSource = (
  source: CanvasImageSource,
  width: number,
  height: number,
  canvas: HTMLCanvasElement = document.createElement('canvas')
) => {
  const scale = Math.min(1, MAX_SIZE / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height)?.data ?? null;
};

// 從使用者上傳的圖片檔解析 QR Code
export const decodeQrFromFile = async (file: File) => {
  const bitmap = await createImageBitmap(file);
  try {
    return decodeQrFromSource(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
};
