"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useRouter } from "nextjs-toploader/app";
import { Button, Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCopy, faCrown, faShieldHalved, faTrash, faUserPen } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Loading/Spinner";
import RoleChip from "@/components/permissions/RoleChip";
import RoleAssignModal from "@/components/permissions/RoleAssignModal";
import UserChip from "@/components/permissions/UserChip";
import useAuth from "@/components/auth/useAuth";
import { loadAdminUser, loadSiteRoles, setUserSiteRoles } from "@/lib/admin/admin";
import { SITE, SITE_PERMISSIONS, permissionName } from "@/lib/permissions/bits";
import { Actor, canManageMember, sortRoles } from "@/lib/permissions/hierarchy";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { AdminUserDetail } from "@/types/Admin/Admin";
import { Role } from "@/types/Permission/Permission";
import { UserDetailClientProps } from "@/types/Admin/UserDetailClient";
import NoPermission from "../../_components/NoPermission";
import UserEditModal from "./_components/UserEditModal";
import DeleteUserModal from "./_components/DeleteUserModal";
import UserTotpList from "./_components/UserTotpList";
import InfoRow from "./_components/InfoRow";

// 讀取使用者詳情；失敗時跳錯誤並回傳 null
const fetchUser = async (userId: string) => {
  const result = await loadAdminUser(userId);
  if (result.success && result.data) return result.data;
  showError("載入使用者失敗", result.success ? "找不到這位使用者" : result.message);
  return null;
};

// 後台使用者詳情：基本資料、修改 / 刪除、身分組、2FA
const UserDetailClient = (props: UserDetailClientProps) => {
  const { userId } = props;
  const router = useRouter();
  const { user: me, can, topPosition, refresh } = useAuth();
  const allowed = can(SITE.VIEW_USERS);
  const actor = useMemo<Actor>(() => ({ unrestricted: can(SITE.ADMINISTRATOR), topPosition }), [can, topPosition]);

  // undefined：載入中；null：找不到 / 載入失敗
  const [detail, setDetail] = useState<AdminUserDetail | null>();
  const [roles, setRoles] = useState<Role[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);

  // 重新載入失敗時保留畫面上原本的資料（第一次就失敗才顯示「找不到」）
  const applyDetail = useCallback((data: AdminUserDetail | null) => setDetail((prev) => data ?? prev ?? null), []);
  const load = useCallback(async () => applyDetail(await fetchUser(userId)), [applyDetail, userId]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    fetchUser(userId).then((data) => {
      if (!cancelled) applyDetail(data);
    });
    loadSiteRoles().then((result) => {
      if (cancelled) return;
      if (result.success) setRoles(sortRoles(result.data));
      else showError("載入身分組失敗", result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, applyDetail, userId]);

  if (!allowed) return <NoPermission permission={permissionName(SITE_PERMISSIONS, SITE.VIEW_USERS)} />;

  const backButton = (
    <Button
      variant="light"
      size="sm"
      className="mb-2 -ml-2"
      startContent={<FontAwesomeIcon icon={faArrowLeft} className="w-3.5" />}
      onPress={() => router.push("/admin/users")}
    >
      使用者列表
    </Button>
  );

  if (detail === undefined) return <Spinner block label="載入使用者…" />;
  if (detail === null) {
    return (
      <>
        {backButton}
        <p className="py-10 text-center text-gray-blue-500 dark:text-gray-blue-400">找不到這位使用者</p>
      </>
    );
  }

  const isSelf = me?.uid === detail.id;
  // 修改資料、刪除：要「管理使用者」、階層比對方高，而且不是自己
  const canManageUser = can(SITE.MANAGE_USERS) && !isSelf && canManageMember(actor, { top_position: detail.top_position });
  const canAssignRoles = can(SITE.MANAGE_ROLES);
  const userRoles = roles.filter((role) => detail.role_ids.includes(role.id));

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(detail.id);
      toast.success("已複製使用者 ID！", { position: "top-right" });
    } catch {
      showError("無法複製", "瀏覽器不允許存取剪貼簿，請手動複製。");
    }
  };

  const saveRoles = async (roleIds: string[]) => {
    const result = await setUserSiteRoles(detail.id, roleIds);
    if (result.success) {
      // 改到自己的身分組時，自己的權限也要重新讀
      await Promise.all([load(), isSelf ? refresh() : undefined]);
    }
    return result;
  };

  return (
    <>
      {backButton}
      <PageHeader
        title={detail.name || detail.email || "使用者"}
        subtitle={detail.username ? `@${detail.username}` : undefined}
        right={
          canManageUser && (
            <>
              <Button
                variant="bordered"
                startContent={<FontAwesomeIcon icon={faUserPen} className="w-3.5" />}
                onPress={() => setEditOpen(true)}
              >
                修改資料
              </Button>
              <Button
                variant="bordered"
                color="danger"
                startContent={<FontAwesomeIcon icon={faTrash} className="w-3.5" />}
                onPress={() => setDeleteOpen(true)}
              >
                刪除使用者
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-col gap-4">
        {/* 基本資料 */}
        <section className="rounded-lg border border-gray-blue-200 p-4 dark:border-gray-blue-700">
          <UserChip user={detail} size="lg" showEmail />
          <dl className="mt-3 divide-y divide-gray-blue-100 dark:divide-gray-blue-700">
            <InfoRow label="使用者 ID">
              <span className="inline-flex items-center gap-1">
                <code className="break-all font-mono text-xs">{detail.id}</code>
                <Button isIconOnly size="sm" variant="light" aria-label="複製使用者 ID" onPress={copyId}>
                  <FontAwesomeIcon icon={faCopy} className="w-3.5" />
                </Button>
              </span>
            </InfoRow>
            <InfoRow label="Email">{detail.email || "無"}</InfoRow>
            <InfoRow label="@ID">{detail.username ? `@${detail.username}` : "未設定"}</InfoRow>
            <InfoRow label="建立時間">{formatDateTime(detail.creation_time)}</InfoRow>
            <InfoRow label="最後登入">
              <span className="block">{formatDateTime(detail.last_login_at)}</span>
              {detail.last_login_ip && (
                <span className="block text-gray-blue-500 dark:text-gray-blue-400">IP：{detail.last_login_ip}</span>
              )}
              {detail.last_login_device && (
                <span className="block text-gray-blue-500 dark:text-gray-blue-400">裝置：{detail.last_login_device}</span>
              )}
            </InfoRow>
            <InfoRow label="個人加密">{detail.vault_enabled ? "已啟用" : "未啟用"}</InfoRow>
            <InfoRow label="所在群組">
              {detail.groups.length === 0 ? (
                "無"
              ) : (
                <span className="flex flex-wrap gap-2">
                  {detail.groups.map((group) => (
                    <Link
                      key={group.id}
                      href={`/groups/${group.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-blue-200 px-2 py-0.5 hover:border-tpp hover:text-tpp dark:border-gray-blue-600"
                    >
                      {group.is_owner && <FontAwesomeIcon icon={faCrown} className="w-3 text-amber-500" aria-label="擁有者" />}
                      {group.name}
                    </Link>
                  ))}
                </span>
              )}
            </InfoRow>
          </dl>
          {isSelf && (
            <p className="mt-2 text-xs text-gray-blue-500 dark:text-gray-blue-400">這是你自己的帳號，請到「管理帳戶」修改資料。</p>
          )}
        </section>

        {/* 身分組 */}
        <section className="rounded-lg border border-gray-blue-200 p-4 dark:border-gray-blue-700">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-blue-900 dark:text-white">身分組</h2>
            {canAssignRoles && (
              <Button
                size="sm"
                variant="bordered"
                startContent={<FontAwesomeIcon icon={faShieldHalved} className="w-3.5" />}
                onPress={() => setRolesOpen(true)}
                isDisabled={roles.length === 0}
              >
                編輯身分組
              </Button>
            )}
          </div>
          {userRoles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {userRoles.map((role) => (
                <RoleChip key={role.id} role={role} />
              ))}
            </div>
          ) : (
            <Chip size="sm" variant="flat">
              只有 @everyone
            </Chip>
          )}
        </section>

        {/* 2FA */}
        {can(SITE.VIEW_USER_TOTP) && <UserTotpList user={detail} canManage={can(SITE.MANAGE_USER_TOTP)} />}
      </div>

      {editOpen && <UserEditModal user={detail} onClose={() => setEditOpen(false)} onSaved={load} />}

      {deleteOpen && (
        <DeleteUserModal user={detail} onClose={() => setDeleteOpen(false)} onDeleted={() => router.push("/admin/users")} />
      )}

      <RoleAssignModal
        isOpen={rolesOpen}
        onClose={() => setRolesOpen(false)}
        title={`指派身分組給 ${detail.name || detail.email}`}
        roles={roles}
        selected={detail.role_ids}
        actor={actor}
        onSave={saveRoles}
      />
    </>
  );
};

export default UserDetailClient;
