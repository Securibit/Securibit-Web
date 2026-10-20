"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { respondInvitation } from "@/lib/groups/invites";
import { showError } from "@/lib/errorDialog";
import { InvitationListProps } from "@/types/Group/InvitationList";

// 收到的邀請（用電子郵件或 @ID 邀請我的），每列可以接受或拒絕
const InvitationList = (props: InvitationListProps) => {
  // 正在處理的邀請 id，鎖住按鈕避免重複送出
  const [pending, setPending] = useState<string>();

  const respond = async (inviteId: string, accept: boolean) => {
    setPending(inviteId);
    const result = await respondInvitation(inviteId, accept);
    setPending(undefined);
    if (!result.success) {
      showError(accept ? "加入群組失敗" : "拒絕邀請失敗", result.message);
      return;
    }
    if (accept && result.data) {
      toast.success("已加入群組", { position: "top-right" });
      props.onAccepted(result.data);
    } else {
      toast.success("已拒絕邀請", { position: "top-right" });
      props.onDeclined(inviteId);
    }
  };

  return (
    <section>
      <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">收到的邀請</h2>
      <ul role="list" className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
        {props.invitations.map((invitation) => (
          <li key={invitation.id} className="flex items-center gap-4 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] text-ink">{invitation.group.name}</p>
              <p className="truncate text-[15px] text-ink-muted tabular-nums">
                {invitation.invited_by ? `由 ${invitation.invited_by.name || "成員"} 邀請` : "邀請人已刪除"}
                {" · "}
                {invitation.group.member_count} 位成員
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4 text-[17px]">
              <button
                type="button"
                disabled={!!pending}
                onClick={() => respond(invitation.id, false)}
                className="text-alarm hover:underline disabled:opacity-40 disabled:hover:no-underline"
              >
                拒絕
              </button>
              <button
                type="button"
                disabled={!!pending}
                onClick={() => respond(invitation.id, true)}
                className="text-accent hover:underline disabled:opacity-40 disabled:hover:no-underline"
              >
                接受
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default InvitationList;
