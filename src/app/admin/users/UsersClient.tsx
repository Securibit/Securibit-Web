"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "react-use";
import { useRouter } from "nextjs-toploader/app";
import { Input, Pagination, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
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

// 後台使用者列表：搜尋（email / 名稱 / @ID）+ 分頁表格，點一列進入詳情
const UsersClient = () => {
  const { can } = useAuth();
  const allowed = can(SITE.VIEW_USERS);
  const router = useRouter();

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
    <div className="boot">
      <PageHeader index="01 // USERS" title="使用者" subtitle={data ? `共 ${data.total} 位使用者` : undefined} />

      <Input
        aria-label="搜尋使用者"
        placeholder="搜尋 Email、名稱或 @ID"
        variant="bordered"
        value={keyword}
        onValueChange={setKeyword}
        isClearable
        onClear={() => setKeyword("")}
        startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="w-3.5 text-ink-dim" />}
        classNames={{ input: "font-mono text-sm" }}
        className="mb-4 sm:max-w-sm"
      />

      {!data ? (
        <Spinner block label="載入使用者…" />
      ) : (
        <Table
          aria-label="使用者列表"
          onRowAction={(key) => router.push(`/admin/users/${String(key)}`)}
          bottomContentPlacement="outside"
          classNames={{
            wrapper: "border border-line bg-surface-1 p-0 shadow-none",
            th: "tech-label h-9 bg-surface-2 first:rounded-none last:rounded-none",
            tr: "cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-ink/5",
            td: "py-3",
          }}
          bottomContent={
            pages > 1 && (
              <div className="flex justify-center">
                <Pagination showControls variant="bordered" page={page} total={pages} onChange={setPage} isDisabled={loading} />
              </div>
            )
          }
        >
          <TableHeader>
            <TableColumn>使用者</TableColumn>
            <TableColumn>身分組</TableColumn>
            <TableColumn align="end">驗證碼</TableColumn>
            <TableColumn>個人加密</TableColumn>
            <TableColumn>最後登入</TableColumn>
          </TableHeader>
          <TableBody
            isLoading={loading}
            loadingContent={<Spinner />}
            emptyContent={
              <div className="hatch py-8 text-center">
                <p className="tech-label">NO DATA</p>
                <p className="mt-2 text-sm text-ink-muted">{search ? "沒有符合條件的使用者" : "還沒有使用者"}</p>
              </div>
            }
          >
            {data.users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <UserChip user={user} showEmail />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {sortedRoles
                      .filter((role) => user.role_ids.includes(role.id))
                      .map((role) => (
                        <RoleChip key={role.id} role={role} />
                      ))}
                  </div>
                </TableCell>
                <TableCell className="readout text-sm text-ink">{user.totp_count}</TableCell>
                <TableCell>
                  <span className="tech-label inline-flex items-center gap-2 whitespace-nowrap">
                    <span className={cn("led", !user.vault_enabled && "led-off")} aria-hidden />
                    {user.vault_enabled ? "已啟用" : "未啟用"}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs text-ink-muted">{formatDateTime(user.last_login_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export default UsersClient;
