"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { loadMySessions, revokeMySession, sessionDisplay, signOutOtherSessions } from "@/lib/users/sessions";
import { SessionRecord } from "@/types/Activity/Session";
import { Result } from "@/types/Permission/Permission";
import { ListEmpty, ListLoading } from "./ListStates";

// 確認對話框：登出某一台，或登出其他所有裝置
type Pending = { kind: "one"; session: SessionRecord; name: string } | { kind: "others" };

// 已登入的裝置：一列一個 session（裝置名稱、平台 · App／瀏覽器 · IP、最後活動與首次登入），
// 這台裝置排第一並標出來；其他的可以單獨登出，最下面是「登出其他所有裝置」
const SessionList = () => {
  // null：載入中
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  // 對話框關上後保留內容，關閉動畫時標題不會跳掉
  const [pending, setPending] = useState<Pending>({ kind: "others" });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const ask = (next: Pending) => {
    setPending(next);
    setConfirmOpen(true);
  };

  const apply = useCallback((result: Result<SessionRecord[]>) => {
    if (result.success) {
      setSessions(result.data);
    } else {
      setSessions((old) => old ?? []);
      showError("載入已登入的裝置失敗", result.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadMySessions().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const confirm = async () => {
    const result = pending.kind === "one" ? await revokeMySession(pending.session.id) : await signOutOtherSessions();
    if (!result.success) {
      showError("登出失敗", result.message);
      return;
    }
    toast.success(pending.kind === "one" ? `已登出「${pending.name}」` : "已登出其他所有裝置", { position: "top-right" });
    setConfirmOpen(false);
    apply(await loadMySessions());
  };

  if (sessions === null) return <ListLoading />;
  if (sessions.length === 0) return <ListEmpty text="沒有登入中的裝置" />;

  const hasOthers = sessions.some((session) => !session.current);

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
        {sessions.map((session) => {
          const display = sessionDisplay(session);
          return (
            <li key={session.id} title={session.user_agent ?? undefined} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[17px] font-medium">
                  <span className="truncate">{display.name}</span>
                  {session.current && (
                    <span className="shrink-0 rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] font-normal text-ink-muted">這台裝置</span>
                  )}
                </p>
                <p className="truncate text-[15px] text-ink-muted">
                  {display.platform} · {display.client}
                  {session.ip && <span className="tabular-nums"> · {session.ip}</span>}
                </p>
                <p className="text-[13px] tabular-nums text-ink-muted">
                  最後活動 {formatDateTime(session.last_active_at)}
                  <span className="mx-1.5">·</span>
                  首次登入 {formatDateTime(session.created_at)}
                </p>
              </div>
              {!session.current && (
                <button
                  type="button"
                  onClick={() => ask({ kind: "one", session, name: display.name })}
                  className="shrink-0 text-[17px] font-medium text-accent hover:underline"
                >
                  登出
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {hasOthers && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => ask({ kind: "others" })}
            className="rounded-[18px] border border-line/70 bg-surface py-3 text-center text-[17px] font-medium text-alarm hover:bg-surface-1"
          >
            登出其他所有裝置
          </button>
          <p className="px-5 text-[13px] text-ink-muted">被登出的裝置會在下次更新登入狀態時回到登入畫面，通常在一小時內</p>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        title={pending.kind === "one" ? `登出「${pending.name}」` : "登出其他所有裝置"}
        description={
          pending.kind === "one"
            ? "這台裝置要重新登入才能再使用 Securibit"
            : "除了這台裝置，其他登入中的網站與 App 都要重新登入才能再使用 Securibit"
        }
        confirmLabel="登出"
        danger
        onConfirm={confirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default SessionList;
