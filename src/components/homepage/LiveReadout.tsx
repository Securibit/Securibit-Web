"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useInterval } from "react-use";
import { cn } from "@/lib/utils";
import { generateOtp } from "@/lib/totp/otp";

// 示範用金鑰（RFC 6238 測試向量常用的那組），不是任何人的帳號
const DEMO = { secret: 'JBSWY3DZEBSWY3DZEBSWY3DZ', digits: 6, period: 30, algorithm: 'SHA-1' as const };

const formatOtp = (otp: string) => `${otp.slice(0, 3)} ${otp.slice(3)}`;

const subscribe = () => () => {};

// 首頁右側會真的跳動的儀表：用示範金鑰算出目前的驗證碼
const LiveReadout = () => {
  // 伺服器端沒有時間可以算，掛載到瀏覽器後才顯示讀數，避免 hydration 不一致
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [tick, setTick] = useState(() => Date.now());
  useInterval(() => setTick(Date.now()), 1000);
  const now = mounted ? tick : undefined;

  const seconds = Math.floor((now ?? 0) / 1000);
  const timeLeft = DEMO.period - (seconds % DEMO.period);
  const counter = Math.floor(seconds / DEMO.period);

  const [otp, setOtp] = useState<{ counter: number; value: string }>();
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    generateOtp(DEMO, counter * DEMO.period * 1000).then((value) => {
      if (!cancelled && value) setOtp({ counter, value });
    });
    return () => {
      cancelled = true;
    };
  }, [counter, mounted]);

  const danger = now !== undefined && timeLeft <= 5;

  return (
    <div className="panel p-5 sm:p-6" aria-label="示範驗證碼">
      <div className="flex items-center justify-between">
        <p className="tech-label flex items-center gap-2">
          <span className={cn("led", danger && "led-alarm")} />
          LIVE · 示範
        </p>
        <p className="readout text-xs text-ink-dim">#{String(counter % 1000).padStart(3, '0')}</p>
      </div>

      <p className="mt-6 font-display text-sm tracking-[0.08em] text-ink-muted">GitHub · 示範帳號</p>
      <p
        key={otp?.counter}
        className={cn(
          "readout settle mt-1 text-5xl font-medium sm:text-6xl",
          otp ? "glow text-phos" : "text-ink-dim"
        )}
      >
        {otp ? formatOtp(otp.value) : '--- ---'}
      </p>

      {/* 倒數條 */}
      <div className="mt-6 h-1 w-full bg-line">
        <div
          className={cn("h-full transition-[width] duration-1000 ease-linear", danger ? "bg-alarm" : "bg-phos")}
          style={{ width: `${now === undefined ? 100 : (timeLeft / DEMO.period) * 100}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[11px] tracking-[0.08em] text-ink-dim">
        <span>SHA-1 · 6 DIGITS · 30 S</span>
        <span className={cn("tabular-nums", danger && "text-alarm")}>{now === undefined ? '--' : timeLeft} s</span>
      </div>
    </div>
  );
};

export default LiveReadout;
