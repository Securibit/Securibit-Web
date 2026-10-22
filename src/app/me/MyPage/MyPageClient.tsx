"use client";

import PersonalCard from "@/components/PersonalCard";
import useAuth from "@/components/auth/useAuth";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";
import ActivitySection from "@/components/activity/ActivitySection";
import LoginHistoryList from "@/components/activity/LoginHistoryList";
import AccountActivityList from "@/components/activity/AccountActivityList";
import SessionList from "@/components/activity/SessionList";
import { loadMyAccountActivity, loadMyLoginHistory } from "@/lib/users/activity";

// 個人頁面只顯示最近幾筆，按「全部」到 /me/activity
const PREVIEW_SIZE = 5;
const loadLogins = (beforeId: number | null) => loadMyLoginHistory(beforeId, PREVIEW_SIZE);
const loadActivity = (beforeId: number | null) => loadMyAccountActivity(beforeId, PREVIEW_SIZE);

const MyPageClient = () => {
  // 登入與 profile 載入由 AuthGate / AuthProvider 處理
  const { profile, siteRoles } = useAuth();

  return (
    <PageContent className="max-w-2xl">
      <PageHeader title="個人頁面" />
      {profile ? (
        <PersonalCard profile={profile} siteRoles={siteRoles}>
          <ActivitySection title="已登入的裝置">
            <SessionList />
          </ActivitySection>
          <ActivitySection title="登入紀錄" href="/me/activity?tab=login">
            <LoginHistoryList load={loadLogins} pageSize={PREVIEW_SIZE} />
          </ActivitySection>
          <ActivitySection title="帳號操作紀錄" href="/me/activity?tab=activity">
            <AccountActivityList load={loadActivity} pageSize={PREVIEW_SIZE} subjectId={profile.uid} viewer="self" />
          </ActivitySection>
        </PersonalCard>
      ) : (
        <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">找不到使用者資料，請重新登入</div>
      )}
    </PageContent>
  );
};

export default MyPageClient;
