"use client";

import useAuth from "@/components/auth/useAuth";
import GroupView from "@/app/groups/[id]/_components/GroupView";
import { SITE, SITE_PERMISSIONS, permissionName } from "@/lib/permissions/bits";
import { GroupDetailAdminClientProps } from "@/types/Admin/GroupDetailAdminClient";
import NoPermission from "../../_components/NoPermission";

// 後台群組管理：和群組內頁相同的分頁，放在後台外框裡；全站「管理所有群組」在群組裡有全部權限
const GroupDetailAdminClient = (props: GroupDetailAdminClientProps) => {
  const { can } = useAuth();

  if (!can(SITE.MANAGE_GROUPS)) return <NoPermission permission={permissionName(SITE_PERMISSIONS, SITE.MANAGE_GROUPS)} />;

  return (
    <GroupView
      adminMode
      gid={props.groupId}
      backHref="/admin/groups"
      backText="群組"
      backPlacement="top"
      exitHref="/admin/groups"
    />
  );
};

export default GroupDetailAdminClient;
