"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelopeOpenText, faUsers } from "@fortawesome/free-solid-svg-icons";
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
    <section className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-blue-900 dark:text-white">
        <FontAwesomeIcon icon={faEnvelopeOpenText} className="w-4 text-tpp" />
        收到的邀請
      </h2>
      <ul className="divide-y divide-gray-blue-200 rounded-lg border border-gray-blue-200 bg-white shadow dark:divide-gray-blue-700 dark:border-gray-blue-700 dark:bg-gray-blue-800">
        {props.invitations.map((invitation) => (
          <li key={invitation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-gray-blue-900 dark:text-white">{invitation.group.name}</p>
              {invitation.group.description && (
                <p className="line-clamp-2 text-sm text-gray-blue-500 dark:text-gray-blue-400">
                  {invitation.group.description}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-blue-500 dark:text-gray-blue-400">
                <span className="flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faUsers} className="w-3.5" />
                  {invitation.group.member_count} 位成員
                </span>
                {invitation.invited_by && (
                  <span className="flex items-center gap-2">
                    邀請人
                    <UserChip user={invitation.invited_by} size="sm" />
                  </span>
                )}
                <span>{formatDateTime(invitation.created_at)}</span>
              </div>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Button
                variant="bordered"
                isDisabled={!!pending}
                isLoading={pending?.id === invitation.id && !pending.accept}
                onPress={() => respond(invitation.id, false)}
              >
                拒絕
              </Button>
              <Button
                color="primary"
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
