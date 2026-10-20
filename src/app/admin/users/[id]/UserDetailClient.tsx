"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useRouter } from "nextjs-toploader/app";
import { Button } from "@heroui/react";
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
import { cn, formatDateTime } from "@/lib/utils";
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

// 回列表的連結（放在標題上方）
const BackLink = () => (
  <Link
    href="/admin/users"
    className="mb-4 inline-flex items-center gap-2 font-display text-xs tracking-[0.12em] text-ink-muted transition-colors hover:text-phos"
  >
    <FontAwesomeIcon icon={faArrowLeft} className="w-3" />
    使用者列表
  </Link>
);

// 後台使用者詳情：基本資料規格表、身分組、2FA、危險區（修改 / 刪除）
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

  if (detail === undefined) return <Spinner block label="載入使用者…" />;
  if (detail === null) {
    return (
      <div className="boot">
        <BackLink />
        <div className="hatch border border-line p-10 text-center">
          <p className="tech-label">NOT FOUND</p>
          <p className="mt-2 text-ink-muted">找不到這位使用者</p>
        </div>
      </div>
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
    <div className="boot">
      <BackLink />
      <PageHeader
        index="01 // USERS / DETAIL"
        title={detail.name || detail.email || "使用者"}
        subtitle={detail.username ? `@${detail.username}` : undefined}
        right={
          canManageUser && (
            <Button
              variant="bordered"
              className="font-display tracking-[0.08em]"
              startContent={<FontAwesomeIcon icon={faUserPen} className="w-3.5" />}
              onPress={() => setEditOpen(true)}
            >
              修改資料
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-6">
        {/* 基本資料：主要面板 */}
        <section className="panel p-5">
          <p className="tech-label">01 // PROFILE</p>
          <div className="mt-3">
            <UserChip user={detail} size="lg" showEmail />
          </div>
          <dl className="mt-4 border-t border-line">
            <InfoRow label="USER ID">
              <span className="inline-flex max-w-full items-center gap-2">
                <span className="break-all text-xs">{detail.id}</span>
                <button
                  type="button"
                  onClick={copyId}
                  aria-label="複製使用者 ID"
                  title="複製使用者 ID"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center border border-line text-ink-muted transition-colors hover:border-phos hover:text-phos"
                >
                  <FontAwesomeIcon icon={faCopy} className="w-3" />
                </button>
              </span>
            </InfoRow>
            <InfoRow label="EMAIL">{detail.email || "無"}</InfoRow>
            <InfoRow label="@ID">{detail.username ? `@${detail.username}` : <span className="text-ink-dim">未設定</span>}</InfoRow>
            <InfoRow label="CREATED">{formatDateTime(detail.creation_time)}</InfoRow>
            <InfoRow label="LAST LOGIN">
              <span className="block">{formatDateTime(detail.last_login_at)}</span>
              {detail.last_login_ip && <span className="block text-xs text-ink-muted">IP：{detail.last_login_ip}</span>}
              {detail.last_login_device && (
                <span className="block text-xs text-ink-muted">裝置：{detail.last_login_device}</span>
              )}
            </InfoRow>
            <InfoRow label="VAULT">
              <span className="tech-label inline-flex items-center gap-2">
                <span className={cn("led", !detail.vault_enabled && "led-off")} aria-hidden />
                {detail.vault_enabled ? "已啟用" : "未啟用"}
              </span>
            </InfoRow>
            <InfoRow label="GROUPS">
              {detail.groups.length === 0 ? (
                <span className="text-ink-dim">無</span>
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  {detail.groups.map((group) => (
                    <Link
                      key={group.id}
                      href={`/groups/${group.id}`}
                      className="tech-label inline-flex items-center gap-1.5 border border-line px-1.5 py-0.5 normal-case tracking-[0.08em] text-ink transition-colors hover:border-phos hover:text-phos"
                    >
                      {group.is_owner && <FontAwesomeIcon icon={faCrown} className="w-3 text-phos" aria-label="擁有者" />}
                      {group.name}
                    </Link>
                  ))}
                </span>
              )}
            </InfoRow>
          </dl>
          {isSelf && (
            <p className="mt-3 font-mono text-[11px] tracking-[0.08em] text-ink-dim">
              這是你自己的帳號，請到「管理帳戶」修改資料。
            </p>
          )}
        </section>

        {/* 身分組 */}
        <section className="border border-line bg-surface-1 p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tech-label">02 // SITE ROLES</p>
              <h2 className="mt-1 font-display text-xl font-bold text-ink">身分組</h2>
            </div>
            {canAssignRoles && (
              <Button
                size="sm"
                variant="bordered"
                className="font-display tracking-[0.08em]"
                startContent={<FontAwesomeIcon icon={faShieldHalved} className="w-3.5" />}
                onPress={() => setRolesOpen(true)}
                isDisabled={roles.length === 0}
              >
                編輯身分組
              </Button>
            )}
          </div>
          {userRoles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {userRoles.map((role) => (
                <RoleChip key={role.id} role={role} />
              ))}
            </div>
          ) : (
            <p className="font-mono text-sm text-ink-dim">只有 @everyone</p>
          )}
        </section>

        {/* 2FA */}
        {can(SITE.VIEW_USER_TOTP) && <UserTotpList user={detail} canManage={can(SITE.MANAGE_USER_TOTP)} />}

        {/* 危險區 */}
        {canManageUser && (
          <section className="border border-alarm p-5">
            <p className="tech-label flex items-center gap-2 text-alarm">
              <span className="led led-alarm" aria-hidden />
              04 // DANGER ZONE
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-ink">刪除使用者</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  刪除帳號、所有驗證碼與群組成員資格，無法恢復。擁有群組的使用者要先轉移或刪除群組。
                </p>
              </div>
              <Button
                variant="bordered"
                color="danger"
                className="font-display tracking-[0.08em]"
                startContent={<FontAwesomeIcon icon={faTrash} className="w-3.5" />}
                onPress={() => setDeleteOpen(true)}
              >
                刪除使用者
              </Button>
            </div>
          </section>
        )}
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
    </div>
  );
};

export default UserDetailClient;
