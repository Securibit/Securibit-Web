"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Loading/Spinner";
import RoleEditor from "@/components/permissions/RoleEditor";
import useAuth from "@/components/auth/useAuth";
import { createSiteRole, deleteSiteRole, loadSiteRoles, reorderSiteRoles, updateSiteRole } from "@/lib/admin/admin";
import { SITE, SITE_PERMISSIONS } from "@/lib/permissions/bits";
import { Actor, sortRoles } from "@/lib/permissions/hierarchy";
import { showError } from "@/lib/errorDialog";
import { Role } from "@/types/Permission/Permission";

// 讀取全站身分組（由高到低）；失敗時跳錯誤並回傳 undefined
const fetchRoles = async () => {
  const result = await loadSiteRoles();
  if (result.success) return sortRoles(result.data);
  showError("載入身分組失敗", result.message);
  return undefined;
};

// 全站身分組：有進入後台就能看（唯讀），有「管理身分組」才能修改
const RolesClient = () => {
  const { can, permissions, topPosition, refresh } = useAuth();
  const canManage = can(SITE.MANAGE_ROLES);
  const actor = useMemo<Actor>(
    () => ({ unrestricted: can(SITE.ADMINISTRATOR), topPosition }),
    [can, topPosition]
  );

  const [roles, setRoles] = useState<Role[]>();

  // 失敗時保留畫面上原本的清單（第一次載入失敗就顯示空的）
  const applyRoles = useCallback((data: Role[] | undefined) => setRoles((prev) => data ?? prev ?? []), []);
  const load = useCallback(async () => applyRoles(await fetchRoles()), [applyRoles]);

  useEffect(() => {
    let cancelled = false;
    fetchRoles().then((data) => {
      if (!cancelled) applyRoles(data);
    });
    return () => {
      cancelled = true;
    };
  }, [applyRoles]);

  // 修改後重新載入清單；自己的身分組可能被改到，權限也一起重新讀
  const handleChanged = useCallback(async () => {
    await Promise.all([load(), refresh()]);
  }, [load, refresh]);

  return (
    <div>
      <PageHeader
        title="身分組"
        subtitle={canManage ? "身分組越上面越高，權限會合併計算" : "你只能查看，需要「管理身分組」權限才能修改"}
      />

      <p className="mb-6 text-[13px] text-ink-muted">
        全站身分組決定每個人在整個網站（後台、建立群組等）能做什麼，和群組裡的身分組是分開的；每個人都有 @everyone。
        除了「管理員」以外，只能編輯、刪除、指派比自己最高身分組還低的身分組，而且只能開啟自己也有的權限。
      </p>

      {roles === undefined ? (
        <Spinner block label="載入身分組…" />
      ) : (
        <RoleEditor
          roles={roles}
          definitions={SITE_PERMISSIONS}
          actor={actor}
          actorPermissions={permissions}
          canManage={canManage}
          onCreate={createSiteRole}
          onUpdate={updateSiteRole}
          onDelete={deleteSiteRole}
          onReorder={reorderSiteRoles}
          onChanged={handleChanged}
        />
      )}
    </div>
  );
};

export default RolesClient;
