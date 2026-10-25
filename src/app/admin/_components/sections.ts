import { faBell, faClockRotateLeft, faGauge, faPaperPlane, faPeopleGroup, faShieldHalved, faUsers } from "@fortawesome/free-solid-svg-icons";
import { SITE } from "@/lib/permissions/bits";
import { AdminNavItem } from "@/types/Admin/AdminNav";

// 後台的各個區塊：側欄與總覽頁的入口共用
export const ADMIN_SECTIONS: AdminNavItem[] = [
  {
    href: "/admin",
    text: "總覽",
    description: "後台首頁",
    icon: faGauge,
    permission: SITE.VIEW_ADMIN,
  },
  {
    href: "/admin/users",
    text: "使用者",
    description: "搜尋使用者、查看資料、指派身分組與管理 2FA",
    icon: faUsers,
    permission: SITE.VIEW_USERS,
  },
  {
    href: "/admin/roles",
    text: "身分組",
    description: "全站身分組與權限設定",
    icon: faShieldHalved,
    // 有進入後台就能看（唯讀），有「管理身分組」才能修改
    permission: SITE.VIEW_ADMIN,
  },
  {
    href: "/admin/groups",
    text: "群組",
    description: "查看與管理所有群組",
    icon: faPeopleGroup,
    permission: SITE.MANAGE_GROUPS,
  },
  {
    href: "/admin/notifications",
    text: "發送通知",
    description: "發送公告與推廣通知給指定的使用者或裝置",
    icon: faPaperPlane,
    permission: SITE.SEND_NOTIFICATIONS,
  },
  {
    href: "/admin/settings",
    text: "通知設定",
    description: "後台修改帳號時的通知與強制更新的最低 App 版本",
    icon: faBell,
    // 有進入後台就能看（唯讀），有「管理使用者」才能修改
    permission: SITE.VIEW_ADMIN,
  },
  {
    href: "/admin/audit",
    text: "操作紀錄",
    description: "全站操作紀錄",
    icon: faClockRotateLeft,
    permission: SITE.VIEW_AUDIT_LOG,
  },
];

/** 目前頁面是否屬於這個區塊（總覽只比對完全相同，其他用前綴） */
export const isSectionActive = (href: string, pathname: string) =>
  href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
