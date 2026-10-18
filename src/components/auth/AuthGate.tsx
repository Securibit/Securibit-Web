"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import Spinner from "@/components/ui/Loading/Spinner";
import { AuthGateProps } from "@/types/Auth/AuthGate";
import useAuth from "./useAuth";

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

  const guarded = isProtected(pathname);
  const needLogin = guarded && !loading && !user;

  useEffect(() => {
    if (!needLogin) return;

    toast.error('請先登入！', { position: 'top-right' });
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
