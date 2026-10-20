"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faQrcode, faXmark } from "@fortawesome/free-solid-svg-icons";
import QrCode from "@/components/ui/QrCode/QrCode";
import { cn } from "@/lib/utils";
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

// 方形圖示按鈕
const ICON_BUTTON =
  "flex h-8 w-8 flex-shrink-0 items-center justify-center border border-line text-ink-muted transition-colors hover:border-phos hover:text-phos";

// 剛建立的邀請連結：完整網址、複製、QR Code
const InviteCreated = (props: InviteCreatedProps) => {
  const [showQr, setShowQr] = useState(false);
  const url = inviteUrl(props.code);

  return (
    <div className="mt-4 border border-phos bg-phos/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="led" aria-hidden />
        <p className="tech-label flex-1 text-phos">LINK READY // 已建立邀請連結，傳給對方即可加入</p>
        <button onClick={props.onClose} aria-label="關閉" className={ICON_BUTTON}>
          <FontAwesomeIcon icon={faXmark} className="w-3.5" />
        </button>
      </div>
      <div className="flex items-stretch gap-2">
        <input
          aria-label="邀請連結"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="h-8 min-w-0 flex-1 border border-line bg-surface-2 px-2 font-mono text-xs text-ink outline-none focus:border-phos"
        />
        <button onClick={() => copyInviteUrl(props.code)} aria-label="複製邀請連結" title="複製" className={ICON_BUTTON}>
          <FontAwesomeIcon icon={faCopy} className="w-3.5" />
        </button>
        <button
          onClick={() => setShowQr(!showQr)}
          aria-label={showQr ? "隱藏 QR Code" : "顯示 QR Code"}
          title="QR Code"
          className={cn(ICON_BUTTON, showQr && "border-phos text-phos")}
        >
          <FontAwesomeIcon icon={faQrcode} className="w-3.5" />
        </button>
      </div>
      {showQr && (
        <div className="mt-4 flex justify-center">
          <div className="border border-line bg-white p-3">
            <QrCode value={url} size={200} alt="邀請連結的 QR Code" />
          </div>
        </div>
      )}
    </div>
  );
};

export default InviteCreated;
