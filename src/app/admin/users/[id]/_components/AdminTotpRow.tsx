"use client";

import { useEffect, useState } from "react";
import { useInterval } from "react-use";
import toast from "react-hot-toast";
import { Button, Chip, CircularProgress, Tooltip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faEye, faEyeSlash, faLock, faPen, faQrcode, faThumbtack, faTrash } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import ExportItemModal from "@/app/code/_components/ExportItemModal";
import { generateOtp } from "@/lib/totp/otp";
import { showError } from "@/lib/errorDialog";
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

// 後台 2FA 清單的一筆：動態碼在前端用金鑰產生；已加密的沒有金鑰，只顯示「已加密」
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
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* 名稱、類別 */}
        <div className="min-w-0 flex-1 basis-40">
          <p className="truncate font-medium text-gray-blue-900 dark:text-white">
            {item.pinned && <FontAwesomeIcon icon={faThumbtack} className="mr-1.5 w-3 text-tpp" aria-label="已釘選" />}
            {item.name || "（未命名）"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {item.category && (
              <Chip size="sm" variant="flat" color="secondary">
                {item.category}
              </Chip>
            )}
            {item.encrypted && (
              <Chip size="sm" variant="flat" color="success" startContent={<FontAwesomeIcon icon={faLock} className="ml-1 w-3" />}>
                已加密
              </Chip>
            )}
          </div>
        </div>

        {/* 目前的動態碼（點擊複製） */}
        {secret && (
          <div className="flex items-center gap-2">
            {invalidSecret ? (
              <span className="text-sm font-semibold text-red-500">金鑰錯誤！</span>
            ) : (
              <button
                onClick={() => otp && copy(otp, "已複製驗證碼！")}
                title="點擊複製"
                className="text-xl font-semibold tabular-nums text-gray-blue-900 transition-colors hover:text-tpp dark:text-white"
              >
                {otp ? formatOtp(otp) : "------"}
              </button>
            )}
            <CircularProgress
              aria-label="剩餘秒數"
              size="sm"
              maxValue={item.period}
              value={timeLeft}
              color={danger ? "danger" : "primary"}
              showValueLabel
              formatOptions={{ style: "unit", unit: "second", unitDisplay: "narrow" }}
            />
          </div>
        )}

        {/* 操作 */}
        <div className="flex gap-1">
          {secret && (
            <Tooltip content={showSecret ? "隱藏金鑰" : "顯示金鑰"}>
              <Button isIconOnly size="sm" variant="light" aria-label={showSecret ? "隱藏金鑰" : "顯示金鑰"} onPress={() => setShowSecret(!showSecret)}>
                <FontAwesomeIcon icon={showSecret ? faEyeSlash : faEye} className="w-3.5" />
              </Button>
            </Tooltip>
          )}
          {exportItem && !invalidSecret && (
            <Tooltip content="QR Code">
              <Button isIconOnly size="sm" variant="light" aria-label="顯示 QR Code" onPress={() => setExportOpen(true)}>
                <FontAwesomeIcon icon={faQrcode} className="w-3.5" />
              </Button>
            </Tooltip>
          )}
          {props.canManage && (
            <>
              <Tooltip content="編輯">
                <Button isIconOnly size="sm" variant="light" aria-label="編輯驗證碼" onPress={props.onEdit}>
                  <FontAwesomeIcon icon={faPen} className="w-3.5" />
                </Button>
              </Tooltip>
              <Tooltip content="刪除">
                <Button isIconOnly size="sm" variant="light" color="danger" aria-label="刪除驗證碼" onPress={() => setConfirmOpen(true)}>
                  <FontAwesomeIcon icon={faTrash} className="w-3.5" />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* 金鑰 */}
      {secret && showSecret && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-gray-blue-100 px-3 py-2 dark:bg-gray-blue-900">
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-gray-blue-900 dark:text-gray-blue-100">{secret}</code>
          <Button isIconOnly size="sm" variant="light" aria-label="複製金鑰" onPress={() => copy(secret, "已複製金鑰！")}>
            <FontAwesomeIcon icon={faCopy} className="w-3.5" />
          </Button>
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
