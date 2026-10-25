"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { Tab, Tabs } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faBullhorn, faCircleExclamation, faPeopleGroup, faUserShield } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/errorDialog";
import { loadMyInvitations, respondInvitation } from "@/lib/groups/invites";
import { userPageHref } from "@/lib/users/users";
import {
  loadNotifications,
  markNotificationsRead,
  NOTIFICATION_PAGE_SIZE,
  relativeTime,
  safeNotificationLink,
} from "@/lib/notifications/notifications";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/types";
import Spinner from "@/components/ui/Loading/Spinner";
import { Invitation } from "@/types/Group/Group";
import { UserBrief } from "@/types/Permission/Permission";
import { NotificationItem, NotificationTab } from "@/types/Notification/Notification";
import useAuth from "./auth/useAuth";
import useNotifications from "./notifications/useNotifications";

const TABS: { key: NotificationTab; name: string }[] = [{ key: "all", name: "全部" }, ...NOTIFICATION_CATEGORIES];

// 一個分頁已載入的通知；items 是 null 表示第一頁還在載入
interface TabList {
  items: NotificationItem[] | null;
  hasMore: boolean;
  loadingMore: boolean;
}

const EMPTY_LIST: TabList = { items: null, hasMore: false, loadingMore: false };

const categoryOf = (tab: NotificationTab) => (tab === "all" ? null : tab);

const inviterName = (invitation: Invitation) => {
  const by = invitation.invited_by;
  return by ? by.name || (by.username ? `@${by.username}` : "成員") : "已刪除的使用者";
};

// 名稱的第一個字（用 Array.from 才不會把 emoji 切成一半）
const firstChar = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? "?";

// 邀請人的圓形頭貼：沒有大頭照時顯示名字的第一個字；已刪除的使用者顯示「?」
const inviterAvatar = (by: UserBrief | null) =>
  by?.photo_url ? (
    <img src={by.photo_url} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-1 text-[14px] font-semibold text-ink">
      {by ? firstChar(by.name || by.username || "?") : "?"}
    </span>
  );

// 通知左邊的圖示：依類別；重要公告用紅色驚嘆號
const notificationIcon = (item: NotificationItem) => {
  if (item.type === "announce_important") return <FontAwesomeIcon icon={faCircleExclamation} className="w-4 text-alarm" />;
  const icon = item.category === "account" ? faUserShield : item.category === "feature" ? faPeopleGroup : faBullhorn;
  return <FontAwesomeIcon icon={icon} className="w-4 text-ink-muted" />;
};

// 合併重新讀到的第一頁與原本已載入的：第一頁蓋掉同 id 的舊資料，比第一頁更舊的保留（往下捲載入過的頁數不會不見）
const mergeFirstPage = (old: TabList, page: NotificationItem[]): TabList => {
  if (page.length < NOTIFICATION_PAGE_SIZE || !old.items) {
    return { items: page, hasMore: page.length >= NOTIFICATION_PAGE_SIZE, loadingMore: false };
  }
  // 列表依時間排序（合併的通知會更新時間，id 不一定照順序），所以用位置找「第一頁最後一則」之後的部分
  const ids = new Set(page.map((item) => item.id));
  const lastIndex = old.items.findIndex((item) => item.id === page[page.length - 1].id);
  if (lastIndex < 0) return { items: page, hasMore: true, loadingMore: false };
  const rest = old.items.slice(lastIndex + 1).filter((item) => !ids.has(item.id));
  return { items: [...page, ...rest], hasMore: rest.length > 0 ? old.hasMore : true, loadingMore: false };
};

// 導覽列的通知鈴：未讀數字；點開是通知面板（全部／系統／帳戶／功能），上方另外列出還沒處理的群組邀請
const NotificationBell = () => {
  const { user } = useAuth();
  const { counts, signal, invitationsSignal, refresh } = useNotifications();
  const router = useRouter();
  const pathname = usePathname();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotificationTab>("all");
  const [lists, setLists] = useState<Partial<Record<NotificationTab, TabList>>>({});
  // 通知功能讀不到（資料庫還沒更新）時只顯示群組邀請
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string>();
  // 相對時間的基準，打開面板時更新
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);

  const uid = user?.uid;
  const list = lists[tab] ?? EMPTY_LIST;

  // 換帳號就清掉
  const [lastUid, setLastUid] = useState(uid);
  if (lastUid !== uid) {
    setLastUid(uid);
    setLists({});
    setInvitations([]);
    setOpen(false);
  }

  // 收到的群組邀請（Email／@ID 邀請，可以直接接受或拒絕）
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    loadMyInvitations().then((result) => {
      // 失敗就當沒有邀請，不打擾使用者
      if (!cancelled && result.success) setInvitations(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, invitationsSignal]);

  // 面板打開時讀目前分頁的第一頁；通知有變動（signal）時重讀
  useEffect(() => {
    if (!uid || !open) return;
    let cancelled = false;
    const current = tab;
    loadNotifications(categoryOf(current), null).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setUnavailable(true);
        setLists((old) => ({ ...old, [current]: { items: [], hasMore: false, loadingMore: false } }));
        return;
      }
      setUnavailable(false);
      setLists((old) => ({ ...old, [current]: mergeFirstPage(old[current] ?? EMPTY_LIST, result.data) }));
    });
    return () => {
      cancelled = true;
    };
  }, [uid, open, tab, signal]);

  const loadMore = useCallback(async () => {
    const current = lists[tab];
    if (!current?.items || current.items.length === 0 || !current.hasMore || current.loadingMore) return;
    const lastId = current.items[current.items.length - 1].id;
    setLists((old) => ({ ...old, [tab]: { ...(old[tab] ?? EMPTY_LIST), loadingMore: true } }));
    const result = await loadNotifications(categoryOf(tab), lastId);
    setLists((old) => {
      const prev = old[tab] ?? EMPTY_LIST;
      if (!result.success) return { ...old, [tab]: { ...prev, loadingMore: false } };
      const seen = new Set((prev.items ?? []).map((item) => item.id));
      return {
        ...old,
        [tab]: {
          items: [...(prev.items ?? []), ...result.data.filter((item) => !seen.has(item.id))],
          hasMore: result.data.length >= NOTIFICATION_PAGE_SIZE,
          loadingMore: false,
        },
      };
    });
  }, [lists, tab]);

  // 捲到底自動載入下一頁
  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!open || !root || !target || !list.hasMore) return;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && loadMore(), {
      root,
      rootMargin: "120px",
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [open, list.hasMore, loadMore]);

  // 換頁就關掉
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  // 點外面或按 Esc 關掉
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  // 先在畫面上標成已讀（所有分頁裡同一則或同一類），再送出
  const markLocally = (match: (item: NotificationItem) => boolean) => {
    const readAt = new Date().toISOString();
    setLists((old) => {
      const next: Partial<Record<NotificationTab, TabList>> = {};
      for (const [key, value] of Object.entries(old) as [NotificationTab, TabList][]) {
        next[key] = {
          ...value,
          items: value.items?.map((item) => (!item.read_at && match(item) ? { ...item, read_at: readAt } : item)) ?? null,
        };
      }
      return next;
    });
  };

  const openItem = (item: NotificationItem) => {
    if (!item.read_at) {
      markLocally((other) => other.id === item.id);
      markNotificationsRead([item.id]).then(refresh);
    }
    const link = safeNotificationLink(item.link);
    if (link) {
      setOpen(false);
      router.push(link);
    }
  };

  const markAllRead = async () => {
    const category = categoryOf(tab);
    markLocally((item) => !category || item.category === category);
    const result = await markNotificationsRead(null, category);
    if (!result.success) showError("標為已讀失敗", result.message);
    refresh();
  };

  const respond = async (invitation: Invitation, accept: boolean) => {
    setBusy(invitation.id);
    const result = await respondInvitation(invitation.id, accept);
    setBusy(undefined);
    if (!result.success) {
      showError(accept ? "接受邀請失敗" : "拒絕邀請失敗", result.message);
      return;
    }
    setInvitations((items) => items.filter((item) => item.id !== invitation.id));
    if (accept) {
      toast.success(`已加入「${invitation.group.name}」`, { position: "top-right" });
      setOpen(false);
      router.push(`/groups/${invitation.group.id}`);
    } else {
      toast.success("已拒絕邀請", { position: "top-right" });
    }
    refresh();
  };

  // 資料庫還沒有通知功能時，數字照舊用未處理的邀請數
  const count = counts ? counts.total : invitations.length;
  const tabUnread = counts ? (tab === "all" ? counts.total : counts[tab]) : 0;
  const showInvitations = invitations.length > 0 && (tab === "all" || tab === "feature" || unavailable);
  const items = unavailable ? [] : list.items;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setNow(Date.now());
          setOpen(!open);
        }}
        aria-label={count > 0 ? `通知，${count} 則未讀` : "通知"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn("relative flex h-9 w-9 items-center justify-center rounded-full text-ink/70 transition-colors hover:bg-surface-1 hover:text-ink", open && "bg-surface-1 text-ink")}
      >
        <FontAwesomeIcon icon={faBell} className="w-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-alarm px-1 text-[10px] font-semibold tabular-nums text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="通知" className="absolute right-0 top-full z-50 w-[26rem] pt-2 max-sm:fixed max-sm:inset-x-3 max-sm:top-16 max-sm:w-auto">
          <div className="flex max-h-[min(36rem,calc(100dvh-6rem))] flex-col overflow-hidden rounded-[18px] border border-line/70 bg-surface shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
              <p className="text-[19px] font-bold">通知</p>
              {!unavailable && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={tabUnread === 0}
                  className="text-[15px] font-medium text-accent hover:underline disabled:text-ink-muted disabled:no-underline"
                >
                  全部標為已讀
                </button>
              )}
            </div>

            {!unavailable && (
              <div className="border-b border-line/60 px-3 pb-2">
                <Tabs
                  aria-label="通知分類"
                  variant="light"
                  radius="full"
                  size="sm"
                  fullWidth
                  selectedKey={tab}
                  onSelectionChange={(key) => setTab(key as NotificationTab)}
                  classNames={{
                    tabList: "gap-1 rounded-full bg-surface-1 p-1",
                    tab: "h-8",
                    tabContent: "text-[14px] font-medium text-ink-muted group-data-[selected=true]:text-ink",
                    cursor: "bg-surface shadow-none",
                    panel: "hidden",
                  }}
                >
                  {TABS.map((item) => {
                    const unread = counts ? (item.key === "all" ? counts.total : counts[item.key]) : 0;
                    return (
                      <Tab
                        key={item.key}
                        title={
                          <span className="tabular-nums">
                            {item.name}
                            {unread > 0 && <span className="ml-1 text-alarm">{unread > 99 ? "99+" : unread}</span>}
                          </span>
                        }
                      />
                    );
                  })}
                </Tabs>
              </div>
            )}

            <ul ref={scrollRef} className="min-h-0 flex-1 divide-y divide-line/60 overflow-y-auto overscroll-contain">
              {showInvitations &&
                invitations.map((invitation) => (
                  <li key={invitation.id} className="flex gap-3 px-4 py-3">
                    {/* 頭貼和名字連到邀請人的個人頁面；邀請人已刪除就不能點 */}
                    {invitation.invited_by ? (
                      <Link href={userPageHref(invitation.invited_by.id, invitation.invited_by.username)} onClick={() => setOpen(false)} aria-label={`${inviterName(invitation)} 的個人頁面`} className="shrink-0 rounded-full transition-opacity hover:opacity-80">
                        {inviterAvatar(invitation.invited_by)}
                      </Link>
                    ) : (
                      inviterAvatar(null)
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px]">
                        {invitation.invited_by ? (
                          <Link href={userPageHref(invitation.invited_by.id, invitation.invited_by.username)} onClick={() => setOpen(false)} className="font-semibold hover:underline">
                            {inviterName(invitation)}
                          </Link>
                        ) : (
                          <span className="font-semibold text-ink-muted">{inviterName(invitation)}</span>
                        )}{" "}
                        邀請你加入
                        <span className="font-semibold">「{invitation.group.name}」</span>
                      </p>
                      <div className="mt-2.5 flex gap-2 text-[14px] font-medium">
                        <button type="button" disabled={busy === invitation.id} onClick={() => respond(invitation, true)} className="rounded-full bg-brand px-4 py-1.5 text-accent-ink transition-opacity hover:opacity-85 disabled:opacity-40">
                          接受
                        </button>
                        <button type="button" disabled={busy === invitation.id} onClick={() => respond(invitation, false)} className="rounded-full bg-surface-1 px-4 py-1.5 text-alarm transition-colors hover:bg-line/60 disabled:opacity-40">
                          拒絕
                        </button>
                      </div>
                    </div>
                  </li>
                ))}

              {items === null ? (
                <li className="flex justify-center py-8">
                  <Spinner />
                </li>
              ) : items.length === 0 ? (
                !showInvitations && <li className="px-4 py-10 text-center text-[15px] text-ink-muted">沒有通知</li>
              ) : (
                items.map((item) => {
                  const link = safeNotificationLink(item.link);
                  const read = !!item.read_at;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className={cn("flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-1", !link && read && "cursor-default hover:bg-transparent")}
                      >
                        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-1", read && "opacity-50")}>
                          {notificationIcon(item)}
                        </span>
                        <span className={cn("min-w-0 flex-1", read && "opacity-55")}>
                          <span className="flex items-start justify-between gap-3">
                            <span className={cn("min-w-0 text-[15px] text-ink", read ? "font-medium" : "font-semibold")}>{item.title}</span>
                            <time dateTime={item.created_at} className="shrink-0 pt-0.5 text-[12px] tabular-nums text-ink-muted">
                              {relativeTime(item.created_at, now)}
                            </time>
                          </span>
                          {item.body && <span className="mt-0.5 line-clamp-3 block whitespace-pre-line text-[14px] text-ink-muted">{item.body}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}

              {list.hasMore && !unavailable && (
                <li ref={sentinelRef} className="flex justify-center py-4">
                  {list.loadingMore && <Spinner />}
                </li>
              )}
            </ul>

            {!unavailable && (
              <Link
                href="/me/update_info?tab=notifications"
                onClick={() => setOpen(false)}
                className="border-t border-line/60 px-4 py-3 text-center text-[15px] text-accent hover:bg-surface-1"
              >
                通知設定
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
