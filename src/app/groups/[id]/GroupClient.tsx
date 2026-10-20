"use client";

import { useParams, useSearchParams } from "next/navigation";
import PageContent from "@/components/layout/PageContent";
import GroupView from "./_components/GroupView";

// 群組內頁：主體在 GroupView（後台 /admin/groups/[id] 共用），這裡只決定返回連結與導向
const GroupClient = () => {
  const params = useParams<{ id: string }>();
  // 驗證碼頁的「分享」會帶 ?tab=invites 進來
  const searchParams = useSearchParams();

  return (
    <PageContent className="max-w-3xl">
      <GroupView
        gid={params.id}
        backHref="/groups"
        backText="所有群組"
        backPlacement="right"
        exitHref="/groups"
        initialTab={searchParams.get("tab")}
      />
    </PageContent>
  );
};

export default GroupClient;
