"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faCopy,
  faGear,
  faKey,
  faPowerOff,
  faShieldHalved,
  faUser,
  faUserGroup,
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import useAuth from "./auth/useAuth";
import RoleChip from "./permissions/RoleChip";
import Themes from "./Themes";

// 滑鼠離開後等一下再關，讓游標可以從按鈕移到彈出的面板
const CLOSE_DELAY = 150;

// 導覽列右邊的使用者：身分組、頭貼、名字框在一個圓角裡，滑鼠移上去（或點一下）彈出帳戶選單
const UserMenu = () => {
  const pathname = usePathname();
  const { user, profile, siteRoles, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);

  // 換頁就關掉
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  // 點外面或按 Esc 關掉（觸控裝置沒有 hover，靠點擊開關）
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  if (!user) return null;

  // 優先顯示使用者在個人頁面改過的名稱與大頭照
  const displayName = profile?.name || user.displayName;
  const photoURL = profile?.photoURL || user.photoURL;
  // 最高的全站身分組（例如「管理員」）；siteRoles 由高到低、不含 @everyone
  const topRole = siteRoles[0];

  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已複製", { position: "top-right" });
    } catch {
      showError("無法複製", `瀏覽器不允許存取剪貼簿，請手動複製${label}。`);
    }
  };
  const copyUid = () => copyText(user.uid, "使用者 ID");

  const avatar = (size: string, text: string) =>
    photoURL ? (
      <img src={photoURL} alt="" referrerPolicy="no-referrer" className={cn(size, "shrink-0 rounded-full object-cover")} />
    ) : (
      // 沒有大頭照時顯示名字的第一個字
      <span className={cn(size, text, "flex shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-accent-ink")}>
        {displayName?.slice(0, 1) || "?"}
      </span>
    );

  const items = [
    { href: "/me/MyPage", label: "個人頁面", icon: faUser },
    { href: "/me/update_info", label: "帳戶設定", icon: faGear },
    { href: "/code", label: "驗證碼", icon: faKey },
    { href: "/groups", label: "群組", icon: faUserGroup },
    ...(can(SITE.VIEW_ADMIN) ? [{ href: "/admin", label: "後台", icon: faShieldHalved }] : []),
  ];

  return (
    <div ref={rootRef} className="relative hidden md:block" onMouseEnter={show} onMouseLeave={hide}>
      {/* 觸發：身分組在頭貼左邊，整組框在圓角裡 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full border pl-1.5 pr-3 transition-colors",
          open ? "border-line bg-surface-1" : "border-line/70 hover:bg-surface-1"
        )}
      >
        {topRole && <RoleChip role={topRole} />}
        {avatar("h-7 w-7", "text-[12px]")}
        <span className="max-w-[9rem] truncate text-[15px]">{displayName}</span>
        <FontAwesomeIcon icon={faChevronDown} className={cn("w-2.5 text-ink-muted transition-transform", open && "rotate-180")} />
      </button>

      {/* 彈出的帳戶選單 */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 w-80 pt-2"
        >
          <div className="overflow-hidden rounded-[18px] border border-line/70 bg-surface shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]">
            {/* 身分 */}
            <div className="flex items-center gap-3 px-4 pt-4">
              {avatar("h-12 w-12", "text-[18px]")}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold">{displayName}</p>
                <button type="button" onClick={copyUid} title="點一下複製" className="flex max-w-full items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
                  <span className="truncate tabular-nums">UID: {user.uid.slice(0, 8)}</span>
                  <FontAwesomeIcon icon={faCopy} className="w-3 shrink-0" />
                </button>
                {/* 使用者自己設的 @ID 放在 UID 下面 */}
                {profile?.username ? (
                  <button type="button" onClick={() => copyText(`@${profile.username}`, "@ID")} title="點一下複製" className="flex max-w-full items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
                    <span className="truncate">@{profile.username}</span>
                    <FontAwesomeIcon icon={faCopy} className="w-3 shrink-0" />
                  </button>
                ) : (
                  <Link href="/me/update_info" className="block truncate text-[13px] text-accent hover:underline">設定你的 @ID</Link>
                )}
              </div>
            </div>

            {/* 身分組 */}
            <div className="mx-4 mt-3 rounded-[12px] bg-surface-1 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {siteRoles.length > 0 ? (
                  siteRoles.map((role) => <RoleChip key={role.id} role={role} />)
                ) : (
                  <span className="text-[13px] text-ink-muted">一般使用者</span>
                )}
              </div>
            </div>

            {/* 選單 */}
            <nav className="mt-2 px-2">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] text-ink hover:bg-surface-1"
                >
                  <FontAwesomeIcon icon={item.icon} className="w-4 text-ink-muted" />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-2 border-t border-line/60 px-2 py-2">
              <div className="px-3 py-2">
                <Themes showLabel />
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[15px] text-alarm hover:bg-surface-1"
              >
                <FontAwesomeIcon icon={faPowerOff} className="w-4" />
                登出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
