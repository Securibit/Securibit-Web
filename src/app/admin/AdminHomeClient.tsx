"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import RoleChip from "@/components/permissions/RoleChip";
import useAuth from "@/components/auth/useAuth";
import { loadAdminUsers } from "@/lib/admin/admin";
import { SITE } from "@/lib/permissions/bits";
import AdminSectionCard from "./_components/AdminSectionCard";
import { ADMIN_SECTIONS } from "./_components/sections";

// 後台總覽：歡迎文字、自己的全站身分組、各區塊入口
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
  // 總覽本身不放卡片
  const sections = ADMIN_SECTIONS.filter((section) => section.href !== "/admin" && can(section.permission));

  return (
    <>
      <PageHeader title="後台" subtitle={`歡迎回來，${name}`} />

      <section className="mb-6 rounded-lg border border-gray-blue-200 p-4 dark:border-gray-blue-700">
        <h2 className="mb-2 text-sm font-semibold text-gray-blue-500 dark:text-gray-blue-400">我的全站身分組</h2>
        {siteRoles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {siteRoles.map((role) => (
              <RoleChip key={role.id} role={role} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-blue-500 dark:text-gray-blue-400">只有 @everyone</p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <AdminSectionCard
            key={section.href}
            href={section.href}
            icon={section.icon}
            title={section.text}
            description={section.description}
            count={section.href === "/admin/users" ? userTotal : undefined}
          />
        ))}
      </div>
    </>
  );
};

export default AdminHomeClient;
