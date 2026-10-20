"use client";

import { useEffect, useRef, useState } from "react";
import { useDebounce } from "react-use";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Loading/Spinner";
import UserChip from "@/components/permissions/UserChip";
import useAuth from "@/components/auth/useAuth";
import { loadAdminGroups } from "@/lib/admin/admin";
import { SITE, SITE_PERMISSIONS, permissionName } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import { cn, formatDateTime } from "@/lib/utils";
import { AdminGroup } from "@/types/Admin/Admin";
import NoPermission from "../_components/NoPermission";

// 所有群組；點一列開後台的群組管理頁（全站「管理所有群組」在群組裡有全部權限）
const GroupsAdminClient = () => {
  const { can } = useAuth();
  const allowed = can(SITE.MANAGE_GROUPS);

  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  useDebounce(() => setSearch(keyword.trim()), 300, [keyword]);

  // 結果與它對應的搜尋字；不同就是還在載入
  const [loaded, setLoaded] = useState<{ search: string; groups: AdminGroup[] }>();
  const loading = loaded?.search !== search;
  const seq = useRef(0);

  useEffect(() => {
    if (!allowed) return;
    const current = ++seq.current;
    loadAdminGroups(search).then((result) => {
      if (current !== seq.current) return;
      setLoaded({ search, groups: result.success ? result.data : [] });
      if (!result.success) showError("載入群組失敗", result.message);
    });
  }, [allowed, search]);

  if (!allowed) return <NoPermission permission={permissionName(SITE_PERMISSIONS, SITE.MANAGE_GROUPS)} />;

  return (
    <div>
      <PageHeader title="群組" />

      {/* 搜尋 */}
      <label className="mb-3 flex items-center gap-2 rounded-[12px] bg-surface-1 px-3.5 py-2 text-[17px] text-ink-muted focus-within:ring-2 focus-within:ring-accent/40">
        <FontAwesomeIcon icon={faMagnifyingGlass} className="w-4 shrink-0" />
        <input
          type="search"
          aria-label="搜尋群組"
          placeholder="搜尋群組名稱"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted"
        />
        {keyword && (
          <button type="button" onClick={() => setKeyword("")} aria-label="清除" className="hover:text-ink">
            <FontAwesomeIcon icon={faXmark} className="w-3.5" />
          </button>
        )}
      </label>

      {!loaded ? (
        <Spinner block label="載入群組…" />
      ) : loaded.groups.length === 0 ? (
        <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">
          {search ? "沒有符合的群組" : "還沒有群組"}
        </div>
      ) : (
        <>
          <ul className={cn("divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface", loading && "opacity-60")}>
            {loaded.groups.map((group) => (
              <li key={group.id}>
                <Link href={`/admin/groups/${group.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-1">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px]">{group.name}</p>
                    {group.description && <p className="truncate text-[15px] text-ink-muted">{group.description}</p>}
                  </div>
                  <UserChip user={group.owner} size="sm" className="hidden w-44 sm:flex" />
                  <div className="shrink-0 text-right">
                    <p className="text-[17px] tabular-nums text-ink-muted">
                      {group.member_count} 人・{group.account_count} 筆
                    </p>
                    <p className="text-[13px] tabular-nums text-ink-muted">{formatDateTime(group.created_at)}</p>
                  </div>
                  <FontAwesomeIcon icon={faChevronRight} className="w-2.5 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 px-1 text-[13px] text-ink-muted">共 {loaded.groups.length} 個群組</p>
        </>
      )}
    </div>
  );
};

export default GroupsAdminClient;
