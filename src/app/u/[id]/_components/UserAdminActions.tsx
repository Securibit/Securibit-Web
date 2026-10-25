"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import RoleAssignModal from "@/components/permissions/RoleAssignModal";
import useAuth from "@/components/auth/useAuth";
import { loadAdminUser, loadSiteRoles, setUserSiteRoles } from "@/lib/admin/admin";
import { SITE } from "@/lib/permissions/bits";
import { Actor, canManageMember, siteUnrestricted, sortRoles } from "@/lib/permissions/hierarchy";
import useSiteOwner from "@/components/auth/useSiteOwner";
import { showError } from "@/lib/errorDialog";
import { AdminUser } from "@/types/Admin/Admin";
import { Role } from "@/types/Permission/Permission";
import { UserPublic } from "@/types/User/UserPublic";
import { UserAdminActionsProps } from "@/types/User/UserAdminActions";
import UserEditModal from "@/app/admin/users/[id]/_components/UserEditModal";
import DeleteUserModal from "@/app/admin/users/[id]/_components/DeleteUserModal";

// 對方的最高全站身分組（site_roles 不含 @everyone；沒有就是 0，同資料庫的 top_position）
const topPositionOf = (target: UserPublic) => target.site_roles.reduce((top, role) => Math.max(top, role.position), 0);

// 沒有「查看使用者」拿不到 admin_user 時，用公開資料湊出編輯 / 刪除視窗需要的欄位
// （沒有 email，刪除時改成輸入使用者 ID 確認）
const fromPublic = (target: UserPublic): AdminUser => ({
  id: target.id,
  email: "",
  name: target.name,
  username: target.username,
  photo_url: target.photo_url,
  creation_time: target.created_at ?? "",
  last_login_at: null,
  last_login_ip: null,
  last_login_device: null,
  role_ids: target.site_roles.map((role) => role.id),
  top_position: topPositionOf(target),
  totp_count: 0,
  vault_enabled: false,
});

const rowClass = "flex w-full items-center gap-3 px-5 py-3 text-left text-[17px] transition-colors hover:bg-surface-1";

// 別人個人頁面底部的「管理」：依全站權限與階層顯示（真正的檢查在資料庫的 RPC）
const UserAdminActions = ({ target, onChanged }: UserAdminActionsProps) => {
  const router = useRouter();
  const { can, permissions, topPosition, isSiteOwner } = useAuth();

  const canEdit = can(SITE.MANAGE_USERS);
  // 身分組清單（site_roles_list）要「進入後台」才讀得到
  const canAssign = can(SITE.MANAGE_ROLES) && can(SITE.VIEW_ADMIN);
  // 2FA 與後台使用者頁都在後台，要「進入後台」與「查看使用者」才打得開
  const canOpenAdmin = can(SITE.VIEW_ADMIN) && can(SITE.VIEW_USERS);
  const canTotp = can(SITE.VIEW_USER_TOTP) && canOpenAdmin;
  const anyAction = canEdit || canAssign || canTotp;
  // 判斷「最高位身分組的持有者」要全部身分組（含持有人數）
  const needRoles = anyAction && can(SITE.VIEW_ADMIN);
  const needAdminUser = canEdit && can(SITE.VIEW_USERS);

  const [roles, setRoles] = useState<Role[]>([]);
  // 身分組載入完成（或不需要載入）才判斷階層，避免先閃一下「比你高」
  const [rolesReady, setRolesReady] = useState(!needRoles);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminUser>();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);

  // 套用全站身分組；失敗時跳錯誤（仍算載入完成，階層當作受限）
  const applyRoles = useCallback((result: Awaited<ReturnType<typeof loadSiteRoles>>) => {
    if (result.success) {
      setRoles(sortRoles(result.data));
      setRolesLoaded(true);
    } else {
      showError("載入身分組失敗", result.message);
    }
    setRolesReady(true);
  }, []);

  // 編輯 / 刪除視窗要的完整資料（email 等）；只有「查看使用者」時才讀
  const applyAdminUser = useCallback((result: Awaited<ReturnType<typeof loadAdminUser>>) => {
    if (result.success && result.data) setAdminUser(result.data);
    else showError("載入使用者失敗", result.success ? "找不到這位使用者" : result.message);
  }, []);

  useEffect(() => {
    if (!needRoles) return;
    let cancelled = false;
    loadSiteRoles().then((result) => {
      if (!cancelled) applyRoles(result);
    });
    return () => {
      cancelled = true;
    };
  }, [needRoles, applyRoles]);

  useEffect(() => {
    if (!needAdminUser) return;
    let cancelled = false;
    loadAdminUser(target.id).then((result) => {
      if (!cancelled) applyAdminUser(result);
    });
    return () => {
      cancelled = true;
    };
  }, [needAdminUser, applyAdminUser, target.id]);

  // 只有全站擁有者不受階層限制（還沒有擁有者時是最高位身分組的持有者）；資料載入前（或讀不到）先當作受限
  const ownerId = useSiteOwner(needRoles);
  const actor = useMemo<Actor>(
    () => ({ unrestricted: siteUnrestricted(isSiteOwner, ownerId, topPosition, rolesLoaded ? roles : undefined), topPosition }),
    [isSiteOwner, ownerId, roles, rolesLoaded, topPosition]
  );

  if (!anyAction && !canOpenAdmin) return null;
  if (!rolesReady) return null;

  // 對方的位置比自己高或同位：不能管理（看後台詳情不受階層限制）
  // 全站擁有者只有自己能管理
  const manageable = canManageMember(actor, { top_position: topPositionOf(target), is_owner: !!ownerId && ownerId === target.id });
  const editUser = adminUser ?? (needAdminUser ? undefined : fromPublic(target));
  const adminHref = `/admin/users/${target.id}`;

  // 每個操作成功後：重新載入頁面資料，以及這裡用到的身分組 / 使用者資料
  const afterChange = async () => {
    await Promise.all([
      onChanged(),
      needRoles ? loadSiteRoles().then(applyRoles) : undefined,
      needAdminUser ? loadAdminUser(target.id).then(applyAdminUser) : undefined,
    ]);
  };

  const saveRoles = async (roleIds: string[]) => {
    const result = await setUserSiteRoles(target.id, roleIds);
    if (result.success) await afterChange();
    return result;
  };

  const showEdit = canEdit && manageable;
  const showAssign = canAssign && manageable;
  const showTotp = canTotp && manageable;
  const showDelete = canEdit && manageable;
  const outranked = anyAction && !manageable;

  return (
    <>
      <section>
        <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">管理</h2>
        <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
          {outranked && <li className="px-5 py-3 text-[17px] text-ink-muted">這位使用者的身分組比你高，無法管理</li>}
          {showEdit && (
            <li>
              <button type="button" onClick={() => setEditOpen(true)} disabled={!editUser} className={`${rowClass} text-accent disabled:opacity-50`}>
                編輯名稱與 @ID
              </button>
            </li>
          )}
          {showAssign && (
            <li>
              <button
                type="button"
                onClick={() => setRolesOpen(true)}
                disabled={roles.length === 0}
                className={`${rowClass} text-accent disabled:opacity-50`}
              >
                指派身分組
              </button>
            </li>
          )}
          {/* 2FA 在後台頁面看（每次查看都會記錄，所以不在這裡直接載入金鑰） */}
          {showTotp && (
            <li>
              <Link href={adminHref} className={`${rowClass} text-accent`}>
                <span className="min-w-0 flex-1">查看 2FA</span>
                <FontAwesomeIcon icon={faChevronRight} className="w-2.5 shrink-0 text-ink-muted" />
              </Link>
            </li>
          )}
          {canOpenAdmin && (
            <li>
              <Link href={adminHref} className={`${rowClass} text-accent`}>
                <span className="min-w-0 flex-1">在後台開啟</span>
                <FontAwesomeIcon icon={faChevronRight} className="w-2.5 shrink-0 text-ink-muted" />
              </Link>
            </li>
          )}
        </ul>
      </section>

      {showDelete && (
        <section>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={!editUser}
            className="w-full rounded-[18px] border border-line/70 bg-surface py-3 text-center text-[17px] text-alarm hover:bg-surface-1 disabled:opacity-50"
          >
            刪除使用者
          </button>
          <p className="mt-2 px-5 text-[13px] text-ink-muted">
            會刪除帳號、只有他一個人的群組（含預設群組）與群組成員資格，無法恢復；擁有有其他成員的群組時要先轉移或刪除群組
          </p>
        </section>
      )}

      {editOpen && editUser && <UserEditModal user={editUser} onClose={() => setEditOpen(false)} onSaved={afterChange} />}

      {deleteOpen && editUser && (
        <DeleteUserModal
          user={editUser}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => router.push(canOpenAdmin ? "/admin/users" : "/")}
        />
      )}

      <RoleAssignModal
        isOpen={rolesOpen}
        onClose={() => setRolesOpen(false)}
        title="指派身分組"
        roles={roles}
        selected={target.site_roles.map((role) => role.id)}
        actor={actor}
        actorPermissions={permissions}
        onSave={saveRoles}
      />
    </>
  );
};

export default UserAdminActions;
