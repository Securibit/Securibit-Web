import { Invitation } from "@/types/Group/Group";

export interface InvitationListProps {
  invitations: Invitation[];
  // 接受後回傳群組 id（由父層導頁）
  onAccepted: (groupId: string) => void;
  // 拒絕後從清單移除
  onDeclined: (inviteId: string) => void;
}
