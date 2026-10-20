"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsUpDown, faEllipsis, faPlus } from "@fortawesome/free-solid-svg-icons";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Loading/Spinner";
import useAuth from "@/components/auth/useAuth";
import { loadMyGroups, reorderMyGroups } from "@/lib/groups/groups";
import { loadMyInvitations } from "@/lib/groups/invites";
import { SITE } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import { GroupSummary, Invitation } from "@/types/Group/Group";
import GroupCard from "./_components/GroupCard";
import CreateGroupModal from "./_components/CreateGroupModal";
import InvitationList from "./_components/InvitationList";

// 我的群組：收到的邀請、群組列表（可自己調整順序）、建立群組
const GroupsClient = () => {
  const { user, can } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupSummary[]>();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [sorting, setSorting] = useState(false);
  const reorderSeq = useRef(0);

  const canCreate = can(SITE.CREATE_GROUPS);

  // 登入狀態由 AuthGate 確認過，這裡只負責載入
  useEffect(() => {
    if (!user) return;
    Promise.all([loadMyGroups(), loadMyInvitations()]).then(([groupsResult, invitationsResult]) => {
      if (groupsResult.success) {
        setGroups(groupsResult.data);
      } else {
        setGroups([]);
        showError("載入群組失敗", groupsResult.message);
      }
      if (invitationsResult.success) {
        setInvitations(invitationsResult.data);
      } else {
        showError("載入邀請失敗", invitationsResult.message);
      }
    });
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const openGroup = (groupId: string) => router.push(`/groups/${groupId}`);

  // 和相鄰的群組交換位置：先換畫面，失敗再換回來（同 GroupCodes）
  const handleMove = async (index: number, offset: -1 | 1) => {
    if (!groups || !groups[index + offset]) return;
    const next = [...groups];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];

    const previous = groups;
    setGroups(next);
    const seq = ++reorderSeq.current;
    const result = await reorderMyGroups(next.map((group) => group.id));
    if (seq !== reorderSeq.current) return;
    if (!result.success) {
      setGroups(previous);
      showError("排序失敗", result.message);
    }
  };

  return (
    <PageContent className="max-w-3xl">
      <PageHeader
        title="群組"
        right={
          sorting ? (
            <button type="button" onClick={() => setSorting(false)} className="text-[17px] font-semibold text-accent">完成</button>
          ) : (
            <div className="flex items-center gap-3">
              {canCreate && (
                <button type="button" onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 text-[17px] text-accent hover:underline">
                  <FontAwesomeIcon icon={faPlus} className="w-3.5" />
                  建立
                </button>
              )}
              {groups && groups.length > 0 && (
                <Dropdown placement="bottom-end" className="bg-surface text-ink">
                  <DropdownTrigger>
                    <button aria-label="更多" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-1 text-accent transition-colors hover:bg-line/60">
                      <FontAwesomeIcon icon={faEllipsis} className="w-4" />
                    </button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="群組列表操作"
                    disabledKeys={groups.length < 2 ? ["sort"] : []}
                    onAction={(action) => {
                      if (action === "sort") setSorting(true);
                    }}
                  >
                    <DropdownItem key="sort" startContent={<FontAwesomeIcon icon={faArrowsUpDown} className="w-3.5" />}>調整順序</DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              )}
            </div>
          )
        }
      />

      <div className="flex flex-col gap-8">
        {invitations.length > 0 && (
          <InvitationList
            invitations={invitations}
            onAccepted={openGroup}
            onDeclined={(inviteId) => setInvitations((list) => list.filter((item) => item.id !== inviteId))}
          />
        )}

        {groups === undefined ? (
          <Spinner block label="載入群組…" />
        ) : groups.length === 0 ? (
          <div className="rounded-[18px] bg-surface-1 px-6 py-16 text-center">
            <p className="text-[19px] font-semibold">還沒有加入任何群組</p>
            <p className="mt-1 text-ink-muted">
              群組可以和其他人共用驗證碼，用身分組決定誰能看到哪些驗證碼
              {canCreate ? "" : "。請群組成員傳邀請連結給你，或用電子郵件、@ID 邀請你加入"}
            </p>
            {canCreate && (
              <button type="button" onClick={() => setCreateOpen(true)} className="link-arrow mt-4 inline-block">
                建立第一個群組
              </button>
            )}
          </div>
        ) : (
          <section>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">我的群組</h2>
            {sorting && <p className="mb-3 px-5 text-[15px] text-ink-muted">用箭頭調整順序，驗證碼頁的群組切換也會照這個順序；只影響你自己看到的順序</p>}
            <ul role="list" className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
              {groups.map((group, index) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onOpen={() => openGroup(group.id)}
                  sort={
                    sorting
                      ? {
                          canUp: index > 0,
                          canDown: index < groups.length - 1,
                          onUp: () => handleMove(index, -1),
                          onDown: () => handleMove(index, 1),
                        }
                      : undefined
                  }
                />
              ))}
            </ul>
            <p className="mt-3 px-5 text-[13px] text-ink-muted">共 {groups.length} 個群組</p>
          </section>
        )}
      </div>

      <CreateGroupModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onCreated={openGroup} />
    </PageContent>
  );
};

export default GroupsClient;
