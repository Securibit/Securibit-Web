"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Select, SelectItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAt, faBan, faCopy, faLink, faPaperPlane, faXmark } from "@fortawesome/free-solid-svg-icons";
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

  const sectionClass =
    "rounded-lg border border-gray-blue-200 bg-white p-4 shadow sm:p-6 dark:border-gray-blue-700 dark:bg-gray-blue-800";

  return (
    <div className="flex flex-col gap-6">
      {/* 建立邀請連結 */}
      {canInvite && (
        <section className={sectionClass}>
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <FontAwesomeIcon icon={faLink} className="w-4 text-tpp" />
            建立邀請連結
          </h2>
          <p className="mb-4 text-sm text-gray-blue-500 dark:text-gray-blue-400">
            拿到連結的人登入後就能加入群組，加入後只有 @everyone 的權限。
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <Select
              label="有效時間"
              selectedKeys={[expiresKey]}
              disallowEmptySelection
              onChange={(e) => e.target.value && setExpiresKey(e.target.value)}
            >
              {EXPIRES_OPTIONS.map((option) => <SelectItem key={option.key}>{option.label}</SelectItem>)}
            </Select>
            <Select
              label="使用次數"
              selectedKeys={[usesKey]}
              disallowEmptySelection
              onChange={(e) => e.target.value && setUsesKey(e.target.value)}
            >
              {USES_OPTIONS.map((option) => <SelectItem key={option.key}>{option.label}</SelectItem>)}
            </Select>
            <Button color="primary" size="lg" isLoading={creating} onPress={handleCreate}>
              建立連結
            </Button>
          </div>
          {created && <InviteCreated key={created} code={created} onClose={() => setCreated(undefined)} />}
        </section>
      )}

      {/* 有效的邀請連結 */}
      <section className={sectionClass}>
        <h2 className="mb-3 font-semibold">有效的邀請連結</h2>
        {detail.invites.length === 0 ? (
          <p className="text-sm text-gray-blue-500 dark:text-gray-blue-400">目前沒有有效的邀請連結。</p>
        ) : (
          <ul className="divide-y divide-gray-blue-200 dark:divide-gray-blue-700">
            {detail.invites.map((invite) => {
              const canRevoke = canManageGroup || (!!user && invite.created_by?.id === user.uid);
              return (
                <li key={invite.code} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm text-gray-blue-900 dark:text-white">{invite.code}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-blue-500 dark:text-gray-blue-400">
                      <span className="flex items-center gap-1.5">
                        建立者 <UserChip user={invite.created_by} size="sm" />
                      </span>
                      <span>{remainingText(invite)}</span>
                      <span>{invite.expires_at ? `到期：${formatDateTime(invite.expires_at)}` : "永不過期"}</span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="bordered"
                      startContent={<FontAwesomeIcon icon={faCopy} className="w-3" />}
                      onPress={() => copyInviteUrl(invite.code)}
                    >
                      複製
                    </Button>
                    {canRevoke && (
                      <Button
                        size="sm"
                        variant="bordered"
                        color="danger"
                        startContent={<FontAwesomeIcon icon={faBan} className="w-3" />}
                        onPress={() => setRevoking(invite)}
                      >
                        撤銷
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Email / @ID 邀請 */}
      <section className={sectionClass}>
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <FontAwesomeIcon icon={faAt} className="w-4 text-tpp" />
          用 Email / @ID 邀請
        </h2>
        {canInvite && (
          <>
            <p className="mb-4 text-sm text-gray-blue-500 dark:text-gray-blue-400">
              對方登入後會在「群組」頁看到邀請，可以選擇接受或拒絕。Email 可以是還沒註冊的人。
            </p>
            <form
              className="mb-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleInviteUser();
              }}
            >
              <Input
                aria-label="Email 或 @ID"
                placeholder="name@example.com 或 @someone"
                value={target}
                onValueChange={setTarget}
                autoComplete="off"
              />
              <Button
                type="submit"
                color="primary"
                isLoading={inviting}
                isDisabled={!target.trim()}
                startContent={!inviting && <FontAwesomeIcon icon={faPaperPlane} className="w-3.5" />}
              >
                邀請
              </Button>
            </form>
          </>
        )}

        <h3 className="mb-2 text-sm font-semibold text-gray-blue-600 dark:text-gray-blue-300">等待回覆</h3>
        {detail.email_invites.length === 0 ? (
          <p className="text-sm text-gray-blue-500 dark:text-gray-blue-400">沒有等待回覆的邀請。</p>
        ) : (
          <ul className="divide-y divide-gray-blue-200 dark:divide-gray-blue-700">
            {detail.email_invites.map((invite) => {
              const canCancel = canInvite || (!!user && invite.invited_by?.id === user.uid);
              return (
                <li key={invite.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-blue-900 dark:text-white">{invite.email}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-blue-500 dark:text-gray-blue-400">
                      <span className="flex items-center gap-1.5">
                        邀請人 <UserChip user={invite.invited_by} size="sm" />
                      </span>
                      <span>{formatDateTime(invite.created_at)}</span>
                    </div>
                  </div>
                  {canCancel && (
                    <Button
                      size="sm"
                      variant="bordered"
                      color="danger"
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
