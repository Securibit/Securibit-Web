"use client";

import { useEffect, useState } from "react";
import Spinner from "@/components/ui/Loading/Spinner";
import { loadAdminUserSessions } from "@/lib/admin/admin";
import { sessionDisplay } from "@/lib/users/sessions";
import { formatDateTime } from "@/lib/utils";
import { SessionRecord } from "@/types/Activity/Session";
import { BroadcastDevicePickerProps } from "@/types/Admin/Broadcast";
import CheckRow from "./CheckRow";

// 發送通知的「指定裝置」：列出已選使用者登入中的裝置，勾選的才收得到推播；都沒勾就是他們所有裝置
const DevicePicker = (props: BroadcastDevicePickerProps) => {
  // 使用者 id → 裝置；沒有這個 key 表示還在載入，null 表示讀不到
  const [sessions, setSessions] = useState<Record<string, SessionRecord[] | null>>({});

  const userIds = props.users.map((user) => user.id).join(",");

  useEffect(() => {
    let cancelled = false;
    for (const id of userIds ? userIds.split(",") : []) {
      if (id in sessions) continue;
      loadAdminUserSessions(id).then((result) => {
        if (cancelled) return;
        setSessions((old) => ({ ...old, [id]: result.success ? result.data : null }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [userIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // 使用者被移除後，拿掉他已勾選的裝置
  const { selected, onChange } = props;
  useEffect(() => {
    const ids = userIds ? userIds.split(",") : [];
    if (ids.some((id) => sessions[id] === undefined)) return;
    const valid = new Set(ids.flatMap((id) => (sessions[id] ?? []).map((session) => session.id)));
    if (selected.some((id) => !valid.has(id))) onChange(selected.filter((id) => valid.has(id)));
  }, [userIds, sessions, selected, onChange]);

  const toggle = (sessionId: string) =>
    props.onChange(
      props.selected.includes(sessionId) ? props.selected.filter((id) => id !== sessionId) : [...props.selected, sessionId]
    );

  return (
    <div className="flex flex-col gap-4">
      {props.users.map((user) => {
        const list = sessions[user.id];
        return (
          <div key={user.id}>
            <p className="mb-1.5 truncate px-5 text-[13px] text-ink-muted">{user.name || user.email}</p>
            <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
              {list === undefined ? (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              ) : list === null ? (
                <p className="px-5 py-3 text-[15px] text-ink-muted">讀不到這位使用者的裝置</p>
              ) : list.length === 0 ? (
                <p className="px-5 py-3 text-[15px] text-ink-muted">沒有登入中的裝置</p>
              ) : (
                list.map((session) => {
                  const display = sessionDisplay(session);
                  return (
                    <CheckRow
                      key={session.id}
                      checked={props.selected.includes(session.id)}
                      onToggle={() => toggle(session.id)}
                      description={`${display.platform} · ${display.client} · 最後活動 ${formatDateTime(session.last_active_at)}`}
                    >
                      {display.name}
                    </CheckRow>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DevicePicker;
