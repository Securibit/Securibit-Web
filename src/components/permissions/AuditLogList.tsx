"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import Spinner from "@/components/ui/Loading/Spinner";
import UserChip from "@/components/permissions/UserChip";
import { auditActionText } from "@/lib/permissions/auditActions";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { AuditLog } from "@/types/Permission/Permission";
import { AuditLogListProps } from "@/types/Permission/AuditLogList";

const TARGET_TYPE_TEXT: Record<string, string> = {
  role: "身分組",
  user: "使用者",
  member: "成員",
  account: "驗證碼",
  invite: "邀請",
  group: "群組",
};

// 目標的簡短說明：類型 +（detail.name 或縮短的 id）
const targetText = (log: AuditLog) => {
  if (!log.target_type && !log.target_id) return null;
  const type = log.target_type ? (TARGET_TYPE_TEXT[log.target_type] ?? log.target_type) : "";
  const name = typeof log.detail?.name === "string" && log.detail.name ? `「${log.detail.name}」` : "";
  const id = !name && log.target_id ? (log.target_id.length > 12 ? `${log.target_id.slice(0, 8)}…` : log.target_id) : "";
  return [type, name || id].filter(Boolean).join(" ");
};

// 操作紀錄列表：掛上時載入第一頁，「載入更多」用最後一筆的 id 往前載入
// load 換了（例如換群組）時請由外層用 key 重新掛載
const AuditLogList = (props: AuditLogListProps) => {
  const pageSize = props.pageSize ?? 50;
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    props.load(null).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setLogs(result.data);
        setHasMore(result.data.length >= pageSize);
      } else {
        setLogs([]);
        showError("載入操作紀錄失敗", result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (!logs || logs.length === 0) return;
    setLoadingMore(true);
    const result = await props.load(logs[logs.length - 1].id);
    setLoadingMore(false);
    if (!result.success) {
      showError("載入操作紀錄失敗", result.message);
      return;
    }
    // 避免重複（同一頁被載入兩次時）
    setLogs((old) => {
      const seen = new Set((old ?? []).map((log) => log.id));
      return [...(old ?? []), ...result.data.filter((log) => !seen.has(log.id))];
    });
    setHasMore(result.data.length >= pageSize);
  };

  if (logs === null) return <Spinner />;

  if (logs.length === 0) {
    return (
      <div className="hatch border border-line p-10 text-center">
        <p className="tech-label">NO DATA</p>
        <p className="mt-2 text-ink-muted">還沒有任何紀錄</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="border-t border-line">
        {logs.map((log) => {
          const target = targetText(log);
          return (
            <li
              key={log.id}
              className="grid gap-x-4 gap-y-1 border-b border-line py-3 transition-colors hover:bg-ink/5 sm:grid-cols-[10.5rem_12rem_1fr] sm:items-center"
            >
              <time dateTime={log.created_at} className="font-mono text-xs tabular-nums text-ink-dim">
                {formatDateTime(log.created_at)}
              </time>
              <UserChip user={log.actor} size="sm" className="min-w-0" />
              <p className="min-w-0 text-sm">
                <span className="font-display font-medium tracking-wide text-ink-muted">{auditActionText(log.action)}</span>
                {target && <span className="ml-2 break-all text-ink">{target}</span>}
              </p>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <Button
          variant="bordered"
          className="self-center font-display tracking-[0.08em]"
          onPress={loadMore}
          isLoading={loadingMore}
        >
          載入更多
        </Button>
      )}
    </div>
  );
};

export default AuditLogList;
