"use client";

import { useEffect, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Loading/Spinner";
import useAuth from "@/components/auth/useAuth";
import { loadMyGroups } from "@/lib/groups/groups";
import { loadMyInvitations } from "@/lib/groups/invites";
import { SITE } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import { GroupSummary, Invitation } from "@/types/Group/Group";
import GroupCard from "./_components/GroupCard";
import CreateGroupModal from "./_components/CreateGroupModal";
import InvitationList from "./_components/InvitationList";

// 我的群組：群組列表、建立群組、收到的邀請
const GroupsClient = () => {
  const { user, can } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupSummary[]>();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

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

  return (
    <PageContent className="boot">
      <PageHeader
        index="02 // GROUPS"
        title="群組"
        subtitle="和其他人共用 2FA 驗證碼，用身分組決定誰能看到哪些驗證碼"
        right={
          canCreate && (
            <Button
              color="primary"
              className="font-display tracking-[0.08em]"
              startContent={<FontAwesomeIcon icon={faPlus} className="w-3.5" />}
              onPress={() => setCreateOpen(true)}
            >
              建立群組
            </Button>
          )
        }
      />

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
        <div className="hatch border border-line p-10 text-center">
          <p className="tech-label">NO DATA</p>
          <p className="mt-2 font-display text-lg font-semibold text-ink">你還沒有加入任何群組</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            群組可以讓團隊共用同一組 2FA 驗證碼，並透過身分組控制每個人能看到驗證碼、金鑰，或管理驗證碼。
            {canCreate
              ? "按「建立群組」開始，或請群組成員傳邀請連結給你。"
              : "請群組成員傳邀請連結給你，或用 Email / @ID 邀請你加入。"}
          </p>
          {canCreate && (
            <Button
              color="primary"
              variant="bordered"
              className="mt-5 font-display tracking-[0.08em]"
              startContent={<FontAwesomeIcon icon={faPlus} className="w-3.5" />}
              onPress={() => setCreateOpen(true)}
            >
              建立群組
            </Button>
          )}
        </div>
      ) : (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <p className="tech-label">MY GROUPS</p>
            <p className="font-mono text-xs text-ink-dim tabular-nums">{groups.length}</p>
          </div>
          <ul className="border border-line border-b-0 bg-surface-1">
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} onOpen={() => openGroup(group.id)} />
            ))}
          </ul>
        </section>
      )}

      <CreateGroupModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onCreated={openGroup} />
    </PageContent>
  );
};

export default GroupsClient;
