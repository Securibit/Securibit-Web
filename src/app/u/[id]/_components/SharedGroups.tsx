"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faChevronRight, faEllipsis, faTags, faUserGroup, faUserMinus } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import RoleAssignModal from "@/components/permissions/RoleAssignModal";
import useAuth from "@/components/auth/useAuth";
import { kickMember, loadGroupDetail, loadMyGroups, setMemberRoles } from "@/lib/groups/groups";
import { GROUP, SITE, has } from "@/lib/permissions/bits";
import { Actor, canManageMember } from "@/lib/permissions/hierarchy";
import { showError } from "@/lib/errorDialog";
import { GroupDetail, GroupMember } from "@/types/Group/Group";
import { SharedGroupsProps } from "@/types/User/SharedGroups";

type MenuKey = "roles" | "kick" | "loading" | "none";
type MenuEntry = { key: MenuKey; label: string; icon?: IconDefinition; danger?: boolean };

// 群組 detail：載入中 / 載入完成
type DetailState = "loading" | GroupDetail;

// 指派身分組或移出群組時要的資料
interface Pending {
  gid: string;
  groupName: string;
  detail: GroupDetail;
  member: GroupMember;
}

// 共同群組：每列可以點進群組；我在那個群組能管理他時，右邊多一個「…」（指派身分組、移出群組）
const SharedGroups = ({ target, onChanged }: SharedGroupsProps) => {
  const { can } = useAuth();
  const groups = target.shared_groups;
  // 全站管理員 / 管理所有群組：在任何群組都不受階層限制（同群組頁）
  const siteSuper = can(SITE.ADMINISTRATOR) || can(SITE.MANAGE_GROUPS);

  // 我在每個群組可能可以管理成員嗎（my_groups 一次讀完，只用來決定要不要顯示「…」）
  const [maybeManage, setMaybeManage] = useState<Record<string, boolean>>({});
  // 點開「…」才讀的群組 detail（成員的身分組、我的階層）
  const [details, setDetails] = useState<Record<string, DetailState>>({});
  const [openGid, setOpenGid] = useState<string>();
  const [assigning, setAssigning] = useState<Pending>();
  const [kicking, setKicking] = useState<Pending>();

  const hasGroups = groups.length > 0;
  useEffect(() => {
    if (!hasGroups) return;
    let cancelled = false;
    loadMyGroups().then((result) => {
      if (cancelled || !result.success) return;
      setMaybeManage(
        Object.fromEntries(
          result.data.map((group) => [
            group.id,
            group.is_owner || has(group.permissions, GROUP.KICK_MEMBERS) || has(group.permissions, GROUP.MANAGE_ROLES),
          ])
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [hasGroups, target.id]);

  const loadDetail = async (gid: string) => {
    setDetails((old) => ({ ...old, [gid]: "loading" }));
    const result = await loadGroupDetail(gid);
    if (result.success) {
      setDetails((old) => ({ ...old, [gid]: result.data }));
    } else {
      setDetails((old) => {
        const next = { ...old };
        delete next[gid];
        return next;
      });
      setOpenGid(undefined);
      showError("載入群組失敗", result.message);
    }
  };

  // 群組有變動：丟掉這個群組的 detail（下次點開重讀），並重新載入頁面
  const afterChange = async (gid: string) => {
    setDetails((old) => {
      const next = { ...old };
      delete next[gid];
      return next;
    });
    await onChanged();
  };

  const anyMenu = siteSuper || groups.some((group) => maybeManage[group.id]);
  const displayName = target.name || (target.username ? `@${target.username}` : "這位使用者");

  // 依群組 detail 組出選單（判斷方式同群組頁的成員列表）
  const menuFor = (gid: string): { entries: MenuEntry[]; pending?: Pending } => {
    const state = details[gid];
    if (!state || state === "loading") return { entries: [{ key: "loading", label: "載入中…" }] };
    const member = state.members.find((item) => item.id === target.id);
    if (!member) return { entries: [{ key: "none", label: "他已經不在這個群組" }] };

    const actor: Actor = { unrestricted: state.is_owner || siteSuper, topPosition: state.top_position };
    const manageable = canManageMember(actor, member);
    const entries: MenuEntry[] = [];
    if (has(state.permissions, GROUP.MANAGE_ROLES) && manageable) entries.push({ key: "roles", label: "指派身分組", icon: faTags });
    if (has(state.permissions, GROUP.KICK_MEMBERS) && manageable) {
      entries.push({ key: "kick", label: "移出群組", icon: faUserMinus, danger: true });
    }
    if (entries.length === 0) {
      const reason = member.is_owner
        ? "他是群組擁有者，無法管理"
        : manageable
          ? "沒有可用的操作"
          : "他的身分組比你高，無法管理";
      entries.push({ key: "none", label: reason });
    }
    const groupName = groups.find((group) => group.id === gid)?.name ?? "";
    return { entries, pending: { gid, groupName, detail: state, member } };
  };

  const handleKick = async (pending: Pending) => {
    const result = await kickMember(pending.gid, pending.member.id);
    if (!result.success) {
      showError("移出群組失敗", result.message);
      return;
    }
    toast.success("已移出群組", { position: "top-right" });
    await afterChange(pending.gid);
  };

  return (
    <section>
      <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">共同群組</h2>
      {groups.length === 0 ? (
        <p className="rounded-[18px] border border-line/70 bg-surface px-5 py-3 text-[17px] text-ink-muted">沒有共同群組</p>
      ) : (
        <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
          {groups.map((group) => {
            const showMenu = siteSuper || !!maybeManage[group.id];
            const { entries, pending } = openGid === group.id ? menuFor(group.id) : { entries: [] as MenuEntry[], pending: undefined };
            return (
              <li key={group.id} className="flex items-center">
                <Link
                  href={`/groups/${group.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 px-5 py-3 text-[17px] transition-colors hover:bg-surface-1"
                >
                  <FontAwesomeIcon icon={faUserGroup} className="w-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">{group.name}</span>
                  <FontAwesomeIcon icon={faChevronRight} className="w-2.5 shrink-0 text-ink-muted" />
                </Link>
                {showMenu && (
                  <Dropdown
                    placement="bottom-end"
                    className="bg-surface text-ink"
                    isOpen={openGid === group.id}
                    onOpenChange={(open) => {
                      setOpenGid(open ? group.id : undefined);
                      // 點開才讀這個群組的 detail；讀過就沿用
                      if (open && !details[group.id]) loadDetail(group.id);
                    }}
                  >
                    <DropdownTrigger>
                      <button
                        type="button"
                        aria-label={`在「${group.name}」管理 ${displayName}`}
                        className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink"
                      >
                        <FontAwesomeIcon icon={faEllipsis} className="w-4" />
                      </button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="群組成員操作"
                      items={entries}
                      disabledKeys={["loading", "none"]}
                      onAction={(key) => {
                        if (!pending) return;
                        if (key === "roles") setAssigning(pending);
                        if (key === "kick") setKicking(pending);
                      }}
                    >
                      {(entry) => (
                        <DropdownItem
                          key={entry.key}
                          className={entry.danger ? "text-danger" : undefined}
                          color={entry.danger ? "danger" : "default"}
                          startContent={entry.icon && <FontAwesomeIcon icon={entry.icon} className="w-3.5" />}
                        >
                          {entry.label}
                        </DropdownItem>
                      )}
                    </DropdownMenu>
                  </Dropdown>
                )}
                {/* 有其他列顯示「…」時留一樣的寬度，讓箭頭對齊 */}
                {!showMenu && anyMenu && <span className="mr-3 h-8 w-8 shrink-0" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}

      {assigning && (
        <RoleAssignModal
          isOpen
          onClose={() => setAssigning(undefined)}
          title={`指派「${assigning.groupName}」的身分組`}
          roles={assigning.detail.roles}
          selected={assigning.member.role_ids}
          actor={{
            unrestricted: assigning.detail.is_owner || siteSuper,
            topPosition: assigning.detail.top_position,
          }}
          actorPermissions={assigning.detail.permissions}
          onSave={async (roleIds) => {
            const result = await setMemberRoles(assigning.gid, assigning.member.id, roleIds);
            if (result.success) await afterChange(assigning.gid);
            return result;
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!kicking}
        danger
        title="移出群組"
        description={`確定要將 ${displayName} 移出「${kicking?.groupName ?? ""}」嗎？對方之後要重新受邀才能再加入。`}
        confirmLabel="移出"
        onCancel={() => setKicking(undefined)}
        onConfirm={async () => {
          const pending = kicking;
          setKicking(undefined);
          if (pending) await handleKick(pending);
        }}
      />
    </section>
  );
};

export default SharedGroups;
