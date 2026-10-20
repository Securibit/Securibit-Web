"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Select, SelectItem } from "@heroui/react";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import useAuth from "@/components/auth/useAuth";
import { cancelEmailInvite, createInvite, inviteUrl, inviteUser, revokeInvite } from "@/lib/groups/invites";
import { GROUP, has } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { GroupInvite } from "@/types/Group/Group";
import { UserBrief } from "@/types/Permission/Permission";
import { GroupInvitesProps } from "@/types/Group/GroupInvites";
import InviteCreated, { copyInviteUrl } from "./InviteCreated";

// 有效時間（小時），null = 永不過期
const EXPIRES_OPTIONS: { key: string; label: string; hours: number | null }[] = [
  { key: "1", label: "1 小時", hours: 1 },
  { key: "24", label: "1 天", hours: 24 },
  { key: "168", label: "7 天", hours: 168 },
  { key: "never", label: "永不過期", hours: null },
];

// 使用次數，null = 不限
const USES_OPTIONS: { key: string; label: string; uses: number | null }[] = [
  { key: "1", label: "1 次", uses: 1 },
  { key: "5", label: "5 次", uses: 5 },
  { key: "10", label: "10 次", uses: 10 },
  { key: "25", label: "25 次", uses: 25 },
  { key: "unlimited", label: "不限次數", uses: null },
];

const remainingText = (invite: GroupInvite) =>
  invite.max_uses === null ? `不限次數，已用 ${invite.uses} 次` : `剩 ${Math.max(0, invite.max_uses - invite.uses)} / ${invite.max_uses} 次`;

const byText = (user: UserBrief | null) => `由 ${user ? user.name || (user.username ? `@${user.username}` : "成員") : "已刪除的使用者"}`;

// 列裡的選單：灰底圓角的小選單
const rowSelectClassNames = {
  base: "w-auto",
  trigger: "h-9 min-h-0 rounded-[10px] bg-surface-1 px-3",
  value: "text-[15px] text-ink",
};

// 邀請分頁：建立邀請連結、連結列表、電子郵件 / @ID 邀請與待回覆清單
const GroupInvites = ({ detail, onChanged }: GroupInvitesProps) => {
  const { user } = useAuth();
  const gid = detail.group.id;
  const canInvite = has(detail.permissions, GROUP.CREATE_INVITE);
  const canManageGroup = has(detail.permissions, GROUP.MANAGE_GROUP);

  const [expiresKey, setExpiresKey] = useState("168");
  const [usesKey, setUsesKey] = useState("unlimited");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string>();
  const [revoking, setRevoking] = useState<GroupInvite>();

  const [target, setTarget] = useState("");
  const [inviting, setInviting] = useState(false);
  const [cancelling, setCancelling] = useState<string>();

  const handleCreate = async () => {
    const hours = EXPIRES_OPTIONS.find((option) => option.key === expiresKey)?.hours ?? null;
    const uses = USES_OPTIONS.find((option) => option.key === usesKey)?.uses ?? null;
    setCreating(true);
    const result = await createInvite(gid, hours, uses);
    setCreating(false);
    if (!result.success) {
      showError("建立邀請連結失敗", result.message);
      return;
    }
    setCreated(result.data);
    toast.success("已建立邀請連結", { position: "top-right" });
    await onChanged();
  };

  const handleRevoke = async (invite: GroupInvite) => {
    const result = await revokeInvite(invite.code);
    if (!result.success) {
      showError("撤銷邀請連結失敗", result.message);
      return;
    }
    if (created === invite.code) setCreated(undefined);
    toast.success("已撤銷邀請連結", { position: "top-right" });
    await onChanged();
  };

  const handleInviteUser = async () => {
    if (!target.trim()) return;
    setInviting(true);
    const result = await inviteUser(gid, target);
    setInviting(false);
    if (!result.success) {
      showError("邀請失敗", result.message);
      return;
    }
    toast.success(`已邀請 ${target.trim()}，對方登入後會在「群組」頁看到邀請`, { position: "top-right" });
    setTarget("");
    await onChanged();
  };

  const handleCancel = async (inviteId: string) => {
    setCancelling(inviteId);
    const result = await cancelEmailInvite(inviteId);
    setCancelling(undefined);
    if (!result.success) {
      showError("取消邀請失敗", result.message);
      return;
    }
    toast.success("已取消邀請", { position: "top-right" });
    await onChanged();
  };

  return (
    <div className="flex flex-col gap-8">
      {/* 建立邀請連結 */}
      {canInvite && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">建立邀請連結</h2>
            <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
              <div className="flex items-center justify-between gap-6 px-5 py-2.5">
                <span className="text-[17px]">有效時間</span>
                <Select
                  aria-label="有效時間"
                  variant="flat"
                  size="sm"
                  classNames={rowSelectClassNames}
                  selectedKeys={[expiresKey]}
                  disallowEmptySelection
                  onChange={(e) => e.target.value && setExpiresKey(e.target.value)}
                >
                  {EXPIRES_OPTIONS.map((option) => <SelectItem key={option.key}>{option.label}</SelectItem>)}
                </Select>
              </div>
              <div className="flex items-center justify-between gap-6 px-5 py-2.5">
                <span className="text-[17px]">使用次數</span>
                <Select
                  aria-label="使用次數"
                  variant="flat"
                  size="sm"
                  classNames={rowSelectClassNames}
                  selectedKeys={[usesKey]}
                  disallowEmptySelection
                  onChange={(e) => e.target.value && setUsesKey(e.target.value)}
                >
                  {USES_OPTIONS.map((option) => <SelectItem key={option.key}>{option.label}</SelectItem>)}
                </Select>
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="w-full py-3 text-center text-[17px] text-accent hover:bg-surface-1 disabled:opacity-40"
              >
                {creating ? "建立中…" : "建立連結"}
              </button>
            </div>
            <p className="mt-2 px-5 text-[13px] text-ink-muted">拿到連結的人登入後就能加入群組，加入後只有 @everyone 的權限</p>
          </div>
          {created && <InviteCreated key={created} code={created} onClose={() => setCreated(undefined)} />}
        </section>
      )}

      {/* 有效的邀請連結 */}
      <section>
        <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">有效的邀請連結</h2>
        {detail.invites.length === 0 ? (
          <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">還沒有邀請連結</div>
        ) : (
          <ul role="list" className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {detail.invites.map((invite) => {
              const canRevoke = canManageGroup || (!!user && invite.created_by?.id === user.uid);
              return (
                <li key={invite.code} className="flex flex-col gap-1.5 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate rounded-[12px] bg-surface-1 px-3.5 py-2 text-[15px] text-ink">
                      {inviteUrl(invite.code)}
                    </span>
                    <button type="button" onClick={() => copyInviteUrl(invite.code)} className="shrink-0 text-[17px] text-accent hover:underline">
                      複製
                    </button>
                    {canRevoke && (
                      <button type="button" onClick={() => setRevoking(invite)} className="shrink-0 text-[17px] text-alarm hover:underline">
                        撤銷
                      </button>
                    )}
                  </div>
                  <p className="truncate px-1 text-[13px] text-ink-muted tabular-nums">
                    {byText(invite.created_by)}建立 · {remainingText(invite)} · {invite.expires_at ? `${formatDateTime(invite.expires_at)} 到期` : "永不過期"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 電子郵件 / @ID 邀請 */}
      <section>
        <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">用電子郵件或 @ID 邀請</h2>
        <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
          {canInvite && (
            <form
              className="flex items-center gap-3 px-5 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleInviteUser();
              }}
            >
              <input
                aria-label="電子郵件或 @ID"
                placeholder="name@example.com 或 @someone"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                autoComplete="off"
                className="min-w-0 flex-1 rounded-[12px] bg-surface-1 px-3.5 py-2 text-[17px] text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-accent/40"
              />
              <button
                type="submit"
                disabled={inviting || !target.trim()}
                className="shrink-0 text-[17px] text-accent hover:underline disabled:opacity-40 disabled:hover:no-underline"
              >
                {inviting ? "邀請中…" : "邀請"}
              </button>
            </form>
          )}
          {detail.email_invites.length === 0 ? (
            <p className="px-5 py-3 text-[15px] text-ink-muted">沒有等待回覆的邀請</p>
          ) : (
            detail.email_invites.map((invite) => {
              const canCancel = canInvite || (!!user && invite.invited_by?.id === user.uid);
              return (
                <div key={invite.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] text-ink">{invite.email}</p>
                    <p className="truncate text-[13px] text-ink-muted">
                      {byText(invite.invited_by)}邀請 · {formatDateTime(invite.created_at)}
                    </p>
                  </div>
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => handleCancel(invite.id)}
                      disabled={cancelling === invite.id}
                      className="shrink-0 text-[17px] text-alarm hover:underline disabled:opacity-40"
                    >
                      取消
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        {canInvite && (
          <p className="mt-2 px-5 text-[13px] text-ink-muted">對方登入後會在「群組」頁看到邀請，可以接受或拒絕；電子郵件可以是還沒註冊的人</p>
        )}
      </section>

      <ConfirmModal
        isOpen={!!revoking}
        danger
        title="撤銷邀請連結"
        description="撤銷後這個連結就不能再用來加入群組，已經加入的成員不受影響。"
        confirmLabel="撤銷"
        onCancel={() => setRevoking(undefined)}
        onConfirm={async () => {
          const invite = revoking;
          setRevoking(undefined);
          if (invite) await handleRevoke(invite);
        }}
      />
    </div>
  );
};

export default GroupInvites;
