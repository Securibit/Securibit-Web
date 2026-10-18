"use client";

import { useEffect, useState } from "react";
import { useInterval } from 'react-use';
import { CircularProgress, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Progress } from "@heroui/react";
import { toast } from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faEllipsis, faPen, faQrcode, faShareFromSquare, faThumbtack, faTrash } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import { generateOtp } from "@/lib/totp/otp";
import { isValidSecret } from "@/lib/totp/crud";
import { TOTP_DEFAULTS } from "@/types/Totp/Totp";
import { CodeCardProps } from "@/types/Code/CodeCard";
import ExportItemModal from "./ExportItemModal";
import { showError } from "@/lib/errorDialog";

// 每 4 位插一個空白方便閱讀（6 位數 → 123 456，8 位數 → 1234 5678）
const formatOtp = (otp: string) =>
  otp.length === 6 ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp.replace(/(.{4})(?=.)/g, '$1 ');

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
    <li className="py-3 sm:py-4">
      <Progress
        aria-label="剩餘時間"
        maxValue={period}
        value={timeLeft}
        color={danger ? "danger" : "primary"}
        className="mb-2 h-1"
      />
      <div className="flex items-center gap-3 sm:gap-4">
        {/* 操作按鈕；排序模式改成上下移動 */}
        {props.sort ? (
          <div className="flex flex-shrink-0 gap-2">
            <button
              onClick={props.sort.onUp}
              disabled={!props.sort.canUp}
              aria-label="往上移"
              className="rounded-full border-2 border-tpp w-10 h-10 flex items-center justify-center hover:bg-tpp/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <FontAwesomeIcon icon={faArrowUp} className="w-4 h-4 text-tpp" />
            </button>
            <button
              onClick={props.sort.onDown}
              disabled={!props.sort.canDown}
              aria-label="往下移"
              className="rounded-full border-2 border-tpp w-10 h-10 flex items-center justify-center hover:bg-tpp/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <FontAwesomeIcon icon={faArrowDown} className="w-4 h-4 text-tpp" />
            </button>
          </div>
        ) : (
          <div className="flex flex-shrink-0 gap-2">
            <button
              onClick={props.onEdit}
              aria-label="編輯驗證碼"
              className="rounded-full border-2 border-tpp w-10 h-10 flex items-center justify-center hover:bg-tpp/10 transition-colors"
            >
              <FontAwesomeIcon icon={faPen} className="w-4 h-4 text-tpp" />
            </button>
            <Dropdown className="dark:bg-gray-blue-800">
              <DropdownTrigger>
                <button
                  aria-label="更多操作"
                  className="rounded-full border-2 border-gray-blue-300 w-10 h-10 flex items-center justify-center hover:bg-gray-blue-500/10 transition-colors dark:border-gray-blue-600"
                >
                  <FontAwesomeIcon icon={faEllipsis} className="w-4 h-4 text-gray-blue-500 dark:text-gray-blue-300" />
                </button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="驗證碼操作"
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

        {/* TOTP 名稱 */}
        <div className="flex-1 min-w-0">
          <p className="text-base sm:text-lg font-medium text-gray-blue-900 truncate dark:text-white">
            {item.pinned && (
              <FontAwesomeIcon icon={faThumbtack} className="mr-1.5 w-3 text-tpp" aria-label="已釘選" />
            )}
            {item.name}
          </p>
          {item.category && (
            <span className="text-xs font-medium px-2 sm:px-2.5 sm:py-0.5 rounded bg-purple-100 text-purple-800 border-2 border-purple-300 dark:bg-tpp/30 dark:text-bityo dark:border-tpp">
              {item.category}
            </span>
          )}
        </div>

        {/* 驗證碼（點擊複製） */}
        {otp === undefined ? (
          <p className="text-xl font-semibold text-gray-blue-400 tabular-nums">------</p>
        ) : otp.value && !revealed ? (
          <button
            onClick={() => setRevealedCounter(counter)}
            title="點擊顯示"
            aria-label="顯示驗證碼"
            className="text-xl sm:text-2xl font-semibold tracking-widest text-gray-blue-400 hover:text-tpp transition-colors"
          >
            {formatOtp('•'.repeat(otp.value.length))}
          </button>
        ) : otp.value ? (
          <div className="flex flex-col items-end">
            <button
              onClick={() => otp.value && copyToClipboard(otp.value)}
              title="點擊複製"
              className="text-xl sm:text-2xl font-semibold tabular-nums text-gray-blue-900 dark:text-white hover:text-tpp transition-colors"
            >
              {formatOtp(otp.value)}
            </button>
            {danger && otp.next && (
              <button
                onClick={() => otp.next && copyToClipboard(otp.next)}
                title="點擊複製下一組"
                className="text-xs tabular-nums text-gray-blue-500 hover:text-tpp transition-colors dark:text-gray-blue-400"
              >
                下一組 {formatOtp(otp.next)}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm sm:text-xl font-semibold text-red-500">
            金鑰錯誤！
          </p>
        )}

        <CircularProgress
          aria-label="剩餘秒數"
          size="lg"
          maxValue={period}
          value={timeLeft}
          color={danger ? "danger" : "primary"}
          formatOptions={{
            style: 'unit',
            unit: 'second',
            unitDisplay: 'narrow',
          }}
          showValueLabel={true}
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
