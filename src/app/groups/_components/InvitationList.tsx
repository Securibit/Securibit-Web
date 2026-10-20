"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
import UserChip from "@/components/permissions/UserChip";
import { respondInvitation } from "@/lib/groups/invites";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { InvitationListProps } from "@/types/Group/InvitationList";

// 收到的邀請（用 Email / @ID 邀請我的），可以接受或拒絕
const InvitationList = (props: InvitationListProps) => {
  // 正在處理的邀請 id 與動作，鎖住按鈕避免重複送出
  const [pending, setPending] = useState<{ id: string; accept: boolean }>();

  const respond = async (inviteId: string, accept: boolean) => {
    setPending({ id: inviteId, accept });
    const result = await respondInvitation(inviteId, accept);
    setPending(undefined);
    if (!result.success) {
      showError(accept ? "加入群組失敗" : "拒絕邀請失敗", result.message);
      return;
    }
    if (accept && result.data) {
      toast.success("已加入群組！", { position: "top-right" });
      props.onAccepted(result.data);
    } else {
      toast.success("已拒絕邀請", { position: "top-right" });
      props.onDeclined(inviteId);
    }
  };

  return (
    <section className="panel mb-8 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="tech-label flex items-center gap-2">
          <span className="led" aria-hidden />
          PENDING // 收到的邀請
        </p>
        <p className="font-mono text-xs text-ink-dim tabular-nums">{props.invitations.length}</p>
      </div>
      <ul>
        {props.invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="flex flex-col gap-3 border-t border-line py-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-semibold text-ink">{invitation.group.name}</p>
              {invitation.group.description && (
                <p className="line-clamp-2 text-sm text-ink-muted">{invitation.group.description}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span className="tech-label">MEMBERS</span>
                  <span className="font-mono text-ink tabular-nums">{invitation.group.member_count}</span>
                </span>
                {invitation.invited_by && (
                  <span className="flex items-center gap-2">
                    <span className="tech-label">FROM</span>
                    <UserChip user={invitation.invited_by} size="sm" />
                  </span>
                )}
                <span className="font-mono text-ink-dim">{formatDateTime(invitation.created_at)}</span>
              </div>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Button
                variant="bordered"
                className="font-display tracking-[0.08em]"
                isDisabled={!!pending}
                isLoading={pending?.id === invitation.id && !pending.accept}
                onPress={() => respond(invitation.id, false)}
              >
                拒絕
              </Button>
              <Button
                color="primary"
                className="font-display tracking-[0.08em]"
                isDisabled={!!pending}
                isLoading={pending?.id === invitation.id && pending.accept}
                onPress={() => respond(invitation.id, true)}
              >
                接受
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default InvitationList;
