"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import useAuth from "@/components/auth/useAuth";
import { cn } from "@/lib/utils";
import { ADMIN_SECTIONS, isSectionActive } from "./sections";

// 後台導覽：桌機是左側一條窄側欄（選中的項目左邊亮一條磷光），手機變成頂部橫向 tabs；沒有權限的項目不顯示
const AdminNav = () => {
  const pathname = usePathname();
  const { can } = useAuth();

  return (
    <nav
      aria-label="後台導覽"
      className="-mx-5 border-b border-line px-5 md:sticky md:top-[4.5rem] md:mx-0 md:w-44 md:shrink-0 md:self-start md:border-b-0 md:border-r md:px-0 md:pr-4"
    >
      <p className="tech-label hidden pb-3 md:block">ADMIN // CONSOLE</p>
      <ul className="flex overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible">
        {ADMIN_SECTIONS.filter((section) => can(section.permission)).map((section) => {
          const active = isSectionActive(section.href, pathname);
          return (
            <li key={section.href} className="shrink-0">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // 手機：底線式 tab；桌機：左邊 2px 的側欄項目
                  "flex items-center gap-2.5 whitespace-nowrap border-b-2 px-3 py-2.5 font-display text-[13px] tracking-[0.12em] transition-colors md:border-b-0 md:border-l-2",
                  active
                    ? "border-phos text-phos md:bg-phos/10"
                    : "border-transparent text-ink-muted hover:text-ink md:hover:bg-ink/5"
                )}
              >
                <FontAwesomeIcon icon={section.icon} className="w-3.5" />
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
