"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faBan, faEllipsis, faRightFromBracket, faRightLeft, faTags, faUserMinus } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import UserChip from "@/components/permissions/UserChip";
import { userPageHref } from "@/lib/users/users";
import RoleChip from "@/components/permissions/RoleChip";
import RoleAssignModal from "@/components/permissions/RoleAssignModal";
import useAuth from "@/components/auth/useAuth";
import { addGroupMember, banUser, kickMember, leaveGroup, setMemberRoles, transferGroup } from "@/lib/groups/groups";
import { GROUP, SITE, has } from "@/lib/permissions/bits";
import { canManageMember, sortRoles } from "@/lib/permissions/hierarchy";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { GroupMember } from "@/types/Group/Group";
import { GroupMembersProps } from "@/types/Group/GroupMembers";
import BanReasonModal from "./BanReasonModal";

type MenuKey = "roles" | "transfer" | "kick" | "ban" | "leave";

const displayName = (member: GroupMember) =>
  member.name || (member.username ? `@${member.username}` : member.email || "這位成員");

// 成員分頁：列表、指派身分組、移除、封鎖、轉移擁有權、自己離開；全站管理員可以直接新增成員
const GroupMembers = ({ detail, actor, onChanged, adminMode, exitHref }: GroupMembersProps) => {
  const { user, can } = useAuth();
  const router = useRouter();
  const gid = detail.group.id;
  const canAssign = has(detail.permissions, GROUP.MANAGE_ROLES);
  const canKick = has(detail.permissions, GROUP.KICK_MEMBERS);
  const canBan = has(detail.permissions, GROUP.BAN_MEMBERS);
  // 直接加入只在後台：全站 MANAGE_GROUPS（ADMINISTRATOR 含在內）＋後台頁；前台群組頁一律走邀請，權責分開。加密的群組只能有擁有者一人
  const canAdd = !!adminMode && can(SITE.MANAGE_GROUPS) && !detail.group.encrypted;

  const [target, setTarget] = useState("");
  const [adding, setAdding] = useState(false);

  const [assigning, setAssigning] = useState<GroupMember>();
  const [kicking, setKicking] = useState<GroupMember>();
  const [leaving, setLeaving] = useState(false);
  const [banning, setBanning] = useState<GroupMember>();
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

  const handleAdd = async () => {
    if (!target.trim() || adding) return;
    setAdding(true);
    const result = await addGroupMember(gid, target);
    setAdding(false);
    if (!result.success) {
      showError("新增成員失敗", result.message);
      return;
    }
    toast.success(`已加入 ${result.data.name || target.trim()}`, { position: "top-right" });
    setTarget("");
    await onChanged();
  };

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
    <div className="flex flex-col gap-8">
      {/* 新增成員（全站管理員，不用邀請） */}
      {canAdd && (
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">新增成員</h2>
          <form
            className="flex items-center gap-3 overflow-hidden rounded-[18px] border border-line/70 bg-surface px-5 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleAdd();
            }}
          >
            <input
              aria-label="電子郵件、@ID 或使用者 ID"
              placeholder="電子郵件、@ID 或使用者 ID"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-[12px] bg-surface-1 px-3.5 py-2 text-[17px] text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-accent/40"
            />
            <button
              type="submit"
              disabled={adding || !target.trim()}
              className="shrink-0 text-[17px] text-accent hover:underline disabled:opacity-40 disabled:hover:no-underline"
            >
              {adding ? "加入中…" : "加入"}
            </button>
          </form>
          <p className="mt-2 px-5 text-[13px] text-ink-muted">直接加入、不用對方接受；加入後只有 @everyone 的權限。對方要是已驗證電子郵件的使用者</p>
        </section>
      )}

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
            if (canBan && manageable && !isSelf) menu.push({ key: "ban", label: "封鎖", icon: faBan, danger: true });
            // 自己（不是擁有者）可以直接在這裡離開群組，例如全站管理員加入後要退出
            if (isSelf && !member.is_owner) menu.push({ key: "leave", label: "離開群組", icon: faRightFromBracket, danger: true });

            return (
              <li key={member.id} className="flex items-center gap-3 px-5 py-3">
                {/* 點頭像或名字到對方的個人頁面（自己的會導回個人頁面） */}
                <Link href={userPageHref(member.id, member.username)} className="min-w-0 flex-1 rounded-[10px] transition-opacity hover:opacity-70">
                  <UserChip user={member} />
                </Link>

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
                        if (key === "ban") setBanning(member);
                        if (key === "leave") setLeaving(true);
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
      </section>

      {assigning && (
        <RoleAssignModal
          isOpen
          onClose={() => setAssigning(undefined)}
          title={`指派身分組給 ${displayName(assigning)}`}
          roles={detail.roles}
          selected={assigning.role_ids}
          actor={actor}
          actorPermissions={detail.permissions}
          onSave={async (roleIds) => {
            const result = await setMemberRoles(gid, assigning.id, roleIds);
            if (result.success) await onChanged();
            return result;
          }}
        />
      )}

      <ConfirmModal
        isOpen={leaving}
        danger
        title="離開群組"
        description={`確定要離開「${detail.group.name}」嗎？離開後就看不到群組的驗證碼，要重新受邀才能再加入。`}
        confirmLabel="離開"
        onCancel={() => setLeaving(false)}
        onConfirm={async () => {
          setLeaving(false);
          const result = await leaveGroup(gid);
          if (!result.success) {
            showError("離開群組失敗", result.message);
            return;
          }
          toast.success(`已離開「${detail.group.name}」`, { position: "top-right" });
          // 後台還管得到這個群組，留在原頁重新整理；前台回到群組列表
          if (adminMode) await onChanged();
          else router.replace(exitHref);
        }}
      />

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

      {banning && (
        <BanReasonModal
          key={banning.id}
          isOpen
          danger
          title={`封鎖 ${displayName(banning)}`}
          description="封鎖後對方會被移出群組，之後也無法再透過邀請加入，直到解除封鎖。"
          confirmLabel="封鎖"
          onClose={() => setBanning(undefined)}
          onSave={async (reason) => {
            const result = await banUser(gid, banning.id, reason);
            if (result.success) {
              toast.success(`已封鎖 ${displayName(banning)}`, { position: "top-right" });
              await onChanged();
            }
            return result;
          }}
        />
      )}

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
    </div>
  );
};

export default GroupMembers;
