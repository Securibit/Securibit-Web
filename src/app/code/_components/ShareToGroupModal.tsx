"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useRouter } from "nextjs-toploader/app";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Radio, RadioGroup } from "@heroui/react";
import Spinner from "@/components/ui/Loading/Spinner";
import { addGroupAccounts, loadMyGroups } from "@/lib/groups/groups";
import { GROUP, has } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import { GroupSummary } from "@/types/Group/Group";
import { ShareToGroupModalProps } from "@/types/Code/ShareToGroupModal";

// 把一筆個人驗證碼複製一份到群組（只列出我有「管理驗證碼」的群組）
const ShareToGroupModal = (props: ShareToGroupModalProps) => {
  const { item } = props;
  const router = useRouter();
  // undefined 代表載入中
  const [groups, setGroups] = useState<GroupSummary[]>();
  const [selected, setSelected] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMyGroups().then((result) => {
      if (cancelled) return;
      if (result.success) {
        const manageable = result.data.filter((group) => has(group.permissions, GROUP.MANAGE_CODES));
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
  }, []);

  const handleShare = async () => {
    const group = groups?.find((g) => g.id === selected);
    if (!group) return;

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
    ]);
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
    <Modal isOpen onOpenChange={(open) => !open && props.onClose()} className="bg-surface text-ink">
      <ModalContent>
        <ModalHeader className="truncate">分享「{item.name}」到群組</ModalHeader>
        <ModalBody className="gap-4">
          <p className="text-[15px] text-ink-muted">
            會複製一份到群組，之後兩邊各自獨立；群組的驗證碼不會套用你的個人加密
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
                <Radio key={group.id} value={group.id} description={group.description || undefined}>
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
            <Button color="primary" isLoading={sharing} isDisabled={!selected} onPress={handleShare}>
              分享
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ShareToGroupModal;
