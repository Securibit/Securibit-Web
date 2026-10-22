import { rpc } from '@/lib/rpc';
import { Result } from '@/types/Permission/Permission';
import { UserPublic } from '@/types/User/UserPublic';

// 標準 UUID（8-4-4-4-12）；@ID 不能長這樣（資料庫 0013 也擋），所以 /u/<參數> 用它分辨是 id 還是 @ID
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID_PATTERN.test(value);

// 網址參數當 @ID 用時：轉小寫、去掉開頭的 @（網址裡的 @ 可能被編碼成 %40）
export const normalizeUsernameParam = (value: string) => {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // 不是合法的編碼就照原樣
  }
  return decoded.trim().replace(/^@/, '').toLowerCase();
};

// 別人的個人頁面：有 @ID 就用 /u/<username>，沒有才用 id
export const userPageHref = (userId: string, username?: string | null) =>
  `/u/${username ? encodeURIComponent(username) : userId}`;

// 別人的公開資料：參數是 UUID 就照 id 查，否則當 @ID 查
export const loadUserPublic = async (idOrUsername: string): Promise<Result<UserPublic>> => {
  if (isUuid(idOrUsername)) return rpc<UserPublic>('user_public', { user_id: idOrUsername });
  const name = normalizeUsernameParam(idOrUsername);
  if (!name) return { success: false, message: '找不到這位使用者' };
  return rpc<UserPublic>('user_public_by_username', { name });
};
