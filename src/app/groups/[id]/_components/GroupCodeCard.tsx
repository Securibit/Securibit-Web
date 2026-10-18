"use client";

import { useEffect, useMemo, useState } from "react";
import { useInterval } from "react-use";
import { CircularProgress, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Progress, Tooltip } from "@heroui/react";
import { toast } from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faArrowDown, faArrowUp, faEllipsis, faLock, faPen, faQrcode, faShieldHalved, faThumbtack, faTrash } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import ExportItemModal from "@/app/code/_components/ExportItemModal";
import { generateOtp } from "@/lib/totp/otp";
import { isValidSecret } from "@/lib/totp/crud";
import { showError } from "@/lib/errorDialog";
import { TOTP_DEFAULTS, TotpItem } from "@/types/Totp/Totp";
import { GroupCodeCardProps } from "@/types/Group/GroupCodeCard";

// 每 4 位插一個空白方便閱讀（6 位數 → 123 456，8 位數 → 1234 5678），同 CodeCard
const formatOtp = (otp: string) =>
  otp.length === 6 ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp.replace(/(.{4})(?=.)/g, "$1 ");

type MenuKey = "pin" | "export" | "permissions" | "delete";

// 群組的一筆驗證碼，外觀同 CodeCard；動態碼來自金鑰（瀏覽器產生）或伺服器
const GroupCodeCard = (props: GroupCodeCardProps) => {
  const { account, secret, server } = props;
  const period = account.period ?? TOTP_DEFAULTS.period;

  // 每秒依時鐘重算，不用累減（分頁在背景時計時器會變慢，累減會漂移）
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), 1000);

  // 伺服器產生的碼要用伺服器時間判斷週期，避免本機時鐘不準時顯示錯的碼
  const time = secret === undefined ? now + props.clockOffset : now;
  const seconds = Math.floor(time / 1000);
  const timeLeft = period - (seconds % period);
  const counter = Math.floor(seconds / period);

  // ---------- 有金鑰：瀏覽器自己產生 ----------
  const otpKey = `${secret}|${account.digits}|${period}|${account.algorithm}|${counter}`;
  const [local, setLocal] = useState<{ key: string; value: string | null; next: string | null }>();

  useEffect(() => {
    if (secret === undefined) return;
    let cancelled = false;
    const params = { secret, digits: account.digits, period, algorithm: account.algorithm };
    Promise.all([
      generateOtp(params, counter * period * 1000),
      generateOtp(params, (counter + 1) * period * 1000),
    ]).then(([value, next]) => {
      if (!cancelled) setLocal({ key: otpKey, value, next });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpKey]);

  // ---------- 沒有金鑰：伺服器產生（code 是取得當下週期的碼，next 是下一週期） ----------
  const otp = useMemo(() => {
    if (secret !== undefined) return local;
    if (!server) return undefined;
    const serverCounter = Math.floor(server.at / 1000 / period);
    if (counter === serverCounter) return { value: server.code, next: server.next };
    // 已經進入下一個週期、還沒重新取得前，先顯示預先拿到的下一組
    if (counter === serverCounter + 1 && server.next) return { value: server.next, next: null };
    return undefined;
  }, [secret, local, server, counter, period]);

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

  const danger = timeLeft <= Math.min(10, period / 3);

  // 隱藏模式下點一下才顯示，換下一組驗證碼時自動再藏起來
  const [revealedCounter, setRevealedCounter] = useState<number>();
  const revealed = !props.hidden || revealedCounter === counter;

  // 匯出用的完整資料（只有拿得到金鑰、而且金鑰正確時才能匯出）
  const exportItem: TotpItem | undefined =
    secret !== undefined && isValidSecret(secret)
      ? {
          id: account.id,
          name: account.name,
          secret,
          category: account.category,
          digits: account.digits,
          period: account.period,
          algorithm: account.algorithm,
        }
      : undefined;

  // 依權限組出「更多操作」選單
  const menu: { key: MenuKey; label: string; icon: IconDefinition; danger?: boolean }[] = [];
  if (props.onTogglePin) {
    menu.push({ key: "pin", label: account.pinned ? "取消釘選" : "釘選到最上面", icon: faThumbtack });
  }
  if (exportItem) menu.push({ key: "export", label: "匯出 QR Code", icon: faQrcode });
  if (props.onPermissions) menu.push({ key: "permissions", label: "權限", icon: faShieldHalved });
  if (props.onDelete) menu.push({ key: "delete", label: "刪除", icon: faTrash, danger: true });

  const handleMenu = (key: MenuKey) => {
    if (key === "pin") props.onTogglePin?.();
    if (key === "export") setExportOpen(true);
    if (key === "permissions") props.onPermissions?.();
    if (key === "delete") setConfirmOpen(true);
  };

  const hasActions = !!props.onEdit || menu.length > 0;

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
          hasActions && (
            <div className="flex flex-shrink-0 gap-2">
              {props.onEdit && (
                <button
                  onClick={props.onEdit}
                  aria-label="編輯驗證碼"
                  className="rounded-full border-2 border-tpp w-10 h-10 flex items-center justify-center hover:bg-tpp/10 transition-colors"
                >
                  <FontAwesomeIcon icon={faPen} className="w-4 h-4 text-tpp" />
                </button>
              )}
              {menu.length > 0 && (
                <Dropdown className="dark:bg-gray-blue-800">
                  <DropdownTrigger>
                    <button
                      aria-label="更多操作"
                      className="rounded-full border-2 border-gray-blue-300 w-10 h-10 flex items-center justify-center hover:bg-gray-blue-500/10 transition-colors dark:border-gray-blue-600"
                    >
                      <FontAwesomeIcon icon={faEllipsis} className="w-4 h-4 text-gray-blue-500 dark:text-gray-blue-300" />
                    </button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="驗證碼操作" items={menu} onAction={(key) => handleMenu(key as MenuKey)}>
                    {(entry) => (
                      <DropdownItem
                        key={entry.key}
                        className={entry.danger ? "text-danger" : undefined}
                        color={entry.danger ? "danger" : "default"}
                        startContent={<FontAwesomeIcon icon={entry.icon} className="w-3.5" />}
                      >
                        {entry.label}
                      </DropdownItem>
                    )}
                  </DropdownMenu>
                </Dropdown>
              )}
            </div>
          )
        )}

        {/* 名稱與類別 */}
        <div className="flex-1 min-w-0">
          <p className="text-base sm:text-lg font-medium text-gray-blue-900 truncate dark:text-white">
            {account.pinned && (
              <FontAwesomeIcon icon={faThumbtack} className="mr-1.5 w-3 text-tpp" aria-label="已釘選" />
            )}
            {account.has_overwrites && (
              <Tooltip content="這筆驗證碼有個別設定權限">
                <FontAwesomeIcon icon={faLock} className="mr-1.5 w-3 text-gray-blue-400" aria-label="有個別權限設定" />
              </Tooltip>
            )}
            {account.name}
          </p>
          {account.category && (
            <span className="text-xs font-medium px-2 sm:px-2.5 sm:py-0.5 rounded bg-purple-100 text-purple-800 border-2 border-purple-300 dark:bg-tpp/30 dark:text-bityo dark:border-tpp">
              {account.category}
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
            {formatOtp("•".repeat(otp.value.length))}
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
          <p className="text-sm sm:text-xl font-semibold text-red-500">金鑰錯誤！</p>
        )}

        <CircularProgress
          aria-label="剩餘秒數"
          size="lg"
          maxValue={period}
          value={timeLeft}
          color={danger ? "danger" : "primary"}
          formatOptions={{ style: "unit", unit: "second", unitDisplay: "narrow" }}
          showValueLabel={true}
        />
      </div>

      {exportOpen && exportItem && <ExportItemModal item={exportItem} onClose={() => setExportOpen(false)} />}

      <ConfirmModal
        isOpen={confirmOpen}
        danger
        title="刪除驗證碼"
        description={`確定要從群組刪除「${account.name}」嗎？所有成員都會看不到這筆驗證碼，刪除後無法恢復。`}
        confirmLabel="刪除"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          props.onDelete?.();
        }}
      />
    </li>
  );
};

export default GroupCodeCard;
