"use client";

import { useEffect, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faUserGroup } from "@fortawesome/free-solid-svg-icons";
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

// 我的群組：群組卡片、建立群組、收到的邀請
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
    <PageContent>
      <PageHeader
        title="群組"
        subtitle="和其他人共用 2FA 驗證碼，用身分組決定誰能看到哪些驗證碼"
        right={
          canCreate && (
            <Button
              color="primary"
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
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-blue-300 px-6 py-12 text-center dark:border-gray-blue-700">
          <FontAwesomeIcon icon={faUserGroup} className="h-10 w-10 text-gray-blue-300 dark:text-gray-blue-600" />
          <p className="text-lg font-semibold text-gray-blue-900 dark:text-white">你還沒有加入任何群組</p>
          <p className="max-w-md text-sm text-gray-blue-500 dark:text-gray-blue-400">
            群組可以讓團隊共用同一組 2FA 驗證碼，並透過身分組控制每個人能看到驗證碼、金鑰，或管理驗證碼。
            {canCreate
              ? "按「建立群組」開始，或請群組成員傳邀請連結給你。"
              : "請群組成員傳邀請連結給你，或用 Email / @ID 邀請你加入。"}
          </p>
          {canCreate && (
            <Button
              color="primary"
              variant="flat"
              startContent={<FontAwesomeIcon icon={faPlus} className="w-3.5" />}
              onPress={() => setCreateOpen(true)}
            >
              建立群組
            </Button>
          )}
        </div>
      ) : (
        <section>
          {invitations.length > 0 && (
            <h2 className="mb-3 text-lg font-semibold text-gray-blue-900 dark:text-white">我的群組</h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} onOpen={() => openGroup(group.id)} />
            ))}
          </div>
        </section>
      )}

      <CreateGroupModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onCreated={openGroup} />
    </PageContent>
  );
};

export default GroupsClient;
