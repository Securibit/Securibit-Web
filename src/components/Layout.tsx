"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "react-hot-toast";
import AuthProvider from "./auth/AuthProvider";
import AuthGate from "./auth/AuthGate";
import VaultProvider from "./vault/VaultProvider";
import ErrorDialogHost from "./ui/Modal/ErrorDialogHost";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { LayoutData } from "@/types/Layout/Layout";

// 這些頁面自己排版，不套導覽列、頁尾，也不包 AuthProvider（例如登入彈窗的落地頁）
const BARE_ROUTES = ['/auth/callback'];

// 全站外框：登入狀態、導覽列、頁尾；只有內容區交給 AuthGate 擋
const Layout = ({ children }: LayoutData) => {
  const pathname = usePathname();

  if (BARE_ROUTES.includes(pathname)) return <>{children}</>;

  return (
    <AuthProvider>
      <VaultProvider>
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <main className="flex-grow">
            <AuthGate>{children}</AuthGate>
          </main>
          <Footer />
        </div>
        {/* 成功訊息用 toast，錯誤一律用要按確定的對話框 */}
        <Toaster />
        <ErrorDialogHost />
      </VaultProvider>
    </AuthProvider>
  );
};

export default Layout;
