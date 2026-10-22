"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/errorDialog";
import { loadMyInvitations, respondInvitation } from "@/lib/groups/invites";
import { userPageHref } from "@/lib/users/users";
import { Invitation } from "@/types/Group/Group";
import { UserBrief } from "@/types/Permission/Permission";
import useAuth from "./auth/useAuth";

// 每分鐘重新抓一次，切回分頁時也會抓
const POLL_MS = 60_000;

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

// 導覽列的通知鈴：目前只有「收到的群組邀請」，有未處理的就顯示數字，點開可以直接接受或拒絕
const NotificationBell = () => {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const result = await loadMyInvitations();
    // 資料庫還沒有群組功能等失敗情況，就當沒有通知，不打擾使用者
    if (result.success) setInvitations(result.data);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const run = () => {
      loadMyInvitations().then((result) => {
        if (!cancelled && result.success) setInvitations(result.data);
      });
    };
    run();
    const timer = setInterval(run, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const respond = async (invitation: Invitation, accept: boolean) => {
    setBusy(invitation.id);
    const result = await respondInvitation(invitation.id, accept);
    setBusy(undefined);
    if (!result.success) {
      showError(accept ? "接受邀請失敗" : "拒絕邀請失敗", result.message);
      return;
    }
    setInvitations((list) => list.filter((item) => item.id !== invitation.id));
    if (accept) {
      toast.success(`已加入「${invitation.group.name}」`, { position: "top-right" });
      setOpen(false);
      router.push(`/groups/${invitation.group.id}`);
    } else {
      toast.success("已拒絕邀請", { position: "top-right" });
    }
    reload();
  };

  const count = invitations.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={count > 0 ? `通知，${count} 則未處理` : "通知"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn("relative flex h-9 w-9 items-center justify-center rounded-full text-ink/70 transition-colors hover:bg-surface-1 hover:text-ink", open && "bg-surface-1 text-ink")}
      >
        <FontAwesomeIcon icon={faBell} className="w-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-alarm px-1 text-[10px] font-semibold tabular-nums text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="通知" className="absolute right-0 top-full z-50 w-80 pt-2 max-sm:fixed max-sm:inset-x-3 max-sm:top-16 max-sm:w-auto">
          <div className="overflow-hidden rounded-[18px] border border-line/70 bg-surface shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]">
            <p className="border-b border-line/60 px-4 py-3 text-[15px] font-semibold">通知</p>
            {count === 0 ? (
              <p className="px-4 py-8 text-center text-[15px] text-ink-muted">沒有新的通知</p>
            ) : (
              <ul className="max-h-96 divide-y divide-line/60 overflow-y-auto">
                {invitations.map((invitation) => (
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
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
