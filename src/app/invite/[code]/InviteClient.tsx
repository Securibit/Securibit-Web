"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
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
    <PageContent className="boot flex max-w-lg justify-center">
      <div className="panel mt-6 w-full p-6 sm:p-8">
        {invalid ? (
          <>
            <p className="tech-label flex items-center gap-2 text-alarm">
              <span className="led led-alarm" aria-hidden />
              INVITE // INVALID
            </p>
            <h1 className="mt-3 font-display text-2xl font-bold text-ink">無法使用這個邀請</h1>
            <p className="mt-3 text-ink-muted">{reason}</p>
            <p className="mt-1 text-sm text-ink-dim">請向邀請你的人索取新的邀請連結。</p>
            <div className="rule mt-6" />
            <Button
              variant="bordered"
              className="mt-6 w-full font-display tracking-[0.08em]"
              onPress={() => router.push("/groups")}
            >
              回到我的群組
            </Button>
          </>
        ) : (
          <>
            <p className="tech-label flex items-center gap-2">
              <span className="led" aria-hidden />
              INVITE // 你受邀加入群組
            </p>
            <h1 className="mt-3 break-words font-display text-3xl font-bold text-ink sm:text-4xl">{info.group?.name}</h1>
            {info.group?.description && (
              <p className="mt-3 whitespace-pre-line text-sm text-ink-muted">{info.group.description}</p>
            )}

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4">
              <div>
                <dt className="tech-label">MEMBERS</dt>
                <dd className="mt-1 font-mono text-lg text-ink tabular-nums">{info.group?.member_count}</dd>
              </div>
              <div className="min-w-0">
                <dt className="tech-label">INVITED BY</dt>
                <dd className="mt-1">
                  {info.inviter ? (
                    <UserChip user={info.inviter} size="sm" />
                  ) : (
                    <span className="font-mono text-sm text-ink-dim">--</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="rule mt-6" />

            {info.already_member ? (
              <>
                <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
                  <span className="led" aria-hidden />
                  你已經是這個群組的成員。
                </p>
                <Button
                  color="primary"
                  size="lg"
                  className="mt-4 w-full font-display tracking-[0.08em]"
                  onPress={() => router.push(`/groups/${info.group?.id}`)}
                >
                  前往群組
                </Button>
              </>
            ) : (
              <div className="mt-6 grid grid-cols-12 gap-3">
                <Button
                  variant="bordered"
                  size="lg"
                  className="col-span-5 font-display tracking-[0.08em]"
                  isDisabled={joining}
                  onPress={() => router.push("/groups")}
                >
                  拒絕
                </Button>
                <Button
                  color="primary"
                  size="lg"
                  className="col-span-7 font-display tracking-[0.08em]"
                  isLoading={joining}
                  onPress={handleJoin}
                >
                  加入群組
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PageContent>
  );
};

export default InviteClient;
