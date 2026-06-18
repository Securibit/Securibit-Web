import React, { useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  Chip,
} from "@heroui/react";
import { SidebarListItemProps, SidebarProps } from "@/types/Sidebar/Sidebar";
import { useRouter } from "next/navigation";
import { CurrencyDollarIcon } from "@heroicons/react/24/solid";

const SidebarListItem = (props: SidebarListItemProps) => {
  const router = useRouter();

  return (
    <button
      disabled={props.disabled}
      onClick={() => {
        props.onClick && props.onClick();
        router.push(props.link);
      }}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
    >
      <props.icon className="h-5 w-5" />
      <span className="flex-1">{props.text}</span>
      {props.chip && (
        <Chip size={props.chip.size} variant="flat" className="rounded-full">
          {props.chip.value}
        </Chip>
      )}
    </button>
  );
};

const Sidebar = (props: SidebarProps) => {
  const router = useRouter();

  useEffect(() => {
    // 與外部受控狀態同步（HeroUI Drawer 由 isOpen 控制）
  }, [props.isDrawerOpen]);

  const closeDrawer = () => props.setIsDrawerOpen(false);

  return (
    <Drawer
      isOpen={props.isDrawerOpen}
      onOpenChange={(open) => props.setIsDrawerOpen(open)}
      placement="right"
      className="text-white dark:bg-blue-gray-900"
    >
      <DrawerContent>
        <DrawerHeader>
          <button
            className="flex items-center gap-4"
            onClick={() => {
              router.push("/");
              closeDrawer();
            }}
          >
            <span className="text-xl font-semibold text-black dark:text-white">
              Bityo
            </span>
          </button>
        </DrawerHeader>
        <DrawerBody className="dark:text-blue-gray-100">
          <SidebarListItem
            icon={CurrencyDollarIcon}
            text={"驗證碼"}
            link={"/code"}
            disabled={false}
            onClick={() => {
              router.push("/code");
              closeDrawer();
            }}
          />

          <SidebarListItem
            icon={CurrencyDollarIcon}
            text={"新增驗證碼"}
            link={"/addCode"}
            disabled={false}
            onClick={() => {
              router.push("/addCode");
              closeDrawer();
            }}
          />

          <SidebarListItem
            icon={CurrencyDollarIcon}
            text={"我的頁面"}
            link={"/me/MyPage"}
            disabled={false}
            onClick={() => {
              router.push("/me/MyPage");
              closeDrawer();
            }}
          />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default Sidebar;
