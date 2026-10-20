"use client";

import { useEffect, useState } from "react";
import { useInterval } from 'react-use';
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { toast } from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faEllipsis, faPen, faQrcode, faShareFromSquare, faThumbtack, faTrash } from "@fortawesome/free-solid-svg-icons";
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

// 方形圖示按鈕
const ICON_BUTTON =
  "flex h-8 w-8 flex-shrink-0 items-center justify-center border border-line text-ink-muted transition-colors hover:border-phos hover:text-phos disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink-muted";

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
      toast.success("已複製驗證碼！", { position: "top-right" });
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
    <li className="group relative border-b border-line py-4 transition-colors hover:bg-ink/5">
      <div className="flex items-center gap-3 sm:gap-4">
        {/* 排序模式：上下移動按鈕 */}
        {props.sort && (
          <div className="flex flex-shrink-0 gap-1.5">
            <button onClick={props.sort.onUp} disabled={!props.sort.canUp} aria-label="往上移" className={ICON_BUTTON}>
              <FontAwesomeIcon icon={faArrowUp} className="w-3.5" />
            </button>
            <button onClick={props.sort.onDown} disabled={!props.sort.canDown} aria-label="往下移" className={ICON_BUTTON}>
              <FontAwesomeIcon icon={faArrowDown} className="w-3.5" />
            </button>
          </div>
        )}

        {/* 左：名稱 + 類別 */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold text-ink">
            {item.pinned && (
              <FontAwesomeIcon icon={faThumbtack} className="mr-1.5 w-3 text-phos" aria-label="已釘選" />
            )}
            {item.name}
          </p>
          {item.category && (
            <span className="tech-label mt-1 inline-block border border-line px-1.5 py-0.5">{item.category}</span>
          )}
        </div>

        {/* 右：讀數（點一下複製）+ 秒數 */}
        <div className="flex flex-shrink-0 flex-col items-end">
          {otp === undefined ? (
            <p className="readout text-2xl text-ink-dim sm:text-3xl">{formatOtp('-'.repeat(item.digits ?? TOTP_DEFAULTS.digits))}</p>
          ) : otp.value && !revealed ? (
            <button
              onClick={() => setRevealedCounter(counter)}
              title="點擊顯示"
              aria-label="顯示驗證碼"
              className="readout text-2xl text-ink-dim transition-colors hover:text-ink sm:text-3xl"
            >
              {formatOtp('•'.repeat(otp.value.length))}
            </button>
          ) : otp.value ? (
            <button
              key={counter}
              onClick={() => otp.value && copyToClipboard(otp.value)}
              title="點擊複製"
              className="readout settle glow text-2xl text-phos transition-colors hover:text-ink sm:text-3xl"
            >
              {formatOtp(otp.value)}
            </button>
          ) : (
            <p className="font-mono text-sm text-alarm sm:text-base">金鑰錯誤</p>
          )}

          <div className="flex items-center gap-3">
            {otp?.value && revealed && danger && otp.next && (
              <button
                onClick={() => otp.next && copyToClipboard(otp.next)}
                title="點擊複製下一組"
                className="font-mono text-[11px] tabular-nums text-ink-dim transition-colors hover:text-phos"
              >
                下一組 {formatOtp(otp.next)}
              </button>
            )}
            <span className={cn("font-mono text-[11px] tracking-[0.08em] text-ink-dim tabular-nums", danger && "text-alarm")}>
              {timeLeft} s
            </span>
          </div>
        </div>

        {/* 操作：方形圖示按鈕 + 更多選單 */}
        {!props.sort && (
          <div className="flex flex-shrink-0 gap-1.5">
            <button onClick={props.onEdit} aria-label="編輯驗證碼" title="編輯" className={ICON_BUTTON}>
              <FontAwesomeIcon icon={faPen} className="w-3.5" />
            </button>
            <Dropdown className="border border-line bg-surface-1">
              <DropdownTrigger>
                <button aria-label="更多操作" title="更多操作" className={ICON_BUTTON}>
                  <FontAwesomeIcon icon={faEllipsis} className="w-3.5" />
                </button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="驗證碼操作"
                className="font-display"
                // 金鑰錯誤時匯出的 QR Code 也不能用
                disabledKeys={secretInvalid ? ["export", "share"] : []}
                onAction={(key) => {
                  if (key === "pin") props.onTogglePin();
                  if (key === "export") setExportOpen(true);
                  if (key === "share") props.onShare?.();
                  if (key === "delete") setConfirmOpen(true);
                }}
              >
                <DropdownItem key="pin" startContent={<FontAwesomeIcon icon={faThumbtack} className="w-3.5" />}>
                  {item.pinned ? "取消釘選" : "釘選到最上面"}
                </DropdownItem>
                <DropdownItem key="export" startContent={<FontAwesomeIcon icon={faQrcode} className="w-3.5" />}>
                  匯出 QR Code
                </DropdownItem>
                {props.onShare ? (
                  <DropdownItem key="share" startContent={<FontAwesomeIcon icon={faShareFromSquare} className="w-3.5" />}>
                    分享到群組
                  </DropdownItem>
                ) : null}
                <DropdownItem
                  key="delete"
                  className="text-danger"
                  color="danger"
                  startContent={<FontAwesomeIcon icon={faTrash} className="w-3.5" />}
                >
                  刪除
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        )}
      </div>

      {/* 倒數條：貼在列底部 */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-line" aria-hidden>
        <div
          className={cn("h-full transition-[width] duration-1000 ease-linear", danger ? "bg-alarm" : "bg-phos")}
          style={{ width: `${(timeLeft / period) * 100}%` }}
        />
      </div>

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
