"use client";

import { useState } from "react";
import Link from "next/link";
import { Tab, Tabs } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import useAuth from "@/components/auth/useAuth";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";
import LoginHistoryList from "@/components/activity/LoginHistoryList";
import AccountActivityList from "@/components/activity/AccountActivityList";
import { loadMyAccountActivity, loadMyLoginHistory } from "@/lib/users/activity";
import { ActivityClientProps, ActivityTab } from "@/types/Activity/ActivityClient";

const PAGE_SIZE = 20;
// 放在元件外面，每次重繪都是同一個函式
const loadLogins = (beforeId: number | null) => loadMyLoginHistory(beforeId, PAGE_SIZE);
const loadActivity = (beforeId: number | null) => loadMyAccountActivity(beforeId, PAGE_SIZE);

// 自己的全部登入紀錄與帳號操作紀錄（分頁「載入更多」）
const ActivityClient = (props: ActivityClientProps) => {
  // 登入由 AuthGate 處理
  const { user } = useAuth();
  const [tab, setTab] = useState<ActivityTab>(props.initialTab);

  return (
    <PageContent className="max-w-2xl">
      <Link href="/me/MyPage" className="mb-3 inline-flex items-center gap-1.5 text-[17px] text-accent hover:underline">
        <FontAwesomeIcon icon={faChevronLeft} className="w-2.5" />
        個人頁面
      </Link>
      <PageHeader title="活動紀錄" subtitle="你的每次登入，以及帳號資料、加密、身分組與群組的變更" />

      <Tabs
        aria-label="活動紀錄分頁"
        variant="light"
        radius="full"
        fullWidth
        selectedKey={tab}
        onSelectionChange={(key) => setTab(key as ActivityTab)}
        // 切換分頁時保留已載入的頁數
        destroyInactiveTabPanel={false}
        classNames={{
          tabList: "gap-1 rounded-full bg-surface-1 p-1",
          tab: "h-9",
          tabContent: "text-[15px] text-ink-muted group-data-[selected=true]:text-ink",
          cursor: "bg-surface shadow-none",
          panel: "px-0 pt-6",
        }}
      >
        <Tab key="login" title="登入">
          <LoginHistoryList load={loadLogins} pageSize={PAGE_SIZE} paginate />
        </Tab>
        <Tab key="activity" title="操作">
          {user && <AccountActivityList load={loadActivity} pageSize={PAGE_SIZE} subjectId={user.uid} viewer="self" paginate />}
        </Tab>
      </Tabs>
    </PageContent>
  );
};

export default ActivityClient;
