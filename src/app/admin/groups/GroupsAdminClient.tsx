"use client";

import { useEffect, useRef, useState } from "react";
import { useDebounce } from "react-use";
import { useRouter } from "nextjs-toploader/app";
import { Input, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Loading/Spinner";
import UserChip from "@/components/permissions/UserChip";
import useAuth from "@/components/auth/useAuth";
import { loadAdminGroups } from "@/lib/admin/admin";
import { SITE, SITE_PERMISSIONS, permissionName } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { AdminGroup } from "@/types/Admin/Admin";
import NoPermission from "../_components/NoPermission";

// 所有群組；點一列開群組內頁（全站「管理所有群組」在群組裡有全部權限）
const GroupsAdminClient = () => {
  const { can } = useAuth();
  const allowed = can(SITE.MANAGE_GROUPS);
  const router = useRouter();

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
    <>
      <PageHeader title="群組" subtitle={loaded ? `共 ${loaded.groups.length} 個群組` : undefined} />

      <Input
        aria-label="搜尋群組"
        placeholder="搜尋群組名稱"
        value={keyword}
        onValueChange={setKeyword}
        isClearable
        onClear={() => setKeyword("")}
        startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="w-3.5 text-gray-blue-400" />}
        className="mb-4 sm:max-w-sm"
      />

      {!loaded ? (
        <Spinner block label="載入群組…" />
      ) : (
        <Table
          aria-label="群組列表"
          onRowAction={(key) => router.push(`/groups/${String(key)}`)}
          classNames={{ wrapper: "dark:bg-gray-blue-800", tr: "cursor-pointer" }}
        >
          <TableHeader>
            <TableColumn>群組</TableColumn>
            <TableColumn>擁有者</TableColumn>
            <TableColumn align="end">成員</TableColumn>
            <TableColumn align="end">驗證碼</TableColumn>
            <TableColumn>建立時間</TableColumn>
          </TableHeader>
          <TableBody
            isLoading={loading}
            loadingContent={<Spinner />}
            emptyContent={search ? "沒有符合條件的群組" : "還沒有群組"}
          >
            {loaded.groups.map((group) => (
              <TableRow key={group.id}>
                <TableCell>
                  <p className="font-medium text-gray-blue-900 dark:text-white">{group.name}</p>
                  {group.description && (
                    <p className="max-w-xs truncate text-xs text-gray-blue-500 dark:text-gray-blue-400">{group.description}</p>
                  )}
                </TableCell>
                <TableCell>
                  <UserChip user={group.owner} size="sm" />
                </TableCell>
                <TableCell className="tabular-nums">{group.member_count}</TableCell>
                <TableCell className="tabular-nums">{group.account_count}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">{formatDateTime(group.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
};

export default GroupsAdminClient;
