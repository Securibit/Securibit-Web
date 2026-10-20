"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import RoleChip from "@/components/permissions/RoleChip";
import useAuth from "@/components/auth/useAuth";
import { loadAdminUsers } from "@/lib/admin/admin";
import { SITE } from "@/lib/permissions/bits";
import AdminSectionCard from "./_components/AdminSectionCard";
import { ADMIN_SECTIONS } from "./_components/sections";

// 後台總覽：狀態面板（操作者、全站身分組、使用者數）+ 各區塊入口的規格表
const AdminHomeClient = () => {
  const { profile, user, siteRoles, can } = useAuth();
  const canViewUsers = can(SITE.VIEW_USERS);
  // 使用者總數（有「查看使用者」才載入；失敗就不顯示數字）
  const [userTotal, setUserTotal] = useState<number>();

  useEffect(() => {
    if (!canViewUsers) return;
    let cancelled = false;
    loadAdminUsers("", 0, 1).then((result) => {
      if (!cancelled && result.success) setUserTotal(result.data.total);
    });
    return () => {
      cancelled = true;
    };
  }, [canViewUsers]);

  const name = profile?.name || user?.displayName || user?.email || "管理員";
  // 總覽本身不放入口
  const sections = ADMIN_SECTIONS.filter((section) => section.href !== "/admin" && can(section.permission));

  return (
    <div className="boot">
      <PageHeader index="00 // OVERVIEW" title="後台" subtitle={`歡迎回來，${name}`} />

      {/* 狀態面板 */}
      <section className="panel p-5">
        <p className="tech-label flex items-center gap-2">
          <span className="led" aria-hidden />
          01 // STATUS
        </p>
        <dl className="mt-4 border-t border-line">
          <div className="grid gap-1 border-b border-line py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
            <dt className="tech-label pt-0.5">OPERATOR</dt>
            <dd className="min-w-0 truncate font-display text-sm font-semibold text-ink">
              {name}
              {profile?.username && <span className="ml-2 font-mono font-normal text-ink-muted">@{profile.username}</span>}
            </dd>
          </div>
          <div className="grid gap-1 border-b border-line py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
            <dt className="tech-label pt-0.5">SITE ROLES</dt>
            <dd className="min-w-0">
              {siteRoles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {siteRoles.map((role) => (
                    <RoleChip key={role.id} role={role} />
                  ))}
                </div>
              ) : (
                <span className="font-mono text-sm text-ink-dim">只有 @everyone</span>
              )}
            </dd>
          </div>
          {canViewUsers && (
            <div className="grid gap-1 border-b border-line py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt className="tech-label pt-0.5">USERS</dt>
              <dd className="readout text-sm text-ink">{userTotal === undefined ? "--" : userTotal}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* 區塊入口 */}
      <section className="mt-8">
        <p className="tech-label">02 // SECTIONS</p>
        {sections.length === 0 ? (
          <div className="hatch mt-3 border border-line p-10 text-center">
            <p className="tech-label">NO DATA</p>
            <p className="mt-2 text-ink-muted">你還沒有任何後台區塊的權限</p>
          </div>
        ) : (
          <ol className="mt-3 border-t border-line">
            {sections.map((section, i) => (
              <AdminSectionCard
                key={section.href}
                href={section.href}
                index={String(i + 1).padStart(2, "0")}
                title={section.text}
                description={section.description}
                count={section.href === "/admin/users" ? userTotal : undefined}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};

export default AdminHomeClient;
