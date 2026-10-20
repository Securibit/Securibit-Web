"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faEllipsis, faRightLeft, faTags, faUserMinus } from "@fortawesome/free-solid-svg-icons";
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

type MenuKey = "roles" | "transfer" | "kick";

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
    <section>
      <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">共 {members.length} 位成員</h2>
      <ul role="list" className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
        {members.map((member) => {
          const manageable = canManageMember(actor, member);
          const isSelf = member.id === user?.uid;
          const memberRoles = roles.filter((role) => !role.is_default && member.role_ids.includes(role.id));

          // 依權限組出「更多」選單
          const menu: { key: MenuKey; label: string; icon: IconDefinition; danger?: boolean }[] = [];
          if (canAssign && manageable) menu.push({ key: "roles", label: "指派身分組", icon: faTags });
          if (detail.is_owner && !member.is_owner) menu.push({ key: "transfer", label: "轉移擁有權", icon: faRightLeft });
          if (canKick && manageable && !isSelf) menu.push({ key: "kick", label: "移出群組", icon: faUserMinus, danger: true });

          return (
            <li key={member.id} className="flex items-center gap-3 px-5 py-3">
              <UserChip user={member} className="min-w-0 flex-1" />

              {/* 身分 */}
              <div className="flex min-w-0 shrink flex-wrap items-center justify-end gap-1.5">
                {member.is_owner && (
                  <span className="rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-accent" title="群組擁有者">擁有者</span>
                )}
                {isSelf && <span className="rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-ink-muted">你</span>}
                {memberRoles.map((role) => (
                  <RoleChip key={role.id} role={role} />
                ))}
              </div>

              <span className="hidden shrink-0 text-[13px] text-ink-muted sm:block" title="加入時間">
                {formatDateTime(member.joined_at)}
              </span>

              {menu.length > 0 ? (
                <Dropdown placement="bottom-end" className="bg-surface text-ink">
                  <DropdownTrigger>
                    <button aria-label="更多" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink">
                      <FontAwesomeIcon icon={faEllipsis} className="w-4" />
                    </button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="成員操作"
                    items={menu}
                    onAction={(key) => {
                      if (key === "roles") setAssigning(member);
                      if (key === "transfer") setTransferring(member);
                      if (key === "kick") setKicking(member);
                    }}
                  >
                    {(entry) => (
                      <DropdownItem
                        key={entry.key}
                        className={entry.danger ? "text-danger" : undefined}
                        color={entry.danger ? "danger" : "default"}
                        startContent={<FontAwesomeIcon icon={entry.icon} className="w-3.5" />}
                      >
                        {entry.label}
                      </DropdownItem>
                    )}
                  </DropdownMenu>
                </Dropdown>
              ) : (
                // 沒有可做的事時留一樣的寬度，讓每列對齊
                <span className="h-8 w-8 shrink-0" aria-hidden />
              )}
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
        title="移出群組"
        description={`確定要將 ${kicking ? displayName(kicking) : ""} 移出群組嗎？對方之後要重新受邀才能再加入。`}
        confirmLabel="移出"
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
            <p className="text-[15px] text-ink-muted">
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
    </section>
  );
};

export default GroupMembers;
