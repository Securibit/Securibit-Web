"use client";

import PersonalCard from "@/components/PersonalCard";
import useAuth from "@/components/auth/useAuth";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";

const MyPageClient = () => {
  // 登入與 profile 載入由 AuthGate / AuthProvider 處理
  const { profile, siteRoles } = useAuth();

  return (
    <PageContent className="max-w-2xl">
      <PageHeader title="個人頁面" />
      {profile ? (
        <PersonalCard profile={profile} siteRoles={siteRoles} />
      ) : (
        <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">找不到使用者資料，請重新登入</div>
      )}
    </PageContent>
  );
};

export default MyPageClient;
