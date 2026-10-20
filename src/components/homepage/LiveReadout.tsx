"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useInterval } from "react-use";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import { generateOtp } from "@/lib/totp/otp";

// 示範用的三筆帳號（金鑰是 RFC 6238 測試向量，不是任何人的）
const DEMO = [
  { name: 'GitHub', account: 'andy@bityo.tw', secret: 'JBSWY3DZEBSWY3DZEBSWY3DZ' },
  { name: 'Google', account: 'andy@bityo.tw', secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' },
  { name: 'Binance', account: 'andy@bityo.tw', secret: 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU' },
];
const PERIOD = 30;

const formatOtp = (otp: string) => `${otp.slice(0, 3)} ${otp.slice(3)}`;

const subscribe = () => () => {};

// 首頁的「產品照」：就是驗證碼列表本人，三筆真的會跳的示範驗證碼
const LiveReadout = () => {
  // 伺服器端沒有時間可以算，掛載到瀏覽器後才顯示，避免 hydration 不一致
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [tick, setTick] = useState(() => Date.now());
  useInterval(() => setTick(Date.now()), 1000);
  const now = mounted ? tick : undefined;

  const seconds = Math.floor((now ?? 0) / 1000);
  const timeLeft = PERIOD - (seconds % PERIOD);
  const counter = Math.floor(seconds / PERIOD);

  const [otps, setOtps] = useState<string[]>();
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    Promise.all(DEMO.map((item) => generateOtp({ secret: item.secret }, counter * PERIOD * 1000))).then((values) => {
      if (!cancelled) setOtps(values.map((v) => v ?? '------'));
    });
    return () => {
      cancelled = true;
    };
  }, [counter, mounted]);

  const danger = now !== undefined && timeLeft <= 5;

  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-[22px] border border-line/70 bg-surface text-left">
      {/* 工具列 */}
      <div className="flex items-center gap-3 border-b border-line/60 px-5 py-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-surface-1 px-3 py-1.5 text-[15px] text-ink-muted">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="w-3.5" />
          搜尋
        </div>
        <span className="flex items-center gap-1.5 text-[15px] text-accent">
          <FontAwesomeIcon icon={faPlus} className="w-3" />
          新增
        </span>
      </div>

      <ul>
        {DEMO.map((item, i) => (
          <li key={item.name} className={cn("flex items-center gap-4 px-5 py-4", i > 0 && "border-t border-line/60")}>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold">{item.name}</p>
              <p className="truncate text-[15px] text-ink-muted">{item.account}</p>
            </div>
            <p className={cn("readout text-[34px] sm:text-[40px]", !otps ? "text-ink-muted" : danger ? "text-alarm" : "text-ink")}>
              {otps ? formatOtp(otps[i]) : '--- ---'}
            </p>
            <div className="relative h-9 w-9 shrink-0">
              <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
                <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-line/70" />
                <circle
                  cx="18" cy="18" r="16" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor"
                  strokeDasharray={2 * Math.PI * 16}
                  strokeDashoffset={2 * Math.PI * 16 * (now === undefined ? 0 : 1 - timeLeft / PERIOD)}
                  className={cn("transition-[stroke-dashoffset] duration-1000 ease-linear", danger ? "text-alarm" : "text-accent")}
                />
              </svg>
              <span className={cn("absolute inset-0 flex items-center justify-center text-[11px] tabular-nums", danger ? "text-alarm" : "text-ink-muted")}>
                {now === undefined ? '' : timeLeft}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LiveReadout;
