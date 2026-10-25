"use client";

import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/config/supabase";
import useAuth from "@/components/auth/useAuth";
import { loadUnreadCounts } from "@/lib/notifications/notifications";
import { UnreadCounts } from "@/types/Notification/Notification";
import { NotificationsContextValue, NotificationsProviderProps } from "@/types/Notification/NotificationsProvider";

// 即時同步斷線時的備援：每分鐘重抓一次未讀數，切回分頁時也會抓
const POLL_MS = 60_000;
// 短時間內連續的訊號合成一次
const DEBOUNCE_MS = 300;

export const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * 通知的未讀數與即時更新：和 App 一樣用 Realtime 訂閱自己在 sync_signals 的列
 * （database/init.sql「13. 即時同步」），topic 'notifications' 是通知、'invitations' 是群組邀請。
 * 訊號只有 topic 與時間，收到後照原本的 RPC 重新讀取。
 */
const NotificationsProvider = (props: NotificationsProviderProps) => {
  const { user } = useAuth();
  const uid = user?.uid;
  const [counts, setCounts] = useState<UnreadCounts | null>(null);
  const [signal, setSignal] = useState(0);
  const [invitationsSignal, setInvitationsSignal] = useState(0);
  // 換帳號時丟掉舊帳號還沒回來的結果
  const currentUid = useRef<string | undefined>(uid);
  useEffect(() => {
    currentUid.current = uid;
  }, [uid]);

  const reloadCounts = useCallback(async (forUid: string) => {
    const result = await loadUnreadCounts();
    if (currentUid.current !== forUid) return;
    // 資料庫還沒有通知功能等失敗情況，就當沒有通知，不打擾使用者
    setCounts(result.success ? result.data : null);
  }, []);

  const refresh = useCallback(() => {
    if (!uid) return;
    reloadCounts(uid);
    setSignal((value) => value + 1);
  }, [uid, reloadCounts]);

  // 登出就清掉
  const [lastUid, setLastUid] = useState(uid);
  if (lastUid !== uid) {
    setLastUid(uid);
    setCounts(null);
  }

  // 定時重抓與切回分頁
  useEffect(() => {
    if (!uid) return;
    const run = () => {
      reloadCounts(uid);
      setSignal((value) => value + 1);
      setInvitationsSignal((value) => value + 1);
    };
    reloadCounts(uid);
    const timer = setInterval(run, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [uid, reloadCounts]);

  // Realtime：只訂閱 INSERT / UPDATE（DELETE 事件不套用 RLS，資料庫也不會為了通知而刪列）
  useEffect(() => {
    if (!uid) return;
    let pending = { notifications: false, invitations: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let subscribed = false;
    let closed = false;

    const flush = () => {
      timer = undefined;
      if (closed) return;
      const batch = pending;
      pending = { notifications: false, invitations: false };
      if (batch.notifications) {
        reloadCounts(uid);
        setSignal((value) => value + 1);
      }
      if (batch.invitations) setInvitationsSignal((value) => value + 1);
    };

    const onSignal = (payload: { new: Record<string, unknown> }) => {
      const topic = payload.new?.topic;
      if (topic === "notifications") pending.notifications = true;
      else if (topic === "invitations") pending.invitations = true;
      else return;
      if (!timer) timer = setTimeout(flush, DEBOUNCE_MS);
    };

    const filter = `user_id=eq.${uid}`;
    const channel = supabase
      .channel(`notify:${uid}:${Date.now()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sync_signals", filter }, onSignal)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sync_signals", filter }, onSignal)
      .subscribe((status) => {
        if (closed || status !== "SUBSCRIBED") return;
        // 第一次訂閱時剛讀過；之後再收到是斷線重連，斷線期間的訊號收不到，補讀一次
        if (subscribed) {
          pending = { notifications: true, invitations: true };
          if (!timer) timer = setTimeout(flush, DEBOUNCE_MS);
        }
        subscribed = true;
      });

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel).catch(() => {
        // 已經斷線也沒關係，channel 一樣會關掉
      });
    };
  }, [uid, reloadCounts]);

  return (
    <NotificationsContext.Provider value={{ counts: uid ? counts : null, signal, invitationsSignal, refresh }}>
      {props.children}
    </NotificationsContext.Provider>
  );
};

export default NotificationsProvider;
