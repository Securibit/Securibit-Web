"use client";

import RoleEditor from "@/components/permissions/RoleEditor";
import { createGroupRole, deleteGroupRole, reorderGroupRoles, updateGroupRole } from "@/lib/groups/groups";
import { GROUP, GROUP_PERMISSIONS, has } from "@/lib/permissions/bits";
import { GroupRolesProps } from "@/types/Group/GroupRoles";

// 身分組分頁：所有成員都看得到（沒有「管理身分組」時唯讀）
const GroupRoles = ({ detail, actor, onChanged }: GroupRolesProps) => {
  const gid = detail.group.id;
  const canManage = has(detail.permissions, GROUP.MANAGE_ROLES);

  return (
    <div>
      <div className="mb-4">
        <p className="tech-label">03 // ROLES</p>
        <h2 className="font-display text-lg font-bold text-ink">
          身分組 <span className="font-mono text-sm font-normal text-ink-dim">{detail.roles.length}</span>
        </h2>
        {!canManage && (
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
            <span className="led led-off" aria-hidden />
            你沒有「管理身分組」權限，只能查看。
          </p>
        )}
      </div>
      <RoleEditor
        roles={detail.roles}
        definitions={GROUP_PERMISSIONS}
        actor={actor}
        actorPermissions={detail.permissions}
        canManage={canManage}
        onCreate={(input) => createGroupRole(gid, input)}
        onUpdate={updateGroupRole}
        onDelete={deleteGroupRole}
        onReorder={(roleIds) => reorderGroupRoles(gid, roleIds)}
        onChanged={onChanged}
      />
    </div>
  );
};

export default GroupRoles;
