"use client";

import { useEffect, useState } from "react";
import { useInterval } from 'react-use';
import { CircularProgress, Progress } from "@heroui/react";
import { toast } from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import { generateOtp } from "@/lib/totp/otp";
import { TOTP_DEFAULTS } from "@/types/Totp/Totp";
import { CodeCardProps } from "@/types/Code/CodeCard";

// 每 4 位插一個空白方便閱讀（6 位數 → 123 456，8 位數 → 1234 5678）
const formatOtp = (otp: string) =>
  otp.length === 6 ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp.replace(/(\d{4})(?=\d)/g, '$1 ');

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
  const [otp, setOtp] = useState<{ key: string; value: string | null }>();

  useEffect(() => {
    let cancelled = false;
    generateOtp(item, counter * period * 1000).then((value) => {
      if (!cancelled) setOtp({ key: otpKey, value });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpKey]);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已複製驗證碼！", { position: "top-right" });
    } catch {
      toast.error("無法存取剪貼簿，請手動複製。", { position: "top-right" });
    }
  };

  const danger = timeLeft <= Math.min(10, period / 3);

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
        {/* 操作按鈕 */}
        <div className="flex flex-shrink-0 gap-2">
          <button
            onClick={props.onEdit}
            aria-label="編輯驗證碼"
            className="rounded-full border-2 border-tpp w-10 h-10 flex items-center justify-center hover:bg-tpp/10 transition-colors"
          >
            <FontAwesomeIcon icon={faPen} className="w-4 h-4 text-tpp" />
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            aria-label="刪除驗證碼"
            className="rounded-full border-2 border-red-500 w-10 h-10 flex items-center justify-center hover:bg-red-500/10 transition-colors"
          >
            <FontAwesomeIcon icon={faTrash} className="w-4 h-4 text-red-500" />
          </button>
        </div>

        {/* TOTP 名稱 */}
        <div className="flex-1 min-w-0">
          <p className="text-base sm:text-lg font-medium text-gray-blue-900 truncate dark:text-white">
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
        ) : otp.value ? (
          <button
            onClick={() => otp.value && copyToClipboard(otp.value)}
            title="點擊複製"
            className="text-xl sm:text-2xl font-semibold tabular-nums text-gray-blue-900 dark:text-white hover:text-tpp transition-colors"
          >
            {formatOtp(otp.value)}
          </button>
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
