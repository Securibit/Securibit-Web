"use client";

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
import UserMenu from "./UserMenu";
import NotificationBell from "./NotificationBell";

// 登入後才出現的主選單；perm 有值的還要有對應權限
const NAV_ITEMS = [
  { href: '/code', label: '驗證碼' },
  { href: '/addCode', label: '新增' },
  { href: '/groups', label: '群組' },
  { href: '/admin', label: '後台', perm: SITE.VIEW_ADMIN },
];

// 不用登入也看得到的項目
const PUBLIC_NAV_ITEMS = [{ href: '/download', label: '下載' }];

// 像 Apple 官網那條窄窄的導覽列：小字、很淡的分隔線
const Navbar = () => {
  const pathname = usePathname();
  const { user, can, login } = useAuth();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // 前綴比對：/groups/xxx 也算在「群組」
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-surface/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-10 px-6 text-[16px] sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-[19px] font-semibold text-ink">
          <Image src="/imgs/logo.svg" alt="" width={28} height={28} className="h-7 w-7" />
          Securibit
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {[...(user ? NAV_ITEMS.filter((item) => !item.perm || can(item.perm)) : []), ...PUBLIC_NAV_ITEMS].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("transition-opacity hover:opacity-100", isActive(item.href) ? "text-ink" : "text-ink/70")}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-6">
          <div className="hidden md:flex">
            <Themes />
          </div>
          <NotificationBell />

          {user ? (
            <UserMenu />
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
