"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { faKey, faPlus, faRightFromBracket, faShieldHalved, faUserGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "@heroui/react";
import { Bars3Icon } from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/permissions/bits";
import Themes from "./Themes";
import Sidebar from "./Sidebar/Sidebar";
import useAuth from "./auth/useAuth";

// 登入後才出現的主選單；perm 有值的還要有對應權限
const NAV_ITEMS = [
  { href: '/code', label: '驗證碼', icon: faKey },
  { href: '/addCode', label: '新增', icon: faPlus },
  { href: '/groups', label: '群組', icon: faUserGroup },
  { href: '/admin', label: '後台', icon: faShieldHalved, perm: SITE.VIEW_ADMIN },
];

// 頂部儀表列：左邊字標與狀態燈，中間主選單，右邊主題切換與使用者
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
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
        {/* 字標 */}
        <Link href="/" className="flex items-center gap-2.5 text-ink transition-colors hover:text-phos">
          <Image
            src="/imgs/bityo_bg_circle.png"
            alt="Securibit"
            width={1920}
            height={1920}
            className="h-6 w-auto"
          />
          <span className="font-display text-sm font-semibold tracking-[0.22em]">SECURIBIT</span>
          <span className="tech-label hidden sm:inline">TOTP 2FA</span>
        </Link>

        {/* 主選單（桌機） */}
        {user && (
          <nav className="ml-4 hidden h-full items-center md:flex">
            {NAV_ITEMS.filter((item) => !item.perm || can(item.perm)).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex h-14 items-center gap-2 px-3 font-display text-[13px] tracking-[0.12em] transition-colors",
                  isActive(item.href)
                    ? "text-phos after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-phos"
                    : "text-ink-muted hover:text-ink"
                )}
              >
                <FontAwesomeIcon icon={item.icon} className="w-3.5" />
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden md:flex">
            <Themes />
          </div>

          {user ? (
            <>
              {/* 個人檔案 */}
              <Link
                href="/me/MyPage"
                className={cn(
                  "hidden h-8 items-center gap-2 border pl-1 pr-3 transition-colors md:flex",
                  isActive('/me') ? "border-phos text-phos" : "border-line text-ink hover:border-line-strong"
                )}
              >
                {photoURL ? (
                  <img src={photoURL} alt="大頭照" referrerPolicy="no-referrer" className="h-6 w-6 object-cover" />
                ) : (
                  // 沒有大頭照時顯示名字的第一個字
                  <span className="flex h-6 w-6 items-center justify-center bg-phos font-display text-xs font-bold text-phos-ink">
                    {displayName?.slice(0, 1) || '?'}
                  </span>
                )}
                <span className="max-w-[10rem] truncate font-display text-[13px] tracking-wide">{displayName}</span>
                <span className="led" aria-label="已登入" />
              </Link>

              {/* 登出 */}
              <button
                onClick={logout}
                aria-label="登出"
                title="登出"
                className="hidden h-8 w-8 items-center justify-center border border-line text-ink-muted transition-colors hover:border-alarm hover:text-alarm md:flex"
              >
                <FontAwesomeIcon icon={faRightFromBracket} className="w-3.5" />
              </button>
            </>
          ) : (
            <Button
              onPress={login}
              color="primary"
              variant="bordered"
              size="sm"
              className="hidden font-display tracking-[0.12em] md:flex"
            >
              登入
            </Button>
          )}

          {/* 手機：開側欄 */}
          <Button
            isIconOnly
            variant="light"
            aria-label="開啟選單"
            onPress={() => setIsDrawerOpen(true)}
            className="text-ink md:hidden"
          >
            <Bars3Icon className="h-6 w-6" />
          </Button>
        </div>
      </div>

      <Sidebar isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen} />
    </header>
  );
};

export default Navbar;
