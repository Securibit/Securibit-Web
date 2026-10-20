"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@heroui/react";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/permissions/bits";
import Themes from "./Themes";
import Sidebar from "./Sidebar/Sidebar";
import useAuth from "./auth/useAuth";

// 登入後才出現的主選單；perm 有值的還要有對應權限
const NAV_ITEMS = [
  { href: '/code', label: '驗證碼' },
  { href: '/addCode', label: '新增' },
  { href: '/groups', label: '群組' },
  { href: '/admin', label: '後台', perm: SITE.VIEW_ADMIN },
];

// 像 Apple 官網那條窄窄的導覽列：小字、很淡的分隔線
const Navbar = () => {
  const pathname = usePathname();
  const { user, profile, can, login, logout } = useAuth();
  // 優先顯示使用者在個人頁面改過的名稱與大頭照
  const displayName = profile?.name || user?.displayName;
  const photoURL = profile?.photoURL || user?.photoURL;

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // 前綴比對：/groups/xxx 也算在「群組」
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-surface/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-10 px-6 text-[16px] sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-[19px] font-semibold text-ink">
          <Image src="/imgs/bityo_bg_circle.png" alt="" width={1920} height={1920} className="h-7 w-auto" />
          Securibit
        </Link>

        {user && (
          <nav className="hidden items-center gap-8 md:flex">
            {NAV_ITEMS.filter((item) => !item.perm || can(item.perm)).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn("transition-opacity hover:opacity-100", isActive(item.href) ? "text-ink" : "text-ink/70")}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-6">
          <div className="hidden md:flex">
            <Themes />
          </div>

          {user ? (
            <>
              <Link href="/me/MyPage" className={cn("hidden items-center gap-2 md:flex", isActive('/me') ? "text-ink" : "text-ink/70 hover:text-ink")}>
                {photoURL ? (
                  <img src={photoURL} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  // 沒有大頭照時顯示名字的第一個字
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-1 text-[13px] font-semibold">
                    {displayName?.slice(0, 1) || '?'}
                  </span>
                )}
                <span className="max-w-[10rem] truncate">{displayName}</span>
              </Link>
              <button onClick={logout} className="hidden text-ink/70 hover:text-ink md:block">
                登出
              </button>
            </>
          ) : (
            <Button onPress={login} color="primary" radius="full" className="hidden h-9 px-5 text-[15px] font-medium md:flex">
              登入
            </Button>
          )}

          {/* 手機：開側欄 */}
          <button aria-label="開啟選單" onClick={() => setIsDrawerOpen(true)} className="text-ink md:hidden">
            <Bars3Icon className="h-6 w-6" />
          </button>
        </div>
      </div>

      <Sidebar isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen} />
    </header>
  );
};

export default Navbar;
