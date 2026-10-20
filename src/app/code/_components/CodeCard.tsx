"use client";

import { useEffect, useState } from "react";
import { useInterval } from 'react-use';
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { toast } from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp, faEllipsis, faPen, faQrcode, faShareFromSquare, faThumbtack, faTrash } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import { cn } from "@/lib/utils";
import { generateOtp } from "@/lib/totp/otp";
import { isValidSecret } from "@/lib/totp/crud";
import { TOTP_DEFAULTS } from "@/types/Totp/Totp";
import { CodeCardProps } from "@/types/Code/CodeCard";
import ExportItemModal from "./ExportItemModal";
import { showError } from "@/lib/errorDialog";

// 每 4 位插一個空白方便閱讀（6 位數 → 123 456，8 位數 → 1234 5678）
const formatOtp = (otp: string) =>
  otp.length === 6 ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp.replace(/(.{4})(?=.)/g, '$1 ');

const RING = 2 * Math.PI * 16;

// 排序模式的上下移小圓鈕
const moveButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-full bg-surface-1 text-ink-muted transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-muted";

// 驗證碼列表的一列：和首頁示範的長得一樣
const CodeCard = (props: CodeCardProps) => {
  const { item } = props;
  const period = item.period ?? TOTP_DEFAULTS.period;

  // 每秒依時鐘重算，不用累減（分頁在背景時計時器會變慢，累減會漂移）
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), 1000);

  const seconds = Math.floor(now / 1000);
  const timeLeft = period - (seconds % period);
  const counter = Math.floor(seconds / period);

  // 參數或時間週期變了才重新產生驗證碼
  const otpKey = `${item.secret}|${item.digits}|${period}|${item.algorithm}|${counter}`;
  // value：目前的驗證碼，next：下一組（快到期時先顯示，不用等換碼）
  const [otp, setOtp] = useState<{ key: string; value: string | null; next: string | null }>();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      generateOtp(item, counter * period * 1000),
      generateOtp(item, (counter + 1) * period * 1000),
    ]).then(([value, next]) => {
      if (!cancelled) setOtp({ key: otpKey, value, next });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpKey]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已複製", { position: "top-right" });
    } catch {
      showError("無法複製", "瀏覽器不允許存取剪貼簿，請手動複製驗證碼。");
    }
  };

  // 金鑰錯誤（含解不開的密文）時不能匯出、也不能分享
  const secretInvalid = otp?.value === null || !isValidSecret(item.secret);

  const danger = timeLeft <= Math.min(10, period / 3);

  // 隱藏模式下點一下才顯示，換下一組驗證碼時自動再藏起來
  const [revealedCounter, setRevealedCounter] = useState<number>();
  const revealed = !props.hidden || revealedCounter === counter;

  return (
    <li className="flex items-center gap-4 px-5 py-4">
      {/* 排序模式：上下移 */}
      {props.sort && (
        <div className="flex shrink-0 flex-col gap-1">
          <button onClick={props.sort.onUp} disabled={!props.sort.canUp} aria-label="往上移" className={moveButtonClass}>
            <FontAwesomeIcon icon={faChevronUp} className="w-3" />
          </button>
          <button onClick={props.sort.onDown} disabled={!props.sort.canDown} aria-label="往下移" className={moveButtonClass}>
            <FontAwesomeIcon icon={faChevronDown} className="w-3" />
          </button>
        </div>
      )}

      {/* 名稱、類別 */}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[17px] font-semibold text-ink">
          {item.pinned && <FontAwesomeIcon icon={faThumbtack} className="w-3 shrink-0 text-ink-muted" aria-label="已釘選" />}
          <span className="truncate">{item.name}</span>
        </p>
        {item.category && <p className="truncate text-[15px] text-ink-muted">{item.category}</p>}
      </div>

      {/* 驗證碼：點一下複製 */}
      <div className="flex shrink-0 flex-col items-end">
        {otp === undefined ? (
          <p className="readout text-[30px] text-ink-muted sm:text-[40px]">--- ---</p>
        ) : otp.value && !revealed ? (
          <button onClick={() => setRevealedCounter(counter)} aria-label="顯示驗證碼" className="readout text-[30px] text-ink-muted sm:text-[40px]">
            {formatOtp('•'.repeat(otp.value.length))}
          </button>
        ) : otp.value ? (
          <button onClick={() => otp.value && copyToClipboard(otp.value)} title="點一下複製" className="readout text-[30px] text-ink transition-opacity hover:opacity-60 sm:text-[40px]">
            {formatOtp(otp.value)}
          </button>
        ) : (
          <p className="text-[15px] text-alarm">金鑰錯誤</p>
        )}
        {otp?.value && revealed && danger && otp.next && (
          <button onClick={() => otp.next && copyToClipboard(otp.next)} className="text-[13px] tabular-nums text-ink-muted hover:text-ink">
            下一組 {formatOtp(otp.next)}
          </button>
        )}
      </div>

      {/* 圓形倒數 */}
      <div className="relative h-9 w-9 shrink-0" aria-label={`剩餘 ${timeLeft} 秒`}>
        <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
          <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-line/70" />
          <circle
            cx="18" cy="18" r="16" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - timeLeft / period)}
            className={cn("transition-[stroke-dashoffset] duration-1000 ease-linear", danger ? "text-alarm" : "text-accent")}
          />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center text-[11px] tabular-nums", danger ? "text-alarm" : "text-ink-muted")}>
          {timeLeft}
        </span>
      </div>

      {/* 更多 */}
      {!props.sort && (
        <Dropdown placement="bottom-end" className="bg-surface text-ink">
          <DropdownTrigger>
            <button aria-label="更多" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink">
              <FontAwesomeIcon icon={faEllipsis} className="w-4" />
            </button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="驗證碼操作"
            // 金鑰錯誤時匯出的 QR Code 也不能用
            disabledKeys={secretInvalid ? ["export", "share"] : []}
            onAction={(key) => {
              if (key === "edit") props.onEdit();
              if (key === "pin") props.onTogglePin();
              if (key === "export") setExportOpen(true);
              if (key === "share") props.onShare?.();
              if (key === "delete") setConfirmOpen(true);
            }}
          >
            <DropdownItem key="edit" startContent={<FontAwesomeIcon icon={faPen} className="w-3.5" />}>編輯</DropdownItem>
            <DropdownItem key="pin" startContent={<FontAwesomeIcon icon={faThumbtack} className="w-3.5" />}>
              {item.pinned ? "取消釘選" : "釘選到最上面"}
            </DropdownItem>
            <DropdownItem key="export" startContent={<FontAwesomeIcon icon={faQrcode} className="w-3.5" />}>匯出 QR Code</DropdownItem>
            {props.onShare ? (
              <DropdownItem key="share" startContent={<FontAwesomeIcon icon={faShareFromSquare} className="w-3.5" />}>分享到群組</DropdownItem>
            ) : null}
            <DropdownItem key="delete" className="text-danger" color="danger" startContent={<FontAwesomeIcon icon={faTrash} className="w-3.5" />}>
              刪除
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      )}

      {exportOpen && <ExportItemModal item={item} onClose={() => setExportOpen(false)} />}

      <ConfirmModal
        isOpen={confirmOpen}
        danger
        title="刪除驗證碼"
        description={`確定要刪除「${item.name}」嗎？刪除後無法恢復，金鑰也會一併遺失。`}
        confirmLabel="刪除"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          props.onDelete();
        }}
      />
    </li>
  );
};

export default CodeCard;
