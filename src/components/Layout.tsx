"use client";

import { Toaster } from "react-hot-toast";
import AuthProvider from "./auth/AuthProvider";
import AuthGate from "./auth/AuthGate";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { LayoutData } from "@/types/Layout/Layout";

// 全站外框：登入狀態、導覽列、頁尾；只有內容區交給 AuthGate 擋
const Layout = ({ children }: LayoutData) => {
  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-grow">
          <AuthGate>{children}</AuthGate>
        </main>
        <Footer />
      </div>
      <Toaster />
    </AuthProvider>
  );
};

export default Layout;
