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
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
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
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10",
        props.active && "bg-tpp/15 text-tpp"
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
  const { user, profile, login, logout } = useAuth();

  const closeDrawer = () => props.setIsDrawerOpen(false);

  const links = [
    { icon: HomeIcon, text: "首頁", link: "/" },
    ...(user
      ? [
          { icon: KeyIcon, text: "驗證碼", link: "/code" },
          { icon: PlusCircleIcon, text: "新增驗證碼", link: "/addCode" },
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
      className="text-black dark:text-white dark:bg-gray-blue-900"
    >
      <DrawerContent>
        <DrawerHeader className="flex flex-col gap-1">
          <span className="text-xl font-semibold">TOTP 2FA 驗證器</span>
          {user && (
            <span className="text-sm font-normal text-gray-blue-500 dark:text-gray-blue-400">
              {profile?.name || user.displayName}
            </span>
          )}
        </DrawerHeader>
        <DrawerBody className="gap-1">
          {links.map((item) => (
            <SidebarListItem
              key={item.link}
              {...item}
              active={pathname === item.link}
              onClick={closeDrawer}
            />
          ))}
        </DrawerBody>
        <DrawerFooter className="flex flex-col items-stretch gap-3">
          <div className="px-3">
            <Themes />
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
