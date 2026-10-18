"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faUserGroup, faUsers } from "@fortawesome/free-solid-svg-icons";
import PageContent from "@/components/layout/PageContent";
import Spinner from "@/components/ui/Loading/Spinner";
import UserChip from "@/components/permissions/UserChip";
import useAuth from "@/components/auth/useAuth";
import { INVITE_REASON_TEXT, joinGroup, loadInviteInfo } from "@/lib/groups/invites";
import { showError } from "@/lib/errorDialog";
import { InviteInfo } from "@/types/Group/Group";

// 邀請連結加入頁：顯示群組資訊與邀請人，按「加入群組」
const InviteClient = () => {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const router = useRouter();
  const { user } = useAuth();
  // undefined：載入中；null：載入失敗
  const [info, setInfo] = useState<InviteInfo | null>();
  const [loadError, setLoadError] = useState<string>();
  const [joining, setJoining] = useState(false);

  // 登入狀態由 AuthGate 確認過
  useEffect(() => {
    if (!user) return;
    loadInviteInfo(code).then((result) => {
      if (result.success) {
        setInfo(result.data);
      } else {
        setInfo(null);
        setLoadError(result.message);
        showError("讀取邀請失敗", result.message);
      }
    });
  }, [user?.uid, code]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleJoin = async () => {
    setJoining(true);
    const result = await joinGroup(code);
    setJoining(false);
    if (!result.success) {
      showError("加入群組失敗", result.message);
      return;
    }
    toast.success("已加入群組！", { position: "top-right" });
    router.push(`/groups/${result.data}`);
  };

  if (info === undefined) return <Spinner block label="讀取邀請…" />;

  // 已經是成員時就算連結失效也可以直接前往群組
  const invalid = !info || !info.group || (!info.valid && !info.already_member);
  const reason = !info
    ? loadError ?? "無法讀取這個邀請連結"
    : (info.reason && INVITE_REASON_TEXT[info.reason]) || "這個邀請連結無法使用";

  return (
    <PageContent className="flex max-w-lg justify-center">
      <div className="mt-6 w-full rounded-xl border border-gray-blue-200 bg-white p-6 text-center shadow sm:p-8 dark:border-gray-blue-700 dark:bg-gray-blue-800">
        {invalid ? (
          <div className="flex flex-col items-center gap-4">
            <FontAwesomeIcon icon={faCircleExclamation} className="h-12 w-12 text-red-400" />
            <h1 className="text-xl font-bold text-gray-blue-900 dark:text-white">無法使用這個邀請</h1>
            <p className="text-gray-blue-500 dark:text-gray-blue-400">{reason}</p>
            <p className="text-sm text-gray-blue-400">請向邀請你的人索取新的邀請連結。</p>
            <Button color="primary" variant="flat" onPress={() => router.push("/groups")}>
              回到我的群組
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tpp/10">
              <FontAwesomeIcon icon={faUserGroup} className="h-7 w-7 text-tpp" />
            </div>
            <p className="text-sm text-gray-blue-500 dark:text-gray-blue-400">你受邀加入群組</p>
            <h1 className="break-words text-2xl font-bold text-gray-blue-900 dark:text-white">{info.group?.name}</h1>
            {info.group?.description && (
              <p className="whitespace-pre-line text-gray-blue-600 dark:text-gray-blue-300">{info.group.description}</p>
            )}
            <p className="flex items-center gap-1.5 text-sm text-gray-blue-500 dark:text-gray-blue-400">
              <FontAwesomeIcon icon={faUsers} className="w-3.5" />
              {info.group?.member_count} 位成員
            </p>
            {info.inviter && (
              <div className="flex items-center gap-2 text-sm text-gray-blue-500 dark:text-gray-blue-400">
                邀請人
                <UserChip user={info.inviter} size="sm" />
              </div>
            )}
            {info.already_member ? (
              <>
                <p className="text-sm text-emerald-600 dark:text-emerald-400">你已經是這個群組的成員。</p>
                <Button color="primary" size="lg" className="w-full" onPress={() => router.push(`/groups/${info.group?.id}`)}>
                  前往群組
                </Button>
              </>
            ) : (
              <Button color="primary" size="lg" className="w-full" isLoading={joining} onPress={handleJoin}>
                加入群組
              </Button>
            )}
          </div>
        )}
      </div>
    </PageContent>
  );
};

export default InviteClient;
