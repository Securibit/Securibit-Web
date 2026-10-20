"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import QrCode from "@/components/ui/QrCode/QrCode";
import { inviteUrl } from "@/lib/groups/invites";
import { showError } from "@/lib/errorDialog";
import { InviteCreatedProps } from "@/types/Group/InviteCreated";

export const copyInviteUrl = async (code: string) => {
  try {
    await navigator.clipboard.writeText(inviteUrl(code));
    toast.success("已複製邀請連結", { position: "top-right" });
  } catch {
    showError("無法複製", "瀏覽器不允許存取剪貼簿，請手動複製連結。");
  }
};

// 剛建立的邀請連結：完整網址、複製、QR Code
const InviteCreated = (props: InviteCreatedProps) => {
  const [showQr, setShowQr] = useState(false);
  const url = inviteUrl(props.code);

  return (
    <div className="rounded-[18px] border border-line/70 bg-surface px-5 py-4">
      <div className="mb-3 flex items-center gap-3">
        <p className="flex-1 text-[15px] text-ink-muted">已建立邀請連結，傳給對方即可加入</p>
        <button
          onClick={props.onClose}
          aria-label="關閉"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-1 hover:text-ink"
        >
          <FontAwesomeIcon icon={faXmark} className="w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <input
          aria-label="邀請連結"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 truncate rounded-[12px] bg-surface-1 px-3.5 py-2 text-[15px] text-ink outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button onClick={() => copyInviteUrl(props.code)} className="shrink-0 text-[17px] text-accent hover:underline">
          複製
        </button>
        <button onClick={() => setShowQr(!showQr)} aria-expanded={showQr} className="shrink-0 text-[17px] text-accent hover:underline">
          QR Code
        </button>
      </div>
      {showQr && (
        <div className="mt-4 flex justify-center">
          <div className="overflow-hidden rounded-[12px]">
            <QrCode value={url} size={200} alt="邀請連結的 QR Code" />
          </div>
        </div>
      )}
    </div>
  );
};

export default InviteCreated;
