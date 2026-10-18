"use client";

import PersonalCard from "@/components/PersonalCard";
import useAuth from "@/components/auth/useAuth";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";

const MyPageClient = () => {
  // 登入與 profile 載入由 AuthGate / AuthProvider 處理
  const { profile } = useAuth();

  return (
    <PageContent className="max-w-3xl">
      <PageHeader title="個人頁面" />
      {profile ? (
        <PersonalCard profile={profile} />
      ) : (
        <p className="text-gray-blue-500">找不到使用者資料，請重新登入。</p>
      )}
    </PageContent>
  );
};

export default MyPageClient;
