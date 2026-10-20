"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Select, SelectItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faCopy, faPaperPlane, faXmark } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import UserChip from "@/components/permissions/UserChip";
import useAuth from "@/components/auth/useAuth";
import { cancelEmailInvite, createInvite, inviteUser, revokeInvite } from "@/lib/groups/invites";
import { GROUP, has } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { GroupInvite } from "@/types/Group/Group";
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
  invite.max_uses === null ? `不限（已用 ${invite.uses} 次）` : `剩 ${Math.max(0, invite.max_uses - invite.uses)} / ${invite.max_uses} 次`;

// 方形圖示按鈕；danger 版 hover 變警示色
const ICON_BUTTON =
  "flex h-8 w-8 flex-shrink-0 items-center justify-center border border-line text-ink-muted transition-colors hover:border-phos hover:text-phos disabled:opacity-40";
const ICON_BUTTON_DANGER =
  "flex h-8 w-8 flex-shrink-0 items-center justify-center border border-line text-ink-muted transition-colors hover:border-alarm hover:text-alarm disabled:opacity-40";

// 邀請分頁：建立邀請連結、連結列表、Email / @ID 邀請與待回覆清單
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
    toast.success("已建立邀請連結！", { position: "top-right" });
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
      {/* 建立邀請連結（主要區塊） */}
      {canInvite && (
        <section className="panel p-4 sm:p-6">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 md:col-span-5">
              <p className="tech-label">04 // INVITE LINK</p>
              <h2 className="font-display text-lg font-bold text-ink">建立邀請連結</h2>
              <p className="mt-1 text-sm text-ink-muted">
                拿到連結的人登入後就能加入群組，加入後只有 @everyone 的權限。
              </p>
            </div>
            <div className="col-span-12 md:col-span-7">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Select
                  label="有效時間"
                  variant="bordered"
                  selectedKeys={[expiresKey]}
                  disallowEmptySelection
                  onChange={(e) => e.target.value && setExpiresKey(e.target.value)}
                >
                  {EXPIRES_OPTIONS.map((option) => <SelectItem key={option.key}>{option.label}</SelectItem>)}
                </Select>
                <Select
                  label="使用次數"
                  variant="bordered"
                  selectedKeys={[usesKey]}
                  disallowEmptySelection
                  onChange={(e) => e.target.value && setUsesKey(e.target.value)}
                >
                  {USES_OPTIONS.map((option) => <SelectItem key={option.key}>{option.label}</SelectItem>)}
                </Select>
                <Button color="primary" size="lg" className="font-display tracking-[0.08em]" isLoading={creating} onPress={handleCreate}>
                  建立連結
                </Button>
              </div>
              {created && <InviteCreated key={created} code={created} onClose={() => setCreated(undefined)} />}
            </div>
          </div>
        </section>
      )}

      {/* 有效的邀請連結 */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="tech-label">ACTIVE LINKS</p>
            <h2 className="font-display text-lg font-bold text-ink">有效的邀請連結</h2>
          </div>
          <p className="font-mono text-xs text-ink-dim tabular-nums">{detail.invites.length}</p>
        </div>
        {detail.invites.length === 0 ? (
          <div className="hatch border border-line p-8 text-center">
            <p className="tech-label">NO DATA</p>
            <p className="mt-2 text-sm text-ink-muted">目前沒有有效的邀請連結。</p>
          </div>
        ) : (
          <ul className="border-t border-line">
            {detail.invites.map((invite) => {
              const canRevoke = canManageGroup || (!!user && invite.created_by?.id === user.uid);
              return (
                <li
                  key={invite.code}
                  className="flex flex-col gap-3 border-b border-line py-3 transition-colors hover:bg-ink/5 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <code className="inline-block max-w-full truncate border border-line bg-surface-2 px-2 py-1 font-mono text-xs text-ink">
                      {invite.code}
                    </code>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                      <span className="flex items-center gap-1.5">
                        <span className="tech-label">BY</span>
                        <UserChip user={invite.created_by} size="sm" />
                      </span>
                      <span className="font-mono">{remainingText(invite)}</span>
                      <span className="font-mono text-ink-dim">
                        {invite.expires_at ? `EXP ${formatDateTime(invite.expires_at)}` : "永不過期"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => copyInviteUrl(invite.code)}
                      aria-label="複製邀請連結"
                      title="複製"
                      className={ICON_BUTTON}
                    >
                      <FontAwesomeIcon icon={faCopy} className="w-3.5" />
                    </button>
                    {canRevoke && (
                      <button
                        type="button"
                        onClick={() => setRevoking(invite)}
                        aria-label="撤銷邀請連結"
                        title="撤銷"
                        className={ICON_BUTTON_DANGER}
                      >
                        <FontAwesomeIcon icon={faBan} className="w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Email / @ID 邀請 */}
      <section>
        <div className="mb-3">
          <p className="tech-label">DIRECT INVITE</p>
          <h2 className="font-display text-lg font-bold text-ink">用 Email / @ID 邀請</h2>
        </div>
        {canInvite && (
          <div className="mb-5 border border-line bg-surface-1 p-4 sm:p-5">
            <p className="mb-3 text-sm text-ink-muted">
              對方登入後會在「群組」頁看到邀請，可以選擇接受或拒絕。Email 可以是還沒註冊的人。
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleInviteUser();
              }}
            >
              <Input
                aria-label="Email 或 @ID"
                placeholder="name@example.com 或 @someone"
                variant="bordered"
                value={target}
                onValueChange={setTarget}
                autoComplete="off"
                classNames={{ input: "font-mono text-sm" }}
              />
              <Button
                type="submit"
                color="primary"
                className="font-display tracking-[0.08em]"
                isLoading={inviting}
                isDisabled={!target.trim()}
                startContent={!inviting && <FontAwesomeIcon icon={faPaperPlane} className="w-3.5" />}
              >
                邀請
              </Button>
            </form>
          </div>
        )}

        <div className="mb-2 flex items-end justify-between gap-3">
          <p className="tech-label">PENDING // 等待回覆</p>
          <p className="font-mono text-xs text-ink-dim tabular-nums">{detail.email_invites.length}</p>
        </div>
        {detail.email_invites.length === 0 ? (
          <div className="hatch border border-line p-8 text-center">
            <p className="tech-label">NO DATA</p>
            <p className="mt-2 text-sm text-ink-muted">沒有等待回覆的邀請。</p>
          </div>
        ) : (
          <ul className="border-t border-line">
            {detail.email_invites.map((invite) => {
              const canCancel = canInvite || (!!user && invite.invited_by?.id === user.uid);
              return (
                <li
                  key={invite.id}
                  className="flex flex-col gap-2 border-b border-line py-3 transition-colors hover:bg-ink/5 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm text-ink">{invite.email}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                      <span className="flex items-center gap-1.5">
                        <span className="tech-label">BY</span>
                        <UserChip user={invite.invited_by} size="sm" />
                      </span>
                      <span className="font-mono text-ink-dim">{formatDateTime(invite.created_at)}</span>
                    </div>
                  </div>
                  {canCancel && (
                    <Button
                      size="sm"
                      variant="bordered"
                      color="danger"
                      className="font-display tracking-[0.08em]"
                      isLoading={cancelling === invite.id}
                      startContent={cancelling !== invite.id && <FontAwesomeIcon icon={faXmark} className="w-3" />}
                      onPress={() => handleCancel(invite.id)}
                    >
                      取消邀請
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmModal
        isOpen={!!revoking}
        danger
        title="撤銷邀請連結"
        description={`確定要撤銷 ${revoking?.code ?? ""} 嗎？撤銷後這個連結就不能再用來加入群組，已經加入的成員不受影響。`}
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
