"use client";

import { useEffect, useState } from "react";
import { useInterval } from "react-use";
import toast from "react-hot-toast";
import { Tooltip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faCopy, faEye, faEyeSlash, faPen, faQrcode, faThumbtack, faTrash } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import ExportItemModal from "@/app/code/_components/ExportItemModal";
import { generateOtp } from "@/lib/totp/otp";
import { showError } from "@/lib/errorDialog";
import { cn } from "@/lib/utils";
import { TotpItem } from "@/types/Totp/Totp";
import { AdminTotpRowProps } from "@/types/Admin/AdminTotpRow";

// 每 3 / 4 位插一個空白（同 CodeCard）
const formatOtp = (otp: string) =>
  otp.length === 6 ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp.replace(/(.{4})(?=.)/g, "$1 ");

const copy = async (text: string, successText: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successText, { position: "top-right" });
  } catch {
    showError("無法複製", "瀏覽器不允許存取剪貼簿，請手動複製。");
  }
};

// 方形圖示按鈕（危險的 hover 變警示色）
const IconButton = (props: { icon: IconDefinition; label: string; danger?: boolean; onClick: () => void }) => (
  <Tooltip content={props.label} classNames={{ content: "border border-line bg-surface-1 text-ink" }}>
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      className={cn(
        "flex h-8 w-8 items-center justify-center border border-line text-ink-muted transition-colors",
        props.danger ? "hover:border-alarm hover:text-alarm" : "hover:border-phos hover:text-phos"
      )}
    >
      <FontAwesomeIcon icon={props.icon} className="w-3.5" />
    </button>
  </Tooltip>
);

// 後台 2FA 清單的一列：動態碼在前端用金鑰產生；已加密的沒有金鑰，只顯示「已加密」
const AdminTotpRow = (props: AdminTotpRowProps) => {
  const { item } = props;
  const secret = item.encrypted ? null : item.secret;

  // 每秒依時鐘重算（沒有金鑰就不用跑計時器）
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), secret ? 1000 : null);
  const seconds = Math.floor(now / 1000);
  const timeLeft = item.period - (seconds % item.period);
  const counter = Math.floor(seconds / item.period);

  // 參數或時間週期變了才重新產生；null 代表金鑰格式錯誤（換碼的瞬間先沿用上一組，不閃爍）
  const otpKey = `${secret}|${item.digits}|${item.period}|${item.algorithm}|${counter}`;
  const [otp, setOtp] = useState<string | null>();
  useEffect(() => {
    if (!secret) return;
    let cancelled = false;
    generateOtp({ secret, digits: item.digits, period: item.period, algorithm: item.algorithm }, counter * item.period * 1000).then(
      (value) => {
        if (!cancelled) setOtp(value);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpKey]);

  const [showSecret, setShowSecret] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const danger = timeLeft <= Math.min(10, item.period / 3);
  const invalidSecret = !!secret && otp === null;

  // ExportItemModal 吃個人驗證碼的格式
  const exportItem: TotpItem | undefined = secret
    ? {
        id: item.id,
        name: item.name,
        secret,
        category: item.category,
        digits: item.digits,
        period: item.period,
        algorithm: item.algorithm,
        pinned: item.pinned,
      }
    : undefined;

  return (
    <li className="group relative border-b border-line py-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* 左：名稱 + 類別 / 已加密 */}
        <div className="min-w-0 flex-1 basis-40">
          <p className="truncate font-display text-base font-semibold text-ink">
            {item.pinned && <FontAwesomeIcon icon={faThumbtack} className="mr-1.5 w-3 text-phos" aria-label="已釘選" />}
            {item.name || "（未命名）"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {item.category && (
              <span className="tech-label inline-block border border-line px-1.5 py-0.5">{item.category}</span>
            )}
            {item.encrypted && (
              <span className="tech-label inline-flex items-center gap-1.5 px-1 py-0.5">
                <span className="led-off" aria-hidden />
                已加密
              </span>
            )}
          </div>
        </div>

        {/* 右：讀數（點一下複製）+ 秒數 */}
        <div className="flex flex-col items-end">
          {!secret ? (
            <span className="readout text-2xl text-ink-dim sm:text-3xl">••• •••</span>
          ) : invalidSecret ? (
            <span className="font-mono text-sm text-alarm">金鑰錯誤</span>
          ) : (
            <>
              <button
                key={counter}
                type="button"
                onClick={() => otp && copy(otp, "已複製驗證碼！")}
                title="點擊複製"
                className={cn(
                  "readout settle text-2xl transition-colors sm:text-3xl",
                  otp ? "glow text-phos hover:text-ink" : "text-ink-dim"
                )}
              >
                {otp ? formatOtp(otp) : "--- ---"}
              </button>
              <span className={cn("font-mono text-[11px] tracking-[0.08em] text-ink-dim tabular-nums", danger && "text-alarm")}>
                {timeLeft} s
              </span>
            </>
          )}
        </div>

        {/* 操作：方形圖示按鈕 */}
        <div className="flex gap-1">
          {secret && (
            <IconButton
              icon={showSecret ? faEyeSlash : faEye}
              label={showSecret ? "隱藏金鑰" : "顯示金鑰"}
              onClick={() => setShowSecret(!showSecret)}
            />
          )}
          {exportItem && !invalidSecret && (
            <IconButton icon={faQrcode} label="顯示 QR Code" onClick={() => setExportOpen(true)} />
          )}
          {props.canManage && (
            <>
              <IconButton icon={faPen} label="編輯驗證碼" onClick={props.onEdit} />
              <IconButton icon={faTrash} label="刪除驗證碼" danger onClick={() => setConfirmOpen(true)} />
            </>
          )}
        </div>
      </div>

      {/* 金鑰 */}
      {secret && showSecret && (
        <div className="mt-3 flex items-center gap-3 border border-line bg-surface-2 px-3 py-2">
          <span className="tech-label flex-shrink-0">SECRET</span>
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-ink">{secret}</code>
          <IconButton icon={faCopy} label="複製金鑰" onClick={() => copy(secret, "已複製金鑰！")} />
        </div>
      )}

      {/* 倒數條：貼在列底部（沒有金鑰就不顯示） */}
      {secret && !invalidSecret && (
        <div className="absolute inset-x-0 bottom-0 h-px bg-line">
          <div
            className={cn("h-full transition-[width] duration-1000 ease-linear", danger ? "bg-alarm" : "bg-phos")}
            style={{ width: `${(timeLeft / item.period) * 100}%` }}
          />
        </div>
      )}

      {exportOpen && exportItem && <ExportItemModal item={exportItem} onClose={() => setExportOpen(false)} />}

      <ConfirmModal
        isOpen={confirmOpen}
        danger
        title="刪除驗證碼"
        description={`確定要刪除這位使用者的「${item.name}」嗎？刪除後無法恢復，金鑰也會一併遺失。`}
        confirmLabel="刪除"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await props.onDelete();
          setConfirmOpen(false);
        }}
      />
    </li>
  );
};

export default AdminTotpRow;
