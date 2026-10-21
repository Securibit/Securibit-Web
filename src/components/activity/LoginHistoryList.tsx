"use client";

import { formatDateTime } from "@/lib/utils";
import { providerText } from "@/lib/users/activity";
import { LoginHistoryListProps } from "@/types/Activity/LoginHistoryList";
import usePagedList from "./usePagedList";
import { ListEmpty, ListLoading, LoadMoreButton } from "./ListStates";

// 登入紀錄：一列一次登入（裝置、登入方式 · IP、時間），最新的一筆標「最近一次」
const LoginHistoryList = (props: LoginHistoryListProps) => {
  const { items, hasMore, loadingMore, loadMore } = usePagedList(props.load, props.pageSize, "載入登入紀錄失敗");

  if (items === null) return <ListLoading />;
  if (items.length === 0) return <ListEmpty text="還沒有登入紀錄" />;

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
        {items.map((record, index) => (
          <li key={record.id} title={record.user_agent ?? undefined} className="flex items-start justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[17px]">
                <span className="truncate">{record.device || "未知裝置"}</span>
                {index === 0 && (
                  <span className="shrink-0 rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-accent">最近一次</span>
                )}
              </p>
              <p className="truncate text-[13px] tabular-nums text-ink-muted">
                {providerText(record.provider)}
                {" · "}
                {/* null = 管理員管不到對方，資料庫不給 IP */}
                {record.ip === null ? "IP 不公開" : record.ip || "未知 IP"}
              </p>
            </div>
            <time dateTime={record.created_at} className="shrink-0 pt-0.5 text-[13px] tabular-nums text-ink-muted">
              {formatDateTime(record.created_at)}
            </time>
          </li>
        ))}
      </ul>
      {props.paginate && hasMore && <LoadMoreButton onPress={loadMore} isLoading={loadingMore} />}
    </div>
  );
};

export default LoginHistoryList;
