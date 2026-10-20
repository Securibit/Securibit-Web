"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import RoleChip from "@/components/permissions/RoleChip";
import useAuth from "@/components/auth/useAuth";
import { loadAdminGroups, loadAdminUsers, loadSiteRoles } from "@/lib/admin/admin";
import { SITE } from "@/lib/permissions/bits";
import AdminSectionCard from "./_components/AdminSectionCard";
import { ADMIN_SECTIONS } from "./_components/sections";

// 後台總覽：「總覽」一列一個數字，「管理」是各區塊的入口
const AdminHomeClient = () => {
  const { profile, user, siteRoles, can } = useAuth();
  const canViewUsers = can(SITE.VIEW_USERS);
  const canManageGroups = can(SITE.MANAGE_GROUPS);

  // 各種總數（有權限才載入；失敗就不顯示數字）
  const [userTotal, setUserTotal] = useState<number>();
  const [roleTotal, setRoleTotal] = useState<number>();
  const [groupTotal, setGroupTotal] = useState<number>();

  useEffect(() => {
    let cancelled = false;
    loadSiteRoles().then((result) => {
      if (!cancelled && result.success) setRoleTotal(result.data.length);
    });
    if (canViewUsers) {
      loadAdminUsers("", 0, 1).then((result) => {
        if (!cancelled && result.success) setUserTotal(result.data.total);
      });
    }
    if (canManageGroups) {
      loadAdminGroups("").then((result) => {
        if (!cancelled && result.success) setGroupTotal(result.data.length);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [canViewUsers, canManageGroups]);

  const name = profile?.name || user?.displayName || user?.email || "管理員";
  // 總覽本身不放入口
  const sections = ADMIN_SECTIONS.filter((section) => section.href !== "/admin" && can(section.permission));
  const counts: Record<string, number | undefined> = {
    "/admin/users": userTotal,
    "/admin/roles": roleTotal,
    "/admin/groups": groupTotal,
  };

  const stats: [string, number | undefined][] = [
    ...(canViewUsers ? [["使用者", userTotal] as [string, number | undefined]] : []),
    ["身分組", roleTotal],
    ...(canManageGroups ? [["群組", groupTotal] as [string, number | undefined]] : []),
  ];

  return (
    <div>
      <PageHeader title="後台" subtitle={`歡迎回來，${name}`} />

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">總覽</h2>
          <dl className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {stats.map(([label, count]) => (
              <div key={label} className="flex items-center justify-between gap-6 px-5 py-3">
                <dt className="text-[17px]">{label}</dt>
                <dd className="text-[17px] tabular-nums text-ink-muted">{count === undefined ? "–" : count}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-6 px-5 py-3">
              <dt className="shrink-0 text-[17px]">你的身分組</dt>
              <dd className="flex min-w-0 flex-wrap justify-end gap-1.5 text-[17px] text-ink-muted">
                {siteRoles.length > 0 ? siteRoles.map((role) => <RoleChip key={role.id} role={role} />) : "只有 @everyone"}
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">管理</h2>
          {sections.length === 0 ? (
            <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">你還沒有任何後台區塊的權限</div>
          ) : (
            <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
              {sections.map((section) => (
                <AdminSectionCard
                  key={section.href}
                  href={section.href}
                  title={section.text}
                  icon={section.icon}
                  count={counts[section.href]}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminHomeClient;
