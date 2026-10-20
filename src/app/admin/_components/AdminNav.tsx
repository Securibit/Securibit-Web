"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import { Tab, Tabs } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import useAuth from "@/components/auth/useAuth";
import { cn } from "@/lib/utils";
import { ADMIN_SECTIONS, isSectionActive } from "./sections";

// 後台導覽：桌機是左側一條側欄（像 macOS 系統設定，選中的列是藍底白字），手機變成頂部分段控制；沒有權限的項目不顯示
const AdminNav = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = useAuth();

  const sections = ADMIN_SECTIONS.filter((section) => can(section.permission));
  const activeHref = sections.find((section) => isSectionActive(section.href, pathname))?.href ?? "/admin";

  return (
    <nav aria-label="後台導覽" className="md:sticky md:top-24 md:w-52 md:shrink-0 md:self-start">
      {/* 手機：頂部分段控制 */}
      <Tabs
        aria-label="後台導覽"
        variant="light"
        radius="full"
        selectedKey={activeHref}
        onSelectionChange={(key) => router.push(String(key))}
        classNames={{ base: "md:hidden", tabList: "bg-surface-1 p-1", cursor: "bg-surface" }}
      >
        {sections.map((section) => (
          <Tab key={section.href} title={section.text} />
        ))}
      </Tabs>

      {/* 桌機：側欄 */}
      <ul className="hidden flex-col gap-0.5 md:flex">
        {sections.map((section) => {
          const active = section.href === activeHref;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] px-3 py-1.5 text-[15px]",
                  active ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-1"
                )}
              >
                <FontAwesomeIcon icon={section.icon} className={cn("w-4", !active && "text-ink-muted")} />
                {section.text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default AdminNav;
