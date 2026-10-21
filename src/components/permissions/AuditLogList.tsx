"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import Spinner from "@/components/ui/Loading/Spinner";
import UserChip from "@/components/permissions/UserChip";
import { auditActionText, auditChangeText } from "@/lib/permissions/auditActions";
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
    return <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">還沒有任何紀錄</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
        {logs.map((log) => {
          const target = targetText(log);
          const change = auditChangeText(log.action, log.detail);
          return (
            <li key={log.id} className="grid gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[9.5rem_11rem_1fr] sm:items-center">
              <time dateTime={log.created_at} className="text-[13px] tabular-nums text-ink-muted">
                {formatDateTime(log.created_at)}
              </time>
              {/* 操作者是 null：系統自動做的事（登入時套用身分組、email 同步），或做這件事的人已刪除帳號；資料庫分不出這兩種 */}
              {log.actor ? (
                <UserChip user={log.actor} size="sm" className="min-w-0" />
              ) : (
                <span className="text-[15px] text-ink-muted">系統或已刪除的使用者</span>
              )}
              <p className="min-w-0 text-[15px]">
                <span className="text-ink-muted">{auditActionText(log.action)}</span>
                {target && <span className="ml-2 break-all text-ink">{target}</span>}
                {change && <span className="ml-2 break-all text-ink-muted">{change}</span>}
              </p>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <Button variant="light" color="primary" radius="full" className="self-center text-[17px]" onPress={loadMore} isLoading={loadingMore}>
          載入更多
        </Button>
      )}
    </div>
  );
};

export default AuditLogList;
