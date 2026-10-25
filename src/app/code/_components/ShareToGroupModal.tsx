"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useRouter } from "nextjs-toploader/app";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Radio, RadioGroup } from "@heroui/react";
import Spinner from "@/components/ui/Loading/Spinner";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import useVault from "@/components/vault/useVault";
import { addGroupAccounts, loadMyGroups } from "@/lib/groups/groups";
import { GROUP, has } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import { GroupSummary } from "@/types/Group/Group";
import { ShareToGroupModalProps } from "@/types/Code/ShareToGroupModal";

// 把一筆驗證碼複製一份到其他群組（只列出我有「管理驗證碼」的群組）。
// 目標是加密群組時，要先解鎖加密密碼才能把金鑰加密後放進去
const ShareToGroupModal = (props: ShareToGroupModalProps) => {
  const { item, excludeGroupId } = props;
  const router = useRouter();
  const { key } = useVault();
  // undefined 代表載入中
  const [groups, setGroups] = useState<GroupSummary[]>();
  const [selected, setSelected] = useState("");
  const [sharing, setSharing] = useState(false);
  // 從加密群組複製到沒加密的群組：先確認
  const [confirmPlain, setConfirmPlain] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMyGroups().then((result) => {
      if (cancelled) return;
      if (result.success) {
        const manageable = result.data.filter((group) => has(group.permissions, GROUP.MANAGE_CODES) && group.id !== excludeGroupId);
        setGroups(manageable);
        // 只有一個群組時直接選好
        if (manageable.length === 1) setSelected(manageable[0].id);
      } else {
        setGroups([]);
        showError("載入群組失敗", result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [excludeGroupId]);

  const handleShare = async (confirmed = false) => {
    const group = groups?.find((g) => g.id === selected);
    if (!group || (group.encrypted && !key)) return;
    if (props.sourceEncrypted && !group.encrypted && !confirmed) {
      setConfirmPlain(true);
      return;
    }

    setSharing(true);
    const result = await addGroupAccounts(group.id, [
      {
        name: item.name,
        secret: item.secret,
        category: item.category,
        digits: item.digits,
        period: item.period,
        algorithm: item.algorithm,
      },
    ], group.encrypted ? key : undefined);
    setSharing(false);

    if (!result.success) {
      showError("分享到群組失敗", result.message);
      return;
    }
    props.onClose();
    toast.success(
      (t) => (
        <span className="flex flex-wrap items-center gap-2">
          已分享到「{group.name}」
          <button
            className="text-accent hover:underline"
            onClick={() => {
              toast.dismiss(t.id);
              router.push(`/groups/${group.id}`);
            }}
          >
            前往群組
          </button>
        </span>
      ),
      { position: "top-right", duration: 6000 }
    );
  };

  return (
    <>
      <Modal isOpen onOpenChange={(open) => !open && props.onClose()} className="bg-surface text-ink">
        <ModalContent>
          <ModalHeader className="truncate">分享「{item.name}」到群組</ModalHeader>
          <ModalBody className="gap-4">
            <p className="text-[15px] text-ink-muted">
              會複製一份到群組，之後兩邊各自獨立；放進加密的群組時，金鑰會用你的加密密碼加密
            </p>

            {groups === undefined ? (
              <Spinner label="載入群組…" />
            ) : groups.length === 0 ? (
              <div className="rounded-[18px] bg-surface-1 px-6 py-10 text-center">
                <p className="text-ink">你目前沒有可以新增驗證碼的群組</p>
                <p className="mt-1 text-[13px] text-ink-muted">
                  需要在群組裡有「管理驗證碼」權限，可以自己建立群組，或請群組管理員開給你
                </p>
                <Link href="/groups" onClick={props.onClose} className="link-arrow mt-4 inline-block">
                  前往群組
                </Link>
              </div>
            ) : (
              <RadioGroup
                label="選擇群組"
                value={selected}
                onValueChange={setSelected}
                classNames={{ label: "text-[13px] text-ink-muted" }}
              >
                {groups.map((group) => (
                  <Radio
                    key={group.id}
                    value={group.id}
                    isDisabled={group.encrypted && !key}
                    description={group.encrypted && !key ? "已加密，先輸入加密密碼解鎖才能放進去" : group.description || undefined}
                  >
                    {group.name}
                  </Radio>
                ))}
              </RadioGroup>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={props.onClose}>
              取消
            </Button>
            {groups && groups.length > 0 && (
              <Button color="primary" isLoading={sharing} isDisabled={!selected} onPress={() => handleShare()}>
                分享
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmModal
        isOpen={confirmPlain}
        danger
        title="複製到沒有加密的群組"
        description="這個群組沒有加密，複製過去後金鑰會以未加密的方式存在伺服器上。確定要複製嗎？"
        confirmLabel="複製"
        onCancel={() => setConfirmPlain(false)}
        onConfirm={async () => {
          setConfirmPlain(false);
          await handleShare(true);
        }}
      />
    </>
  );
};

export default ShareToGroupModal;
