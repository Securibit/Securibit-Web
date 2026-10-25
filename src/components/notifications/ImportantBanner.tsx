"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import useAuth from "@/components/auth/useAuth";
import { loadNotifications, markNotificationsRead, safeNotificationLink } from "@/lib/notifications/notifications";
import { showError } from "@/lib/errorDialog";
import { NotificationItem } from "@/types/Notification/Notification";
import useNotifications from "./useNotifications";

// 登入後有未讀的重要公告時，在導覽列下方顯示最新的一則；關掉就是標為已讀，還有下一則就接著顯示
const ImportantBanner = () => {
  const { user } = useAuth();
  const { counts, signal, refresh } = useNotifications();
  const [notices, setNotices] = useState<NotificationItem[]>([]);
  const [closing, setClosing] = useState<number>();

  const uid = user?.uid;
  // 系統類有未讀才去讀列表
  const hasSystemUnread = (counts?.system ?? 0) > 0;

  // 換帳號就清掉
  const [lastUid, setLastUid] = useState(uid);
  if (lastUid !== uid) {
    setLastUid(uid);
    setNotices([]);
  }

  useEffect(() => {
    if (!uid || !hasSystemUnread) return;
    let cancelled = false;
    loadNotifications("system", null).then((result) => {
      if (cancelled || !result.success) return;
      setNotices(result.data.filter((item) => item.type === "announce_important" && !item.read_at));
    });
    return () => {
      cancelled = true;
    };
  }, [uid, hasSystemUnread, signal]);

  // 登出、或系統類已經沒有未讀時不顯示
  const notice = uid && hasSystemUnread ? notices[0] : undefined;
  if (!notice) return null;

  const link = safeNotificationLink(notice.link);

  const dismiss = async () => {
    setClosing(notice.id);
    const result = await markNotificationsRead([notice.id]);
    setClosing(undefined);
    if (!result.success) {
      showError("關閉公告失敗", result.message);
      return;
    }
    setNotices((items) => items.filter((item) => item.id !== notice.id));
    refresh();
  };

  return (
    <div className="px-4 pt-4 sm:px-6">
      <div role="status" className="mx-auto flex max-w-5xl items-start gap-3 rounded-[18px] border border-line/70 bg-surface-1 px-5 py-4">
        <FontAwesomeIcon icon={faCircleExclamation} className="mt-1 w-[18px] shrink-0 text-alarm" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold">{notice.title}</p>
          {notice.body && <p className="mt-0.5 whitespace-pre-line text-[15px] text-ink-muted">{notice.body}</p>}
          {link && (
            <Link href={link} onClick={dismiss} className="link-arrow mt-1.5 inline-block text-[15px] font-medium">
              查看詳情
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          disabled={closing === notice.id}
          aria-label="關閉公告"
          className="-mr-2 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-line/60 hover:text-ink disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faXmark} className="w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default ImportantBanner;
