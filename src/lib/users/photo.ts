import { supabase } from '@/config/supabase';
import { Result } from '@/types/Permission/Permission';

export type PhotoKind = 'avatar' | 'background';

// 伺服器最多收 8 MB；Vercel 的請求上限約 4.5 MB，超過 4 MB 的先在瀏覽器縮小再送
const MAX_BYTES = 8 * 1024 * 1024;
const SHRINK_ABOVE = 4 * 1024 * 1024;
const SHRINK_EDGE = 2560;

// 縮成長邊 2560 的 JPEG（伺服器還會再轉成 webp）；瀏覽器讀不了這種格式就原檔送出，由伺服器判斷
const shrink = async (file: File): Promise<Blob> => {
  if (file.size <= SHRINK_ABOVE) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, SHRINK_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
};

const request = async (method: 'POST' | 'DELETE', kind: PhotoKind, body?: FormData): Promise<Result<string>> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { success: false, message: '尚未登入' };
  try {
    const res = await fetch(method === 'DELETE' ? `/api/profile/photo?kind=${kind}` : '/api/profile/photo', {
      method,
      headers: { Authorization: `Bearer ${session.access_token}` },
      body,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, message: json.error || `請求失敗（${res.status}）` };
    return { success: true, data: typeof json.url === 'string' ? json.url : '' };
  } catch {
    return { success: false, message: '無法連線到伺服器' };
  }
};

/** 上傳大頭照或背景圖（伺服器裁切並轉成 webp），回傳新的網址 */
export const uploadPhoto = async (kind: PhotoKind, file: File): Promise<Result<string>> => {
  if (!file.type.startsWith('image/')) return { success: false, message: '只能上傳圖片' };
  if (file.size > MAX_BYTES) return { success: false, message: '圖片不能超過 8 MB' };
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', await shrink(file), file.name);
  return request('POST', kind, form);
};

/** 大頭照改回 Google 帳號的照片；背景圖清除 */
export const removePhoto = (kind: PhotoKind) => request('DELETE', kind);
