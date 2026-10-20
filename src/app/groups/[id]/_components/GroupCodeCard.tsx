"use client";

import { useEffect, useMemo, useState } from "react";
import { useInterval } from "react-use";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Tooltip } from "@heroui/react";
import { toast } from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faChevronDown, faChevronUp, faEllipsis, faLock, faPen, faQrcode, faShieldHalved, faThumbtack, faTrash } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import ExportItemModal from "@/app/code/_components/ExportItemModal";
import { cn } from "@/lib/utils";
import { generateOtp } from "@/lib/totp/otp";
import { isValidSecret } from "@/lib/totp/crud";
import { showError } from "@/lib/errorDialog";
import { TOTP_DEFAULTS, TotpItem } from "@/types/Totp/Totp";
import { GroupCodeCardProps } from "@/types/Group/GroupCodeCard";
import { formatCategories } from "@/lib/totp/categories";

// 每 4 位插一個空白方便閱讀（6 位數 → 123 456，8 位數 → 1234 5678），同 CodeCard
const formatOtp = (otp: string) =>
  otp.length === 6 ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp.replace(/(.{4})(?=.)/g, "$1 ");

const RING = 2 * Math.PI * 16;

type MenuKey = "edit" | "pin" | "export" | "permissions" | "delete";

// 排序模式的上下移小圓鈕
const moveButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-full bg-surface-1 text-ink-muted transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-muted";

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
      toast.success("已複製", { position: "top-right" });
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

  // 依權限組出「更多」選單
  const menu: { key: MenuKey; label: string; icon: IconDefinition; danger?: boolean }[] = [];
  if (props.onEdit) menu.push({ key: "edit", label: "編輯", icon: faPen });
  if (props.onTogglePin) {
    menu.push({ key: "pin", label: account.pinned ? "取消釘選" : "釘選到最上面", icon: faThumbtack });
  }
  if (exportItem) menu.push({ key: "export", label: "匯出 QR Code", icon: faQrcode });
  if (props.onPermissions) menu.push({ key: "permissions", label: "權限", icon: faShieldHalved });
  if (props.onDelete) menu.push({ key: "delete", label: "刪除", icon: faTrash, danger: true });

  const handleMenu = (key: MenuKey) => {
    if (key === "edit") props.onEdit?.();
    if (key === "pin") props.onTogglePin?.();
    if (key === "export") setExportOpen(true);
    if (key === "permissions") props.onPermissions?.();
    if (key === "delete") setConfirmOpen(true);
  };

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
          {account.pinned && <FontAwesomeIcon icon={faThumbtack} className="w-3 shrink-0 text-ink-muted" aria-label="已釘選" />}
          {account.has_overwrites && (
            <Tooltip content="這筆驗證碼有個別設定權限">
              <FontAwesomeIcon icon={faLock} className="w-3 shrink-0 text-ink-muted" aria-label="有個別權限設定" />
            </Tooltip>
          )}
          <span className="truncate">{account.name}</span>
        </p>
        {account.category && <p className="truncate text-[15px] text-ink-muted">{formatCategories(account.category)}</p>}
      </div>

      {/* 驗證碼：點一下複製 */}
      <div className="flex shrink-0 flex-col items-end">
        {otp === undefined ? (
          <p className="readout text-[30px] text-ink-muted sm:text-[40px]">--- ---</p>
        ) : otp.value && !revealed ? (
          <button onClick={() => setRevealedCounter(counter)} aria-label="顯示驗證碼" className="readout text-[30px] text-ink-muted sm:text-[40px]">
            {formatOtp("•".repeat(otp.value.length))}
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
      {!props.sort && menu.length > 0 && (
        <Dropdown placement="bottom-end" className="bg-surface text-ink">
          <DropdownTrigger>
            <button aria-label="更多" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink">
              <FontAwesomeIcon icon={faEllipsis} className="w-4" />
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
