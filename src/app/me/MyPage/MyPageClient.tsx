"use client";

import PersonalCard from "@/components/PersonalCard";
import useAuth from "@/components/auth/useAuth";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";

const MyPageClient = () => {
  // 登入與 profile 載入由 AuthGate / AuthProvider 處理
  const { profile, siteRoles } = useAuth();

  return (
    <PageContent className="max-w-3xl">
      <PageHeader index="00 // PROFILE" title="個人頁面" subtitle="你的帳戶資料與登入紀錄" />
      {profile ? (
        <PersonalCard profile={profile} siteRoles={siteRoles} />
      ) : (
        <div className="hatch border border-line p-10 text-center">
          <p className="tech-label">NO PROFILE</p>
          <p className="mt-2 text-ink-muted">找不到使用者資料，請重新登入。</p>
        </div>
      )}
    </PageContent>
  );
};

export default MyPageClient;
