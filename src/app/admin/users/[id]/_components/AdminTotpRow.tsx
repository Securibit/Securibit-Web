"use client";

import { useEffect, useState } from "react";
import { useInterval } from "react-use";
import toast from "react-hot-toast";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faEllipsis, faEye, faEyeSlash, faPen, faQrcode, faThumbtack, faTrash } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import ExportItemModal from "@/app/code/_components/ExportItemModal";
import { generateOtp } from "@/lib/totp/otp";
import { showError } from "@/lib/errorDialog";
import { cn } from "@/lib/utils";
import { TotpItem } from "@/types/Totp/Totp";
import { AdminTotpRowProps } from "@/types/Admin/AdminTotpRow";
import { formatCategories } from "@/lib/totp/categories";

// 每 3 / 4 位插一個空白（同 CodeCard）
const formatOtp = (otp: string) =>
  otp.length === 6 ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp.replace(/(.{4})(?=.)/g, "$1 ");

const RING = 2 * Math.PI * 16;

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("已複製", { position: "top-right" });
  } catch {
    showError("無法複製", "瀏覽器不允許存取剪貼簿，請手動複製。");
  }
};

// 後台 2FA 清單的一列（和 CodeCard 長得一樣）：動態碼在前端用金鑰產生；已加密的沒有金鑰，只顯示「已加密」
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

  const disabledKeys = [
    ...(secret ? [] : ["secret"]),
    ...(exportItem && !invalidSecret ? [] : ["export"]),
  ];

  return (
    <li className="flex flex-col px-5 py-4">
      <div className="flex items-center gap-4">
        {/* 名稱、類別 */}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[17px] font-semibold text-ink">
            {item.pinned && <FontAwesomeIcon icon={faThumbtack} className="w-3 shrink-0 text-ink-muted" aria-label="已釘選" />}
            <span className="truncate">{item.name || "（未命名）"}</span>
          </p>
          {item.category && <p className="truncate text-[15px] text-ink-muted">{formatCategories(item.category)}</p>}
        </div>

        {/* 驗證碼：點一下複製 */}
        <div className="flex shrink-0 flex-col items-end">
          {!secret ? (
            <>
              <p className="readout text-[30px] text-ink-muted sm:text-[40px]">••• •••</p>
              <p className="text-[13px] text-ink-muted">已加密</p>
            </>
          ) : invalidSecret ? (
            <p className="text-[15px] text-alarm">金鑰錯誤</p>
          ) : otp ? (
            <button onClick={() => copy(otp)} title="點一下複製" className="readout text-[30px] text-ink hover:opacity-60 sm:text-[40px]">
              {formatOtp(otp)}
            </button>
          ) : (
            <p className="readout text-[30px] text-ink-muted sm:text-[40px]">--- ---</p>
          )}
        </div>

        {/* 圓形倒數（沒有金鑰就不顯示） */}
        {secret && !invalidSecret && (
          <div className="relative h-9 w-9 shrink-0" aria-label={`剩餘 ${timeLeft} 秒`}>
            <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
              <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-line/70" />
              <circle
                cx="18" cy="18" r="16" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - timeLeft / item.period)}
                className={cn("transition-[stroke-dashoffset] duration-1000 ease-linear", danger ? "text-alarm" : "text-accent")}
              />
            </svg>
            <span className={cn("absolute inset-0 flex items-center justify-center text-[11px] tabular-nums", danger ? "text-alarm" : "text-ink-muted")}>
              {timeLeft}
            </span>
          </div>
        )}

        {/* 更多 */}
        {(secret || props.canManage) && (
          <Dropdown placement="bottom-end" className="bg-surface text-ink">
            <DropdownTrigger>
              <button aria-label="更多" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-1 hover:text-ink">
                <FontAwesomeIcon icon={faEllipsis} className="w-4" />
              </button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="驗證碼操作"
              disabledKeys={disabledKeys}
              onAction={(key) => {
                if (key === "secret") setShowSecret((prev) => !prev);
                if (key === "export") setExportOpen(true);
                if (key === "edit") props.onEdit();
                if (key === "delete") setConfirmOpen(true);
              }}
            >
              {secret ? (
                <DropdownItem key="secret" startContent={<FontAwesomeIcon icon={showSecret ? faEyeSlash : faEye} className="w-3.5" />}>
                  {showSecret ? "隱藏金鑰" : "顯示金鑰"}
                </DropdownItem>
              ) : null}
              {secret ? (
                <DropdownItem key="export" startContent={<FontAwesomeIcon icon={faQrcode} className="w-3.5" />}>匯出 QR Code</DropdownItem>
              ) : null}
              {props.canManage ? (
                <DropdownItem key="edit" startContent={<FontAwesomeIcon icon={faPen} className="w-3.5" />}>編輯</DropdownItem>
              ) : null}
              {props.canManage ? (
                <DropdownItem key="delete" className="text-danger" color="danger" startContent={<FontAwesomeIcon icon={faTrash} className="w-3.5" />}>
                  刪除
                </DropdownItem>
              ) : null}
            </DropdownMenu>
          </Dropdown>
        )}
      </div>

      {/* 金鑰 */}
      {secret && showSecret && (
        <div className="mt-3 flex items-center gap-3 rounded-[12px] bg-surface-1 px-3.5 py-2">
          <span className="shrink-0 text-[13px] text-ink-muted">金鑰</span>
          <code className="min-w-0 flex-1 break-all text-[15px] text-ink">{secret}</code>
          <button
            type="button"
            onClick={() => copy(secret)}
            aria-label="複製金鑰"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-line/60 hover:text-ink"
          >
            <FontAwesomeIcon icon={faCopy} className="w-3.5" />
          </button>
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
