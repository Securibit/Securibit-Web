"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import Spinner from "@/components/ui/Loading/Spinner";
import { AuthGateProps } from "@/types/Auth/AuthGate";
import useAuth from "./useAuth";
import { showError } from "@/lib/errorDialog";

// 需要登入才能進的路徑（前綴比對）
const PROTECTED_ROUTES = ['/code', '/addCode', '/me'];

const isProtected = (pathname: string) =>
  PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

/**
 * 導向保護：受保護頁在確認登入前先顯示 Spinner，未登入就帶回首頁，
 * 避免先畫出空的內容再跳走。公開頁面直接放行。
 */
const AuthGate = (props: AuthGateProps) => {
  const { loading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // 這個分頁曾經登入過：之後變成未登入是使用者自己登出（或在別的分頁登出、刪除帳戶），不算錯誤
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (user) wasSignedIn.current = true;
  }, [user]);

  const guarded = isProtected(pathname);
  const needLogin = guarded && !loading && !user;

  useEffect(() => {
    if (!needLogin) return;

    // 只有一開始就沒登入、直接打網址進來才提示
    if (!wasSignedIn.current) {
      showError('請先登入', '這個頁面需要登入才能使用，請先使用 Google 登入。');
    }
    // 用 replace：未登入的頁面不該留在上一頁的歷史裡
    router.replace('/');
  }, [needLogin, router]);

  if (!guarded) return <>{props.children}</>;

  if (loading || needLogin) {
    return <Spinner block label="確認登入狀態…" />;
  }

  return <>{props.children}</>;
};

export default AuthGate;
