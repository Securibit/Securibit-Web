"use client";

import Spinner from "@/components/ui/Loading/Spinner";
import { broadcastKindName, platformName } from "@/lib/notifications/types";
import { formatDateTime } from "@/lib/utils";
import { BroadcastHistoryProps } from "@/types/Admin/Broadcast";
import { BroadcastFilter } from "@/types/Notification/Notification";
import { Role } from "@/types/Permission/Permission";

// 對象條件的簡短說明
const filterText = (filter: BroadcastFilter | null | undefined, roles: Role[]) => {
  if (!filter) return "";
  const parts: string[] = [];
  if (filter.all_users) parts.push("所有使用者");
  if (filter.user_ids?.length) parts.push(`${filter.user_ids.length} 位指定的使用者`);
  if (filter.site_role_ids?.length) {
    const names = filter.site_role_ids.map((id) => roles.find((role) => role.id === id)?.name ?? "已刪除的身分組");
    parts.push(`身分組 ${names.join("、")}`);
  }
  if (filter.platforms?.length) parts.push(filter.platforms.map(platformName).join("、"));
  if (filter.session_ids?.length) parts.push(`${filter.session_ids.length} 台指定的裝置`);
  if (filter.version_min || filter.version_max) parts.push(`版本 ${filter.version_min || "不限"} ～ ${filter.version_max || "不限"}`);
  if (filter.last_seen_days) parts.push(`最近 ${filter.last_seen_days} 天用過`);
  return parts.join(" · ");
};

// 發送紀錄：最新的在上面
const BroadcastHistory = (props: BroadcastHistoryProps) => {
  if (props.records === null) {
    return (
      <div className="flex justify-center rounded-[18px] border border-line/70 bg-surface py-6">
        <Spinner />
      </div>
    );
  }
  if (props.records.length === 0) {
    return <div className="rounded-[18px] border border-line/70 bg-surface px-5 py-6 text-center text-[15px] text-ink-muted">還沒有發送過通知</div>;
  }

  return (
    <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
      {props.records.map((record) => {
        const target = filterText(record.filter, props.roles);
        return (
          <li key={record.id} className="px-5 py-3.5">
            <div className="flex items-start justify-between gap-4">
              <p className="min-w-0 text-[17px] font-semibold">
                <span className="mr-2 inline-block rounded-full bg-surface-1 px-2.5 py-0.5 align-[2px] text-[13px] font-medium text-ink-muted">
                  {broadcastKindName(record.kind)}
                </span>
                {record.title}
              </p>
              <time dateTime={record.created_at} className="shrink-0 pt-1 text-[13px] tabular-nums text-ink-muted">
                {formatDateTime(record.created_at)}
              </time>
            </div>
            {record.body && <p className="mt-1 line-clamp-3 whitespace-pre-line text-[15px] text-ink-muted">{record.body}</p>}
            {record.link && <p className="mt-1 truncate text-[13px] text-ink-muted">連結：{record.link}</p>}
            <p className="mt-1 text-[13px] tabular-nums text-ink-muted">
              {record.created_by ? record.created_by.name || (record.created_by.username ? `@${record.created_by.username}` : "管理員") : "已刪除的使用者"}
              {" · "}
              {record.user_count} 位使用者 · {record.device_count} 台裝置
              {target && ` · ${target}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
};

export default BroadcastHistory;
