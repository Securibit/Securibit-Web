"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightLeft, faTags, faUserMinus } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import UserChip from "@/components/permissions/UserChip";
import RoleChip from "@/components/permissions/RoleChip";
import RoleAssignModal from "@/components/permissions/RoleAssignModal";
import useAuth from "@/components/auth/useAuth";
import { kickMember, setMemberRoles, transferGroup } from "@/lib/groups/groups";
import { GROUP, has } from "@/lib/permissions/bits";
import { canManageMember, sortRoles } from "@/lib/permissions/hierarchy";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { GroupMember } from "@/types/Group/Group";
import { GroupMembersProps } from "@/types/Group/GroupMembers";

const displayName = (member: GroupMember) =>
  member.name || (member.username ? `@${member.username}` : member.email || "這位成員");

// 成員分頁：列表、指派身分組、移除、轉移擁有權
const GroupMembers = ({ detail, actor, onChanged }: GroupMembersProps) => {
  const { user } = useAuth();
  const gid = detail.group.id;
  const canAssign = has(detail.permissions, GROUP.MANAGE_ROLES);
  const canKick = has(detail.permissions, GROUP.KICK_MEMBERS);

  const [assigning, setAssigning] = useState<GroupMember>();
  const [kicking, setKicking] = useState<GroupMember>();
  const [transferring, setTransferring] = useState<GroupMember>();

  // 身分組依高到低（@everyone 每個人都有，不顯示）
  const roles = useMemo(() => sortRoles(detail.roles), [detail.roles]);

  // 擁有者最前面，其餘依最高身分組、再依名稱
  const members = useMemo(
    () =>
      [...detail.members].sort(
        (a, b) =>
          Number(b.is_owner) - Number(a.is_owner) ||
          b.top_position - a.top_position ||
          displayName(a).localeCompare(displayName(b))
      ),
    [detail.members]
  );

  const handleKick = async (member: GroupMember) => {
    const result = await kickMember(gid, member.id);
    if (!result.success) {
      showError("移除成員失敗", result.message);
      return;
    }
    toast.success(`已將 ${displayName(member)} 移出群組`, { position: "top-right" });
    await onChanged();
  };

  const handleTransfer = async (member: GroupMember) => {
    const result = await transferGroup(gid, member.id);
    if (!result.success) {
      showError("轉移擁有權失敗", result.message);
      return;
    }
    toast.success(`已將擁有權轉移給 ${displayName(member)}`, { position: "top-right" });
    await onChanged();
  };

  return (
    <div>
      <div className="mb-4">
        <p className="tech-label">02 // MEMBERS</p>
        <h2 className="font-display text-lg font-bold text-ink">
          成員 <span className="font-mono text-sm font-normal text-ink-dim">{members.length}</span>
        </h2>
      </div>

      <ul className="border-t border-line">
        {members.map((member) => {
          const manageable = canManageMember(actor, member);
          const isSelf = member.id === user?.uid;
          const memberRoles = roles.filter((role) => !role.is_default && member.role_ids.includes(role.id));
          return (
            <li
              key={member.id}
              className="flex flex-col gap-3 border-b border-line py-3 transition-colors hover:bg-ink/5 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <UserChip user={member} />
                  {member.is_owner && (
                    <span className="tech-label border border-phos px-1.5 py-0.5 text-phos" title="群組擁有者">
                      OWNER
                    </span>
                  )}
                  {isSelf && <span className="tech-label border border-line px-1.5 py-0.5">YOU</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {memberRoles.map((role) => (
                    <RoleChip key={role.id} role={role} />
                  ))}
                  <span className="font-mono text-[11px] tracking-[0.04em] text-ink-dim">
                    JOINED {formatDateTime(member.joined_at)}
                  </span>
                </div>
              </div>
              <div className="flex flex-shrink-0 flex-wrap gap-2">
                {canAssign && manageable && (
                  <Button
                    size="sm"
                    variant="bordered"
                    className="font-display tracking-[0.08em]"
                    startContent={<FontAwesomeIcon icon={faTags} className="w-3" />}
                    onPress={() => setAssigning(member)}
                  >
                    身分組
                  </Button>
                )}
                {detail.is_owner && !member.is_owner && (
                  <Button
                    size="sm"
                    variant="bordered"
                    className="font-display tracking-[0.08em]"
                    startContent={<FontAwesomeIcon icon={faRightLeft} className="w-3" />}
                    onPress={() => setTransferring(member)}
                  >
                    轉移擁有權
                  </Button>
                )}
                {canKick && manageable && !isSelf && (
                  <Button
                    size="sm"
                    variant="bordered"
                    color="danger"
                    className="font-display tracking-[0.08em]"
                    startContent={<FontAwesomeIcon icon={faUserMinus} className="w-3" />}
                    onPress={() => setKicking(member)}
                  >
                    移除
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {assigning && (
        <RoleAssignModal
          isOpen
          onClose={() => setAssigning(undefined)}
          title={`指派身分組給 ${displayName(assigning)}`}
          roles={detail.roles}
          selected={assigning.role_ids}
          actor={actor}
          onSave={async (roleIds) => {
            const result = await setMemberRoles(gid, assigning.id, roleIds);
            if (result.success) await onChanged();
            return result;
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!kicking}
        danger
        title="移除成員"
        description={`確定要將 ${kicking ? displayName(kicking) : ""} 移出群組嗎？對方之後要重新受邀才能再加入。`}
        confirmLabel="移除"
        onCancel={() => setKicking(undefined)}
        onConfirm={async () => {
          const member = kicking;
          setKicking(undefined);
          if (member) await handleKick(member);
        }}
      />

      <ConfirmModal
        isOpen={!!transferring}
        danger
        title="轉移擁有權"
        description={
          <div className="flex flex-col gap-2">
            <p className="text-ink">確定要把群組擁有權轉移給 {transferring ? displayName(transferring) : ""} 嗎？</p>
            <p className="text-sm text-ink-muted">
              轉移後你會變成一般成員（保留目前的身分組），不能再刪除群組或轉移擁有權，也可能失去部分權限。這個動作只有新的擁有者能再轉回來。
            </p>
          </div>
        }
        confirmLabel="轉移"
        onCancel={() => setTransferring(undefined)}
        onConfirm={async () => {
          const member = transferring;
          setTransferring(undefined);
          if (member) await handleTransfer(member);
        }}
      />
    </div>
  );
};

export default GroupMembers;
