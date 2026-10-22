"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
import PageContent from "@/components/layout/PageContent";
import Spinner from "@/components/ui/Loading/Spinner";
import useAuth from "@/components/auth/useAuth";
import { INVITE_REASON_TEXT, joinGroup, loadInviteInfo } from "@/lib/groups/invites";
import { showError } from "@/lib/errorDialog";
import { InviteInfo } from "@/types/Group/Group";

// 用 Securibit App 開啟（桌面版用 securibit:// 叫起 App；Android 裝了 App 時 https 邀請連結會直接開 App，看不到這頁）。
// 沒裝 App 時瀏覽器不會有反應，照樣可以在網頁加入，或去下載 App
const OpenInApp = ({ code }: { code: string }) => (
  <div className="flex w-full flex-col items-center gap-3 border-t border-line/70 pt-6">
    <p className="text-[15px] text-ink-muted">已經安裝 Securibit App 的話，也可以在 App 裡加入</p>
    <a
      href={`securibit://invite/${encodeURIComponent(code)}`}
      className="flex h-12 w-full items-center justify-center rounded-full bg-surface-1 text-[17px] font-semibold text-accent transition-opacity hover:opacity-80"
    >
      用 App 開啟
    </a>
    <Link href="/download" className="link-arrow text-[15px]">
      下載 App
    </Link>
  </div>
);

// 邀請連結加入頁：置中的小卡，顯示群組與邀請人，按「加入群組」，或改用 App 開啟
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
    toast.success("已加入群組", { position: "top-right" });
    router.push(`/groups/${result.data}`);
  };

  if (info === undefined) return <Spinner block label="讀取邀請…" />;

  // 已經是成員時就算連結失效也可以直接前往群組
  const invalid = !info || !info.group || (!info.valid && !info.already_member);
  const reason = !info
    ? loadError ?? "無法讀取這個邀請連結"
    : (info.reason && INVITE_REASON_TEXT[info.reason]) || "這個邀請連結無法使用";

  const inviterName = info?.inviter ? info.inviter.name || (info.inviter.username ? `@${info.inviter.username}` : "成員") : undefined;

  return (
    <PageContent className="max-w-sm">
      <div className="mt-6 flex flex-col items-center gap-6 rounded-[18px] border border-line/70 bg-surface px-6 py-8 text-center">
        {invalid ? (
          <>
            <div>
              <h1 className="text-[28px] font-semibold text-ink">無法使用這個邀請</h1>
              <p className="mt-2 text-[15px] text-ink-muted">{reason}</p>
              <p className="mt-1 text-[13px] text-ink-muted">請向邀請你的人索取新的邀請連結</p>
            </div>
            <Button variant="light" radius="full" size="lg" onPress={() => router.push("/groups")}>
              回到群組
            </Button>
          </>
        ) : (
          <>
            <div className="w-full">
              <p className="text-[13px] text-ink-muted">你受邀加入群組</p>
              <h1 className="mt-1 break-words text-[28px] font-semibold text-ink">{info.group?.name}</h1>
              <p className="mt-2 text-[15px] text-ink-muted tabular-nums">
                {info.group?.member_count} 位成員
                {inviterName && ` · 由 ${inviterName} 邀請`}
              </p>
              {info.group?.description && (
                <p className="mt-4 whitespace-pre-line text-[15px] text-ink-muted">{info.group.description}</p>
              )}
            </div>

            {info.already_member ? (
              <div className="flex w-full flex-col gap-2">
                <p className="text-[13px] text-ink-muted">你已經是這個群組的成員</p>
                <Button color="primary" radius="full" size="lg" fullWidth onPress={() => router.push(`/groups/${info.group?.id}`)}>
                  前往群組
                </Button>
              </div>
            ) : (
              <div className="flex w-full flex-col gap-2">
                <Button color="primary" radius="full" size="lg" fullWidth isLoading={joining} onPress={handleJoin}>
                  加入群組
                </Button>
                <Button variant="light" radius="full" size="lg" fullWidth isDisabled={joining} onPress={() => router.push("/groups")}>
                  暫不加入
                </Button>
              </div>
            )}
            {!info.already_member && <OpenInApp code={code} />}
          </>
        )}
      </div>
    </PageContent>
  );
};

export default InviteClient;
