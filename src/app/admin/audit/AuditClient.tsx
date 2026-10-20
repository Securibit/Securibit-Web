"use client";

import PageHeader from "@/components/layout/PageHeader";
import AuditLogList from "@/components/permissions/AuditLogList";
import useAuth from "@/components/auth/useAuth";
import { loadAdminAuditLog } from "@/lib/admin/admin";
import { SITE, SITE_PERMISSIONS, permissionName } from "@/lib/permissions/bits";
import NoPermission from "../_components/NoPermission";

// 放在元件外面，每次重繪都是同一個函式（AuditLogList 可能拿它當 effect 依賴）
const loadLog = (beforeId: number | null) => loadAdminAuditLog(beforeId);

// 全站操作紀錄（不含群組內的紀錄）
const AuditClient = () => {
  const { can } = useAuth();

  if (!can(SITE.VIEW_AUDIT_LOG)) {
    return <NoPermission permission={permissionName(SITE_PERMISSIONS, SITE.VIEW_AUDIT_LOG)} />;
  }

  return (
    <div className="boot">
      <PageHeader index="04 // AUDIT LOG" title="操作紀錄" subtitle="全站的身分組、使用者與 2FA 相關操作" />
      <AuditLogList load={loadLog} />
    </div>
  );
};

export default AuditClient;
