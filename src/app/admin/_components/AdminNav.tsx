"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import useAuth from "@/components/auth/useAuth";
import { cn } from "@/lib/utils";
import { ADMIN_SECTIONS, isSectionActive } from "./sections";

// 後台導覽：手機在上方橫向捲動，桌面在左側；沒有權限的項目不顯示
const AdminNav = () => {
  const pathname = usePathname();
  const { can } = useAuth();

  return (
    <nav
      aria-label="後台導覽"
      className="-mx-5 overflow-x-auto px-5 md:sticky md:top-6 md:mx-0 md:w-48 md:shrink-0 md:self-start md:overflow-visible md:px-0"
    >
      <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wider text-gray-blue-500 md:block dark:text-gray-blue-400">
        後台
      </p>
      <ul className="flex gap-1 md:flex-col">
        {ADMIN_SECTIONS.filter((section) => can(section.permission)).map((section) => {
          const active = isSectionActive(section.href, pathname);
          return (
            <li key={section.href} className="shrink-0">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-gray-blue-700 transition-colors hover:bg-black/5 dark:text-gray-blue-200 dark:hover:bg-white/10",
                  active && "bg-tpp/15 text-tpp hover:bg-tpp/20 dark:text-tpp dark:hover:bg-tpp/20"
                )}
              >
                <FontAwesomeIcon icon={section.icon} className="w-4" />
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
