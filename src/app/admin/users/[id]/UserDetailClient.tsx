"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useRouter } from "nextjs-toploader/app";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faCopy, faCrown } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Loading/Spinner";
import RoleChip from "@/components/permissions/RoleChip";
import RoleAssignModal from "@/components/permissions/RoleAssignModal";
import useAuth from "@/components/auth/useAuth";
import { loadAdminUser, loadSiteRoles, setUserSiteRoles } from "@/lib/admin/admin";
import { SITE, SITE_PERMISSIONS, permissionName } from "@/lib/permissions/bits";
import { Actor, canManageMember, isSiteRoot, sortRoles } from "@/lib/permissions/hierarchy";
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
import ActivitySection from "@/components/activity/ActivitySection";
import LoginHistoryList from "@/components/activity/LoginHistoryList";
import AccountActivityList from "@/components/activity/AccountActivityList";
import { loadAdminUserActivity, loadAdminUserLoginHistory } from "@/lib/users/activity";

// 登入紀錄 / 操作紀錄每次載入的筆數
const ACTIVITY_PAGE_SIZE = 10;

// 讀取使用者詳情；失敗時跳錯誤並回傳 null
const fetchUser = async (userId: string) => {
  const result = await loadAdminUser(userId);
  if (result.success && result.data) return result.data;
  showError("載入使用者失敗", result.success ? "找不到這位使用者" : result.message);
  return null;
};

// 回列表的連結（放在標題上方）
const BackLink = () => (
  <Link href="/admin/users" className="mb-3 inline-flex items-center gap-1.5 text-[17px] text-accent hover:underline">
    <FontAwesomeIcon icon={faChevronLeft} className="w-2.5" />
    使用者
  </Link>
);

// 後台使用者詳情：像 iOS 設定的分組列表（帳號、登入資訊、身分組、2FA、登入紀錄、操作紀錄），最後是刪除
const UserDetailClient = (props: UserDetailClientProps) => {
  const { userId } = props;
  const router = useRouter();
  const { user: me, can, permissions, topPosition, refresh } = useAuth();
  const allowed = can(SITE.VIEW_USERS);
  // undefined：載入中；null：找不到 / 載入失敗
  const [detail, setDetail] = useState<AdminUserDetail | null>();
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  // 只有最高位身分組的持有者不受階層限制（一般管理員也要遵守）；身分組載入前先當作受限
  const actor = useMemo<Actor>(
    () => ({ unrestricted: rolesLoaded && isSiteRoot(topPosition, roles), topPosition }),
    [roles, rolesLoaded, topPosition]
  );
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
      if (result.success) {
        setRoles(sortRoles(result.data));
        setRolesLoaded(true);
      } else showError("載入身分組失敗", result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, applyDetail, userId]);

  if (!allowed) return <NoPermission permission={permissionName(SITE_PERMISSIONS, SITE.VIEW_USERS)} />;

  if (detail === undefined) return <Spinner block label="載入使用者…" />;
  if (detail === null) {
    return (
      <div>
        <BackLink />
        <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">找不到這位使用者</div>
      </div>
    );
  }

  const isSelf = me?.uid === detail.id;
  // 修改資料、刪除：要「管理使用者」、階層比對方高，而且不是自己
  const canManageUser = can(SITE.MANAGE_USERS) && !isSelf && canManageMember(actor, { top_position: detail.top_position });
  const canAssignRoles = can(SITE.MANAGE_ROLES);
  // 2FA：自己的，或階層比對方高才看得到 / 改得到（資料庫同樣檢查）
  const canReachTotp = isSelf || canManageMember(actor, { top_position: detail.top_position });
  const userRoles = roles.filter((role) => detail.role_ids.includes(role.id));

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(detail.id);
      toast.success("已複製", { position: "top-right" });
    } catch {
      showError("無法複製", "瀏覽器不允許存取剪貼簿，請手動複製使用者 ID。");
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
    <div>
      <BackLink />
      <PageHeader
        title={detail.name || detail.email || "使用者"}
        subtitle={detail.username ? `@${detail.username}` : undefined}
        right={
          canManageUser && (
            <button type="button" onClick={() => setEditOpen(true)} className="text-[17px] text-accent hover:underline">
              編輯
            </button>
          )
        }
      />

      <div className="flex flex-col gap-8">
        {/* 身分 */}
        <div className="flex items-center gap-4 overflow-hidden rounded-[18px] border border-line/70 bg-surface px-5 py-5">
          {detail.photo_url ? (
            <img className="h-16 w-16 shrink-0 rounded-full object-cover" src={detail.photo_url} referrerPolicy="no-referrer" alt="" />
          ) : (
            // 沒有大頭照時顯示名字的第一個字
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-1 text-2xl font-semibold">
              {Array.from(detail.name.trim())[0] || "?"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[22px] font-semibold">{detail.name || "（未命名）"}</p>
            <p className="truncate text-[15px] text-ink-muted">{detail.email || "沒有電子郵件"}</p>
          </div>
        </div>

        {/* 帳號 */}
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">帳號</h2>
          <dl className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            <InfoRow label="@ID">{detail.username ? `@${detail.username}` : "未設定"}</InfoRow>
            <InfoRow label="使用者 ID">
              <button type="button" onClick={copyId} title="點一下複製" className="flex max-w-full items-center gap-2 text-ink hover:opacity-60">
                <span className="truncate text-[15px]">{detail.id}</span>
                <FontAwesomeIcon icon={faCopy} className="w-3.5 shrink-0 text-ink-muted" />
              </button>
            </InfoRow>
            <InfoRow label="電子郵件">{detail.email || "無"}</InfoRow>
            <InfoRow label="加密密碼">{detail.vault_enabled ? "已設定" : "未設定"}</InfoRow>
            <InfoRow label="群組">
              {detail.groups.length === 0 ? (
                "無"
              ) : (
                <span className="flex flex-wrap justify-end gap-1.5">
                  {detail.groups.map((group) => (
                    <Link key={group.id} href={`/groups/${group.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-ink hover:bg-line/60">
                      {group.is_owner && <FontAwesomeIcon icon={faCrown} className="w-3 text-ink-muted" aria-label="擁有者" />}
                      {group.name}
                    </Link>
                  ))}
                </span>
              )}
            </InfoRow>
          </dl>
          {isSelf && <p className="mt-2 px-5 text-[13px] text-ink-muted">這是你自己的帳號，請到「個人頁面」修改資料</p>}
        </section>

        {/* 登入資訊 */}
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">登入資訊</h2>
          <dl className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            <InfoRow label="建立時間">{formatDateTime(detail.creation_time)}</InfoRow>
            <InfoRow label="最後登入">{formatDateTime(detail.last_login_at)}</InfoRow>
            {/* 階層不比對方高時資料庫不給 IP（null） */}
            <InfoRow label="IP">{detail.last_login_ip || (detail.last_login_at && detail.last_login_ip === null ? "不公開" : "無")}</InfoRow>
            <InfoRow label="裝置">{detail.last_login_device || "無"}</InfoRow>
          </dl>
        </section>

        {/* 身分組 */}
        <section>
          <div className="mb-2 flex items-center justify-between px-5">
            <h2 className="text-[13px] font-normal text-ink-muted">身分組</h2>
            {canAssignRoles && (
              <button
                type="button"
                onClick={() => setRolesOpen(true)}
                disabled={roles.length === 0}
                className="text-[13px] text-accent hover:underline disabled:opacity-50"
              >
                編輯
              </button>
            )}
          </div>
          <div className="rounded-[18px] border border-line/70 bg-surface px-5 py-3">
            {userRoles.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {userRoles.map((role) => (
                  <RoleChip key={role.id} role={role} />
                ))}
              </div>
            ) : (
              <p className="text-[17px] text-ink-muted">只有 @everyone</p>
            )}
          </div>
        </section>

        {/* 2FA */}
        {can(SITE.VIEW_USER_TOTP) && canReachTotp && <UserTotpList user={detail} canManage={can(SITE.MANAGE_USER_TOTP)} />}

        {/* 每次登入 */}
        <ActivitySection title="登入紀錄">
          <LoginHistoryList
            load={(beforeId) => loadAdminUserLoginHistory(detail.id, beforeId, ACTIVITY_PAGE_SIZE)}
            pageSize={ACTIVITY_PAGE_SIZE}
            paginate
          />
        </ActivitySection>

        {/* 帳號操作紀錄 */}
        <ActivitySection title="帳號操作紀錄">
          <AccountActivityList
            load={(beforeId) => loadAdminUserActivity(detail.id, beforeId, ACTIVITY_PAGE_SIZE)}
            pageSize={ACTIVITY_PAGE_SIZE}
            subjectId={detail.id}
            viewer="admin"
            paginate
          />
        </ActivitySection>

        {/* 刪除 */}
        {canManageUser && (
          <section>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="w-full rounded-[18px] border border-line/70 bg-surface py-3 text-center text-[17px] text-alarm hover:bg-surface-1"
            >
              刪除使用者
            </button>
            <p className="mt-2 px-5 text-[13px] text-ink-muted">
              會刪除帳號、只有他一個人的群組（含預設群組）與群組成員資格，無法恢復；擁有有其他成員的群組時要先轉移或刪除群組
            </p>
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
        title="指派身分組"
        roles={roles}
        selected={detail.role_ids}
        actor={actor}
        actorPermissions={permissions}
        onSave={saveRoles}
      />
    </div>
  );
};

export default UserDetailClient;
