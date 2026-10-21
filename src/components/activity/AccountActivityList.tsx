"use client";

import { formatDateTime } from "@/lib/utils";
import { describeActivity } from "@/lib/users/activity";
import { AccountActivityListProps } from "@/types/Activity/AccountActivityList";
import usePagedList from "./usePagedList";
import { ListEmpty, ListLoading, LoadMoreButton } from "./ListStates";

// 帳號操作紀錄：一列一件事（中文描述 + 時間）
const AccountActivityList = (props: AccountActivityListProps) => {
  const { items, hasMore, loadingMore, loadMore } = usePagedList(props.load, props.pageSize, "載入操作紀錄失敗");

  if (items === null) return <ListLoading />;
  if (items.length === 0) return <ListEmpty text="還沒有操作紀錄" />;

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
        {items.map((log) => (
          <li key={log.id} className="flex flex-col gap-0.5 px-5 py-3">
            <p className="break-words text-[17px]">{describeActivity(log, props.subjectId, props.viewer)}</p>
            <time dateTime={log.created_at} className="text-[13px] tabular-nums text-ink-muted">
              {formatDateTime(log.created_at)}
            </time>
          </li>
        ))}
      </ul>
      {props.paginate && hasMore && <LoadMoreButton onPress={loadMore} isLoading={loadingMore} />}
    </div>
  );
};

export default AccountActivityList;
