import { Profile } from '@/types/Profile/Profile';
import { supabase } from '@/config/supabase';
import { AppUser } from '@/types/authUser';
import { rpc } from '@/lib/rpc';

// 將 profiles 資料列（snake_case）轉成 App 內部使用的 Profile
export const rowToProfile = (row: any): Profile => ({
  uid: row.id,
  name: row.name ?? '',
  username: row.username ?? '',
  email: row.email ?? '',
  photoURL: row.photo_url ?? '',
  bgPhotoURL: row.bg_photo_url ?? '',
  emailVerified: row.email_verified ?? false,
  phoneNumber: row.phone_number ?? '',
  metadata: {
    creationTime: row.creation_time ?? '',
    lastSignInTime: row.last_sign_in_time ?? '',
  },
  lastLoginAt: row.last_login_at ?? '',
  lastLoginIp: row.last_login_ip ?? '',
  lastLoginDevice: row.last_login_device ?? '',
  vault: row.vault ?? null,
});

// 記錄這次登入的時間 / IP / 裝置（IP 由後端讀請求 header 取得）
export const recordLogin = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  try {
    await fetch('/api/record-login', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    // 記錄失敗不影響登入流程
  }
};

// 設定自己的 @ID（空字串代表清除），回傳實際存進去的值（小寫）
export const setUsername = (username: string) =>
  rpc<string | null>('set_username', { new_username: username.trim().replace(/^@/, '') });

// @ID 可不可以用（格式正確、不是保留字、沒人用）
export const isUsernameAvailable = (username: string) =>
  rpc<boolean>('username_available', { name: username.trim().replace(/^@/, '').toLowerCase() });

// @ID 格式：3～32 字，小寫英數、底線、點
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,32}$/;

// 不能當 @ID 的字（同資料庫 0013 的 username_reserved）
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'securibit', 'everyone',
  'here', 'support', 'help', 'null', 'undefined',
  'me', 'u', 'api', 'auth', 'about', 'disclaimer', 'code', 'codes', 'addcode',
  'groups', 'group', 'invite', 'invites', 'invitation', 'invitations',
  'settings', 'setting', 'new', 'edit', 'login', 'logout', 'signin', 'signout', 'signup', 'register',
  'user', 'users', 'profile', 'profiles', 'mypage', 'update_info', 'account', 'accounts',
  'notifications', 'roles', 'audit', 'callback', 'static', 'public', 'assets',
  '_next', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.json',
]);

// 看起來像 UUID：整個是 32 位十六進位，或含 8-4-4-4-12 的形狀
const looksLikeUuid = (name: string) =>
  /^[0-9a-f]{32}$/i.test(name) || /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(name);

// 錯誤訊息和資料庫（username_assert）一致
export const USERNAME_FORMAT_MESSAGE = '@ID 只能使用 3～32 個英文小寫字母、數字、底線（_）或句點（.）';
export const USERNAME_UUID_MESSAGE = '@ID 不能是 UUID 的格式（32 位英數字）';
export const USERNAME_RESERVED_MESSAGE = '這個 @ID 是保留字，不能使用';

/** 不查資料庫就能判斷的問題（格式、UUID 樣式、保留字）；name 要先正規化（小寫、去掉 @）。沒問題回傳 undefined */
export const usernameProblem = (name: string) => {
  if (!USERNAME_PATTERN.test(name)) return USERNAME_FORMAT_MESSAGE;
  if (looksLikeUuid(name)) return USERNAME_UUID_MESSAGE;
  if (RESERVED_USERNAMES.has(name)) return USERNAME_RESERVED_MESSAGE;
  return undefined;
};

// 確保使用者有 profile（沒有就依 email 自我修復、接回舊資料）。冪等、可重複呼叫。
export const ensureProfile = async () => {
  const { error } = await supabase.rpc('ensure_profile');
  if (error) console.error('ensure_profile 失敗:', error.message);
};

// 彈出視窗登入用的頻道名稱與 callback 路徑
export const AUTH_CHANNEL = 'securibit-auth';
export const AUTH_CALLBACK_PATH = '/auth/callback';

// 在螢幕中間開一個登入視窗
const openLoginPopup = () => {
  const width = 500;
  const height = 650;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  return window.open(
    '',
    'google-login',
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`
  );
};

// 整頁轉向登入（彈出視窗被瀏覽器擋下時的備案）
const redirectLogin = async () => {
  // 設旗標：轉向回來、session 真的建立後，才由 AuthProvider 顯示「登入成功」
  sessionStorage.setItem('pendingLogin', '1');

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });

  if (error) {
    sessionStorage.removeItem('pendingLogin');
    console.error('Google 登入錯誤:', error);
    return { success: false, message: error.message };
  }
  return { success: true };
};

/**
 * Google 登入：開彈出視窗，登入完成後由 /auth/callback 透過 BroadcastChannel 通知原頁面
 * （Google 登入頁有 COOP，彈窗導過去後 window.opener 會斷掉，不能用 postMessage）。
 * 必須在點擊事件裡「同步」開窗，否則會被當成廣告擋掉，所以先開空白視窗、拿到網址再導過去。
 */
export const handleGoogleLogin = async (): Promise<{ success: boolean; message?: string }> => {
  const popup = typeof BroadcastChannel !== 'undefined' ? openLoginPopup() : null;
  if (!popup) return redirectLogin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
      skipBrowserRedirect: true,
      // 每次都讓使用者選帳號，方便切換 Google 帳號
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error || !data.url) {
    popup.close();
    console.error('Google 登入錯誤:', error);
    return { success: false, message: error?.message ?? '無法取得 Google 登入網址' };
  }

  popup.location.href = data.url;
  popup.focus();
  return { success: true };
};

// logout
export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    return { success: false, message: error.message };
  }
  return { success: true };
};

// 從 profiles 取得使用者資料
export const getUserData = async (
  uid: string
): Promise<{ success: boolean; data?: Profile; message?: string }> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle();

  if (error) {
    console.error('Error getting user data:', error);
    return { success: false, message: error.message };
  }
  if (!data) {
    return { success: false, message: '找不到使用者資料' };
  }
  return { success: true, data: rowToProfile(data) };
};

// 更新使用者資料（0010 起 email / 驗證狀態不能直接改，以 auth.users 為準，ensure_profile 會同步）
export const submitChange = async (
  uid: string,
  updated: Partial<Profile>
): Promise<{ success: boolean; message?: string }> => {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updated.name !== undefined) patch.name = updated.name;
  if (updated.photoURL !== undefined) patch.photo_url = updated.photoURL;
  if (updated.bgPhotoURL !== undefined) patch.bg_photo_url = updated.bgPhotoURL;
  if (updated.phoneNumber !== undefined) patch.phone_number = updated.phoneNumber;

  const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
  if (error) {
    console.error('Error updating user data:', error);
    return { success: false, message: error.message };
  }
  return { success: true };
};

// 同步 Google（auth）使用者資料至 profiles（email 與驗證狀態由 ensure_profile 從 auth.users 同步，這裡不寫）
export const syncGoogleUserData = async (user: AppUser) => {
  const { error } = await supabase
    .from('profiles')
    .update({
      name: user.displayName,
      photo_url: user.photoURL,
      // Google 帳號通常沒有電話，沒有時保留使用者自己填的
      ...(user.phoneNumber ? { phone_number: user.phoneNumber } : {}),
      creation_time: user.metadata.creationTime,
      last_sign_in_time: user.metadata.lastSignInTime,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.uid);

  if (error) {
    throw new Error(error.message);
  }
  return { success: true };
};

// 檢查是否為「從 Firebase 搬過來、且尚未提示過」的使用者；是的話標記為已提示並回傳 true
export const notifyMigrationOnce = async (uid: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('migrated, migration_notified')
    .eq('id', uid)
    .maybeSingle();

  if (error || !data) return false;
  if (data.migrated && !data.migration_notified) {
    await supabase.from('profiles').update({ migration_notified: true }).eq('id', uid);
    return true;
  }
  return false;
};

// 刪除帳戶（需 service_role，透過後端 API route 執行）
export const deleteAccount = async (_user?: AppUser) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch('/api/delete-account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || '刪除帳號失敗');
  }

  await supabase.auth.signOut();
  return { success: true };
};
