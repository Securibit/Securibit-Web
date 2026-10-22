"use client";

import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { supabase } from "@/config/supabase";
import {
  AUTH_CHANNEL,
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
import { AuthPopupMessage } from "@/types/Auth/AuthPopup";
import { showError } from "@/lib/errorDialog";
import { rpc } from "@/lib/rpc";
import { has } from "@/lib/permissions/bits";
import { SiteAccess } from "@/types/Auth/Auth";

// 資料庫還沒有全站權限功能、或讀取失敗時：沒有任何全站權限
const NO_ACCESS: SiteAccess = { permissions: 0, top_position: 0, roles: [] };

const loadAccess = async () => {
  const result = await rpc<SiteAccess | null>('me_permissions');
  return result.success && result.data ? result.data : NO_ACCESS;
};

// 掛在 Layout 最外層，全站只訂閱一次 Supabase 登入狀態，換頁不會重新抓
export const AuthContext = createContext<AuthContextValue | null>(null);

const AuthProvider = (props: AuthProviderProps) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AppUser>();
  const [profile, setProfile] = useState<Profile>();
  const [access, setAccess] = useState<SiteAccess>(NO_ACCESS);
  // 已載入過 profile 的 uid；切回分頁時 Supabase 會再發一次 SIGNED_IN，不必重抓
  const loadedUid = useRef<string | null>(null);
  // 這個分頁是否開了登入彈窗；同時開好幾個分頁時，只由發起的那個顯示提示、記錄登入
  const popupPending = useRef(false);

  const loadProfile = useCallback(async (uid: string) => {
    // 先確保 profile 存在（沒有就依 email 接回舊資料），再讀取
    await ensureProfile();
    const [result, nextAccess] = await Promise.all([getUserData(uid), loadAccess()]);
    setProfile(result.success ? result.data : undefined);
    setAccess(nextAccess);
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
        setAccess(NO_ACCESS);
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
        // 載入丟例外（例如網路斷線）也要結束 loading，否則整站會一直卡在載入畫面
        try {
          await loadProfile(sUser.id);
        } catch (error) {
          console.error('載入使用者資料失敗:', error);
          // 清掉，下次 SIGNED_IN（例如切回分頁）會再試一次
          loadedUid.current = null;
          showError('載入使用者資料失敗', '請檢查網路連線後重新整理頁面');
          return;
        } finally {
          setLoading(false);
        }

        if (await notifyMigrationOnce(sUser.id).catch(() => false)) {
          toast.success('已將您的資料遷移至新資料庫！', { position: 'top-right', duration: 6000 });
        }
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  // 接收彈出視窗登入的結果（/auth/callback 送來）
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.onmessage = async (event: MessageEvent<AuthPopupMessage>) => {
      // 只接受「這個分頁自己開了登入彈窗」之後的結果；沒發起過就忽略，
      // 避免別的頁面送來的 session 把這個分頁換成別人的帳號（登入 CSRF）。
      // 其他分頁不需要這則訊息：Supabase 自己會跨分頁同步登入狀態
      if (!popupPending.current) return;
      popupPending.current = false;
      const message = event.data;

      if (message.type === 'signed-in') {
        // 把彈窗拿到的 session 套到這個分頁，會觸發 onAuthStateChange 載入 profile
        const { error } = await supabase.auth.setSession({
          access_token: message.accessToken,
          refresh_token: message.refreshToken,
        });
        if (error) {
          showError('登入失敗', error.message);
          return;
        }
        toast.success('登入成功！', { position: 'top-right' });
        recordLogin();
      } else if (message.type === 'error') {
        showError('登入失敗', message.message);
      }
    };

    return () => channel.close();
  }, []);

  const refresh = useCallback(async () => {
    return user ? loadProfile(user.uid) : undefined;
  }, [user, loadProfile]);

  // 登入（成功提示會在轉向回來後顯示，這裡只處理「立即失敗」如 provider 未啟用）
  const login = useCallback(async () => {
    popupPending.current = true;
    const result = await handleGoogleLogin();
    if (!result.success) {
      popupPending.current = false;
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

  const can = useCallback((bit: number) => has(access.permissions, bit), [access.permissions]);

  return (
    <AuthContext.Provider
      value={{
        loading,
        user,
        profile,
        permissions: access.permissions,
        topPosition: access.top_position,
        siteRoles: access.roles,
        can,
        refresh,
        login,
        logout,
      }}
    >
      {props.children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
