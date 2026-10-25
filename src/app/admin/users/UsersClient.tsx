"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "react-use";
import Link from "next/link";
import { Pagination } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faLock, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Loading/Spinner";
import RoleChip from "@/components/permissions/RoleChip";
import UserChip from "@/components/permissions/UserChip";
import useAuth from "@/components/auth/useAuth";
import { loadAdminUsers, loadSiteRoles } from "@/lib/admin/admin";
import { SITE, permissionName, SITE_PERMISSIONS } from "@/lib/permissions/bits";
import { sortRoles } from "@/lib/permissions/hierarchy";
import { showError } from "@/lib/errorDialog";
import { cn, formatDateTime } from "@/lib/utils";
import { AdminUserPage } from "@/types/Admin/Admin";
import { Role } from "@/types/Permission/Permission";
import NoPermission from "../_components/NoPermission";

const PAGE_SIZE = 20;

// 後台使用者列表：搜尋（email / 名稱 / @ID）+ 分頁，點一列進入詳情
const UsersClient = () => {
  const { can } = useAuth();
  const allowed = can(SITE.VIEW_USERS);

  const [keyword, setKeyword] = useState("");
  // 停止輸入 300ms 後才送出的搜尋字
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useDebounce(
    () => {
      const next = keyword.trim();
      if (next === search) return;
      setSearch(next);
      setPage(1);
    },
    300,
    [keyword]
  );

  // 目前的結果與它對應的條件；條件和畫面上的不同就是還在載入
  const [loaded, setLoaded] = useState<{ key: string; data: AdminUserPage }>();
  const requestKey = `${search}|${page}`;
  const loading = loaded?.key !== requestKey;
  // 連續換頁 / 搜尋時只採用最後一次請求
  const seq = useRef(0);

  useEffect(() => {
    if (!allowed) return;
    const current = ++seq.current;
    loadAdminUsers(search, (page - 1) * PAGE_SIZE, PAGE_SIZE).then((result) => {
      if (current !== seq.current) return;
      if (result.success) {
        setLoaded({ key: `${search}|${page}`, data: result.data });
      } else {
        setLoaded({ key: `${search}|${page}`, data: { total: 0, users: [] } });
        showError("載入使用者失敗", result.message);
      }
    });
  }, [allowed, search, page]);

  // 身分組 id → 身分組，用來顯示每個人的身分組標籤
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => {
    if (!allowed) return;
    loadSiteRoles().then((result) => {
      if (result.success) setRoles(result.data);
      else showError("載入身分組失敗", result.message);
    });
  }, [allowed]);
  const sortedRoles = useMemo(() => sortRoles(roles), [roles]);

  if (!allowed) return <NoPermission permission={permissionName(SITE_PERMISSIONS, SITE.VIEW_USERS)} />;

  const data = loaded?.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <PageHeader title="使用者" />

      {/* 搜尋 */}
      <label className="mb-3 flex items-center gap-2 rounded-[12px] bg-surface-1 px-3.5 py-2 text-[17px] text-ink-muted focus-within:ring-2 focus-within:ring-accent/40">
        <FontAwesomeIcon icon={faMagnifyingGlass} className="w-4 shrink-0" />
        <input
          type="search"
          aria-label="搜尋使用者"
          placeholder="搜尋 Email、名稱或 @ID"
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

      {!data ? (
        <Spinner block label="載入使用者…" />
      ) : data.users.length === 0 ? (
        <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">
          {search ? "沒有符合的使用者" : "還沒有使用者"}
        </div>
      ) : (
        <>
          <ul className={cn("divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface", loading && "opacity-60")}>
            {data.users.map((user) => {
              const userRoles = sortedRoles.filter((role) => user.role_ids.includes(role.id));
              return (
                <li key={user.id}>
                  <Link href={`/admin/users/${user.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-1">
                    <UserChip user={user} showEmail className="min-w-0 flex-1" />
                    {(user.is_owner || data.site_owner_id === user.id) && (
                      <span className="shrink-0 rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-accent" title="全站擁有者">擁有者</span>
                    )}
                    {userRoles.length > 0 && (
                      <div className="hidden max-w-56 flex-wrap justify-end gap-1 sm:flex">
                        {userRoles.map((role) => (
                          <RoleChip key={role.id} role={role} />
                        ))}
                      </div>
                    )}
                    <div className="shrink-0 text-right">
                      <p className="flex items-center justify-end gap-1.5 text-[17px] tabular-nums text-ink-muted">
                        {user.vault_enabled && <FontAwesomeIcon icon={faLock} className="w-3" aria-label="已設定加密密碼" />}
                        {user.totp_count} 筆
                      </p>
                      <p className="text-[13px] tabular-nums text-ink-muted">最後登入 {formatDateTime(user.last_login_at)}</p>
                      <p className="text-[13px] tabular-nums text-ink-muted">最後活動 {formatDateTime(user.last_active_at)}</p>
                    </div>
                    <FontAwesomeIcon icon={faChevronRight} className="w-2.5 shrink-0 text-ink-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
            <p className="text-[13px] text-ink-muted">共 {data.total} 位使用者</p>
            {pages > 1 && (
              <Pagination showControls variant="light" radius="full" page={page} total={pages} onChange={setPage} isDisabled={loading} />
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default UsersClient;
