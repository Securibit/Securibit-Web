"use client";

import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { supabase } from "@/config/supabase";
import {
  ensureProfile,
  getUserData,
  handleGoogleLogin,
  logout as signOut,
  notifyMigrationOnce,
  recordLogin,
} from "@/lib/totp/account";
import { AppUser, toAppUser } from "@/types/authUser";
import { Profile } from "@/types/Profile/Profile";
import { AuthContextValue } from "@/types/Auth/Auth";
import { AuthProviderProps } from "@/types/Auth/AuthProvider";
import { showError } from "@/lib/errorDialog";

// 掛在 Layout 最外層，全站只訂閱一次 Supabase 登入狀態，換頁不會重新抓
export const AuthContext = createContext<AuthContextValue | null>(null);

const AuthProvider = (props: AuthProviderProps) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AppUser>();
  const [profile, setProfile] = useState<Profile>();
  // 已載入過 profile 的 uid；切回分頁時 Supabase 會再發一次 SIGNED_IN，不必重抓
  const loadedUid = useRef<string | null>(null);

  const loadProfile = useCallback(async (uid: string) => {
    // 先確保 profile 存在（沒有就依 email 接回舊資料），再讀取
    await ensureProfile();
    const result = await getUserData(uid);
    setProfile(result.success ? result.data : undefined);
    if (!result.success) {
      showError('載入使用者資料失敗', result.message);
    }
    return result.data;
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const sUser = session?.user;

      if (!sUser) {
        loadedUid.current = null;
        setUser(undefined);
        setProfile(undefined);
        setLoading(false);
        return;
      }

      setUser(toAppUser(sUser));

      // 轉向回來、session 真的建立後才顯示一次「登入成功」並記錄登入
      // （Supabase 建議不要在這個 callback 裡直接呼叫其他 supabase API，會互相鎖住，所以丟到下一輪）
      if (sessionStorage.getItem('pendingLogin')) {
        sessionStorage.removeItem('pendingLogin');
        toast.success('登入成功！', { position: 'top-right' });
        setTimeout(recordLogin, 0);
      }

      if (loadedUid.current === sUser.id) return;
      loadedUid.current = sUser.id;

      setTimeout(async () => {
        await loadProfile(sUser.id);
        setLoading(false);

        if (await notifyMigrationOnce(sUser.id)) {
          toast.success('已將您的資料遷移至新資料庫！', { position: 'top-right', duration: 6000 });
        }
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    return user ? loadProfile(user.uid) : undefined;
  }, [user, loadProfile]);

  // 登入（成功提示會在轉向回來後顯示，這裡只處理「立即失敗」如 provider 未啟用）
  const login = useCallback(async () => {
    const result = await handleGoogleLogin();
    if (!result.success) {
      showError('登入失敗', result.message);
    }
  }, []);

  const logout = useCallback(async () => {
    const result = await signOut();
    if (result.success) {
      toast.success('登出成功！', { position: 'top-right' });
      router.push('/');
    } else {
      showError('登出失敗', result.message);
    }
  }, [router]);

  return (
    <AuthContext.Provider value={{ loading, user, profile, refresh, login, logout }}>
      {props.children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
