"use client";

import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader } from "@heroui/react";
import { usePathname } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import {
  ArrowLeftEndOnRectangleIcon,
  ArrowRightStartOnRectangleIcon,
  DocumentTextIcon,
  HomeIcon,
  InformationCircleIcon,
  KeyIcon,
  PlusCircleIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/permissions/bits";
import { SidebarListItemProps, SidebarProps } from "@/types/Sidebar/Sidebar";
import useAuth from "../auth/useAuth";
import Themes from "../Themes";

const SidebarListItem = (props: SidebarListItemProps) => {
  const router = useRouter();

  return (
    <button
      onClick={() => {
        props.onClick?.();
        if (props.link) router.push(props.link);
      }}
      className={cn(
        "flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left font-display text-sm tracking-[0.08em] transition-colors",
        props.active
          ? "border-phos bg-phos/10 text-phos"
          : "border-transparent text-ink-muted hover:bg-ink/5 hover:text-ink"
      )}
    >
      <props.icon className="h-5 w-5" />
      <span className="flex-1">{props.text}</span>
    </button>
  );
};

// 手機版側欄：依登入狀態顯示可用項目
const Sidebar = (props: SidebarProps) => {
  const pathname = usePathname();
  const { user, profile, can, login, logout } = useAuth();

  const closeDrawer = () => props.setIsDrawerOpen(false);

  // 前綴比對：/groups/xxx 也算在「群組」；首頁只在完全相等時亮
  const isActive = (link: string) =>
    link === "/" ? pathname === "/" : pathname === link || pathname.startsWith(`${link}/`);

  const links = [
    { icon: HomeIcon, text: "首頁", link: "/" },
    ...(user
      ? [
          { icon: KeyIcon, text: "驗證碼", link: "/code" },
          { icon: PlusCircleIcon, text: "新增驗證碼", link: "/addCode" },
          { icon: UserGroupIcon, text: "群組", link: "/groups" },
          ...(can(SITE.VIEW_ADMIN) ? [{ icon: ShieldCheckIcon, text: "後台", link: "/admin" }] : []),
          { icon: UserCircleIcon, text: "個人頁面", link: "/me/MyPage" },
        ]
      : []),
    { icon: InformationCircleIcon, text: "關於我們", link: "/about" },
    { icon: DocumentTextIcon, text: "免責聲明", link: "/disclaimer" },
  ];

  return (
    <Drawer
      isOpen={props.isDrawerOpen}
      onOpenChange={(open) => props.setIsDrawerOpen(open)}
      placement="right"
      size="xs"
      radius="none"
      className="border-l border-line bg-surface-1 text-ink"
    >
      <DrawerContent>
        <DrawerHeader className="flex flex-col gap-1 border-b border-line">
          <span className="font-display text-sm font-semibold tracking-[0.22em]">SECURIBIT</span>
          {user ? (
            <span className="flex items-center gap-2 text-sm font-normal text-ink-muted">
              <span className="led" />
              {profile?.name || user.displayName}
            </span>
          ) : (
            <span className="tech-label">TOTP 2FA</span>
          )}
        </DrawerHeader>
        <DrawerBody className="gap-0.5 px-2 py-3">
          {links.map((item) => (
            <SidebarListItem
              key={item.link}
              {...item}
              active={isActive(item.link)}
              onClick={closeDrawer}
            />
          ))}
        </DrawerBody>
        <DrawerFooter className="flex flex-col items-stretch gap-3 border-t border-line px-2">
          <div className="px-3">
            <Themes showLabel />
          </div>
          {user ? (
            <SidebarListItem
              icon={ArrowRightStartOnRectangleIcon}
              text="登出"
              onClick={() => {
                closeDrawer();
                logout();
              }}
            />
          ) : (
            <SidebarListItem
              icon={ArrowLeftEndOnRectangleIcon}
              text="使用 Google 登入"
              onClick={() => {
                closeDrawer();
                login();
              }}
            />
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default Sidebar;
