import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import {
  apiError,
  authenticate,
  AuthedRequest,
  AVATAR_BUCKET,
  GENERIC_ERROR,
  serverError,
} from '@/lib/server/supabaseAdmin';

/**
 * 上傳 / 移除大頭照與背景圖（網站與 App 共用）。
 * POST multipart：file（圖片，8 MB 以內）、kind = avatar | background → 轉成 webp 存到 avatars/<uid>/<kind>-<亂數>.webp，
 * 回傳 { url }（https://<site>/media/...，next.config.js 轉給 Supabase Storage）。
 * DELETE ?kind=avatar → 改回 Google 大頭照；?kind=background → 清掉背景圖。
 * 錯誤回 { error }；profiles 的修改會由資料庫觸發器記進帳號操作紀錄（user.photo / user.background）
 */

const MAX_BYTES = 8 * 1024 * 1024;
// 一位使用者一小時內最多改幾次（用帳號操作紀錄計算）
const HOURLY_LIMIT = 20;

type Kind = 'avatar' | 'background';
const isKind = (value: unknown): value is Kind => value === 'avatar' || value === 'background';

// 同資料庫的 profiles 保護：只接受 Google 的大頭照網址
const GOOGLE_PHOTO = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//;

// authenticate 失敗時改成 { error } 的格式（App 讀這個欄位）
const authFailed = (response: NextResponse) =>
  response.status === 401 ? apiError('請先登入', 401) : apiError(GENERIC_ERROR, response.status);

// 對外的網址用本站網域：有設定 NEXT_PUBLIC_SITE_URL 就用它，否則用這次請求的網域
const siteUrl = (req: NextRequest) => (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/+$/, '');

// 刪掉這位使用者某一類的舊檔（只動 avatars/<uid>/ 底下自己的檔案）；keep 是剛上傳的新檔
const removeOld = async (auth: AuthedRequest, kind: Kind, keep?: string) => {
  const uid = auth.user.id;
  const bucket = auth.admin.storage.from(AVATAR_BUCKET);
  const { data, error } = await bucket.list(uid, { limit: 1000 });
  if (error) {
    console.error('列出舊圖片失敗:', error);
    return;
  }
  const old = (data ?? []).map((file) => file.name).filter((name) => name.startsWith(`${kind}-`) && name !== keep);
  if (old.length === 0) return;
  const { error: removeError } = await bucket.remove(old.map((name) => `${uid}/${name}`));
  if (removeError) console.error('刪除舊圖片失敗:', removeError);
};

// 最近一小時改過幾次大頭照 / 背景圖
const tooFrequent = async (auth: AuthedRequest) => {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await auth.admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('target_type', 'user')
    .eq('target_id', auth.user.id)
    .in('action', ['user.photo', 'user.background'])
    .gte('created_at', hourAgo);
  if (error) {
    console.error('讀取上傳次數失敗:', error);
    return false;
  }
  return (count ?? 0) >= HOURLY_LIMIT;
};

const convert = (input: Buffer, kind: Kind) => {
  // rotate()：先依 EXIF 轉正；輸出不帶任何 metadata（sharp 預設會拿掉 EXIF、GPS 等）
  const image = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
  const resized =
    kind === 'avatar'
      ? image.resize(512, 512, { fit: 'cover' })
      : image.resize({ width: 1600, withoutEnlargement: true });
  return resized.webp({ quality: 82 }).toBuffer();
};

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return authFailed(auth);

  // 先看 Content-Length，太大就不用讀進來（multipart 外框另外留一點空間）
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES + 64 * 1024) return apiError('圖片不能超過 8 MB', 413);

  const form = await req.formData().catch(() => null);
  if (!form) return apiError('請用 multipart/form-data 上傳', 400);
  const kind = form.get('kind');
  const file = form.get('file');
  if (!isKind(kind)) return apiError('kind 只能是 avatar 或 background', 400);
  if (!(file instanceof File)) return apiError('請選擇圖片', 400);
  if (!file.type.startsWith('image/')) return apiError('只能上傳圖片', 415);
  if (file.size > MAX_BYTES) return apiError('圖片不能超過 8 MB', 413);

  if (await tooFrequent(auth)) return apiError('上傳太頻繁，請稍後再試', 429);

  let output: Buffer;
  try {
    output = await convert(Buffer.from(await file.arrayBuffer()), kind);
  } catch {
    return apiError('無法讀取這張圖片，請換一張 JPG 或 PNG', 415);
  }

  const uid = auth.user.id;
  const name = `${kind}-${randomBytes(6).toString('hex')}.webp`;
  const path = `${uid}/${name}`;
  const { error: uploadError } = await auth.admin.storage
    .from(AVATAR_BUCKET)
    .upload(path, output, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (uploadError) return serverError('上傳圖片失敗', uploadError);

  const url = `${siteUrl(req)}/media/${path}`;
  const patch = kind === 'avatar' ? { photo_url: url, photo_custom: true } : { bg_photo_url: url };
  const { error: updateError } = await auth.admin
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', uid);
  if (updateError) {
    // 資料沒更新就把剛上傳的檔案刪掉，不留沒人用的檔案
    await auth.admin.storage.from(AVATAR_BUCKET).remove([path]);
    return serverError('更新個人資料失敗', updateError);
  }

  await removeOld(auth, kind, name);
  return NextResponse.json({ url });
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return authFailed(auth);

  const kind = req.nextUrl.searchParams.get('kind');
  if (!isKind(kind)) return apiError('kind 只能是 avatar 或 background', 400);

  let patch: Record<string, unknown>;
  if (kind === 'avatar') {
    // 改回 Google 帳號的大頭照（沒有就空白）
    const meta = (auth.user.user_metadata ?? {}) as Record<string, unknown>;
    const google = [meta.avatar_url, meta.picture].find((value) => typeof value === 'string' && GOOGLE_PHOTO.test(value));
    patch = { photo_url: (google as string | undefined) ?? '', photo_custom: false };
  } else {
    patch = { bg_photo_url: '' };
  }

  const { error } = await auth.admin
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', auth.user.id);
  if (error) return serverError('更新個人資料失敗', error);

  await removeOld(auth, kind);
  return NextResponse.json({ url: (patch.photo_url as string | undefined) ?? '' });
}
