import { UserData } from '@/components/CheckLogin';
import { supabase } from '@/config/supabase';
import { AppUser, toAppUser } from '@/types/authUser';

// 將 profiles 資料列（snake_case）轉成 App 內部使用的 UserData
const rowToUserData = (row: any): UserData => ({
  uid: row.id,
  name: row.name ?? '',
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
  totp: row.totp ?? [],
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

// 確保使用者有 profile（沒有就依 email 自我修復、接回舊資料）。冪等、可重複呼叫。
export const ensureProfile = async () => {
  const { error } = await supabase.rpc('ensure_profile');
  if (error) console.error('ensure_profile 失敗:', error.message);
};

// 驗證是否登入並載入使用者資料（對應原 onAuthStateChanged 行為）
export const checkAuth = (
  callback: (user: AppUser | undefined, userData?: UserData) => void
): (() => void) => {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (_event, session) => {
    const sUser = session?.user;
    if (sUser) {
      const appUser = toAppUser(sUser);
      // 先確保 profile 存在，再讀取
      await ensureProfile();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sUser.id)
        .maybeSingle();

      if (!error && data) {
        callback(appUser, rowToUserData(data));
      } else {
        callback(appUser);
      }
    } else {
      callback(undefined);
    }
  });

  return () => subscription.unsubscribe();
};

// login（Google OAuth 轉向流程）
export const handleGoogleLogin = async () => {
  // 設旗標：轉向回來、session 真的建立後，才由 _app 顯示「登入成功」
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('pendingLogin', '1');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });

  if (error) {
    if (typeof window !== 'undefined') sessionStorage.removeItem('pendingLogin');
    console.error('Google 登入錯誤:', error);
    return { success: false, message: error.message };
  }
  // 成功後瀏覽器會轉向至 Google，回來時自動建立 session（不在此處顯示成功提示）
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
): Promise<{ success: boolean; data?: UserData; message?: string }> => {
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
  return { success: true, data: rowToUserData(data) };
};

// 更新使用者資料
export const submitChange = async (
  uid: string,
  updated: Partial<UserData>
): Promise<{ success: boolean; message?: string }> => {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updated.name !== undefined) patch.name = updated.name;
  if (updated.email !== undefined) patch.email = updated.email;
  if (updated.photoURL !== undefined) patch.photo_url = updated.photoURL;
  if (updated.bgPhotoURL !== undefined) patch.bg_photo_url = updated.bgPhotoURL;
  if (updated.phoneNumber !== undefined) patch.phone_number = updated.phoneNumber;
  if (updated.emailVerified !== undefined) patch.email_verified = updated.emailVerified;

  const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
  if (error) {
    console.error('Error updating user data:', error);
    return { success: false, message: error.message };
  }
  return { success: true };
};

// 同步 Google（auth）使用者資料至 profiles
export const syncGoogleUserData = async (user: AppUser) => {
  const { error } = await supabase
    .from('profiles')
    .update({
      name: user.displayName,
      email: user.email,
      photo_url: user.photoURL,
      email_verified: user.emailVerified,
      phone_number: user.phoneNumber ?? '',
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
