"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Input } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCopy, faQrcode, faXmark } from "@fortawesome/free-solid-svg-icons";
import QrCode from "@/components/ui/QrCode/QrCode";
import { inviteUrl } from "@/lib/groups/invites";
import { showError } from "@/lib/errorDialog";
import { InviteCreatedProps } from "@/types/Group/InviteCreated";

export const copyInviteUrl = async (code: string) => {
  try {
    await navigator.clipboard.writeText(inviteUrl(code));
    toast.success("已複製邀請連結！", { position: "top-right" });
  } catch {
    showError("無法複製", "瀏覽器不允許存取剪貼簿，請手動複製連結。");
  }
};

// 剛建立的邀請連結：完整網址、複製、QR Code
const InviteCreated = (props: InviteCreatedProps) => {
  const [showQr, setShowQr] = useState(false);
  const url = inviteUrl(props.code);

  return (
    <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-900/30">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
        <FontAwesomeIcon icon={faCircleCheck} className="w-4" />
        <span className="flex-1">已建立邀請連結，傳給對方即可加入</span>
        <button onClick={props.onClose} aria-label="關閉" className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300">
          <FontAwesomeIcon icon={faXmark} className="w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="邀請連結"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          classNames={{ input: "font-mono text-sm" }}
        />
        <div className="flex flex-shrink-0 gap-2">
          <Button
            color="primary"
            startContent={<FontAwesomeIcon icon={faCopy} className="w-3.5" />}
            onPress={() => copyInviteUrl(props.code)}
          >
            複製
          </Button>
          <Button
            variant="bordered"
            startContent={<FontAwesomeIcon icon={faQrcode} className="w-3.5" />}
            onPress={() => setShowQr(!showQr)}
          >
            {showQr ? "隱藏 QR Code" : "QR Code"}
          </Button>
        </div>
      </div>
      {showQr && (
        <div className="mt-4 flex justify-center">
          <QrCode value={url} size={200} alt="邀請連結的 QR Code" />
        </div>
      )}
    </div>
  );
};

export default InviteCreated;
