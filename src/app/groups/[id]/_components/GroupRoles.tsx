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
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[22px] font-semibold">身分組</h2>
        <span className="text-[13px] text-ink-muted tabular-nums">共 {detail.roles.length} 個</span>
      </div>
      {!canManage && <p className="mb-3 text-[13px] text-ink-muted">你沒有「管理身分組」權限，只能查看</p>}
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
