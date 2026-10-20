"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import Spinner from "@/components/ui/Loading/Spinner";
import { supabase } from "@/config/supabase";
import { AUTH_CHANNEL } from "@/lib/totp/account";
import { AuthPopupMessage } from "@/types/Auth/AuthPopup";

type Status = 'loading' | 'done' | 'cancelled' | 'error';

// 面板頂列的狀態字
const STATUS_LABEL: Record<Status, string> = {
  loading: 'PENDING',
  done: 'OK',
  cancelled: 'CANCELLED',
  error: 'ERROR',
};

// 讀網址上的 OAuth 錯誤（Google 取消或設定錯誤時會帶 error / error_description）
const readUrlError = () => {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const code = query.get('error') ?? hash.get('error');
  const description = query.get('error_description') ?? hash.get('error_description');
  return code ? { code, description: description ?? code } : null;
};

// 方形的連結按鈕（這頁沒有 HeroUI Provider 以外的外框，自己排）
const linkClass =
  "inline-flex items-center border border-line-strong px-4 py-2 font-display text-sm tracking-[0.12em] text-ink transition-colors hover:border-phos hover:text-phos";

/**
 * 彈出視窗登入的落地頁：Supabase client 初始化時會自動處理網址上的登入資訊（detectSessionInUrl），
 * 拿到 session 後通知原本的頁面並關閉自己。
 */
const AuthCallbackClient = () => {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string>();

  useEffect(() => {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    const send = (message: AuthPopupMessage) => channel.postMessage(message);

    const finish = async () => {
      const urlError = readUrlError();
      if (urlError) {
        // 使用者在 Google 頁面按取消不算錯誤，直接關掉
        if (urlError.code === 'access_denied') {
          send({ type: 'cancelled' });
          setStatus('cancelled');
          window.close();
        } else {
          send({ type: 'error', message: urlError.description });
          setError(urlError.description);
          setStatus('error');
        }
        return;
      }

      // getSession 會等 client 處理完網址上的 code / token
      const { data, error: sessionError } = await supabase.auth.getSession();
      const session = data.session;
      if (sessionError || !session) {
        const message = sessionError?.message ?? '沒有取得登入資訊，請再試一次';
        send({ type: 'error', message });
        setError(message);
        setStatus('error');
        return;
      }

      send({
        type: 'signed-in',
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      });
      setStatus('done');
      // 手機瀏覽器可能把彈窗開成新分頁，關不掉時畫面會顯示提示
      window.close();
    };

    finish();
    return () => channel.close();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-ink">
      <div className="panel boot w-full max-w-sm">
        {/* 頂列：這頁是什麼、目前狀態 */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="tech-label">AUTH // CALLBACK</p>
          <p className={cn("tech-label flex items-center gap-2", status === 'error' && "text-alarm")}>
            <span
              className={cn(
                "led",
                status === 'cancelled' && "led-off",
                status === 'error' && "led-alarm"
              )}
              aria-hidden
            />
            {STATUS_LABEL[status]}
          </p>
        </div>

        <div className="p-6 text-center">
          {status === 'loading' && <Spinner label="登入中…" />}

          {status === 'done' && (
            <div>
              <p className="font-display text-xl font-bold text-ink">登入完成</p>
              <p className="mt-2 text-sm text-ink-muted">可以關閉這個視窗，回到原本的頁面。</p>
              <Link href="/code" className={cn(linkClass, "mt-5")}>前往驗證碼</Link>
            </div>
          )}

          {status === 'cancelled' && (
            <p className="text-sm text-ink-muted">已取消登入，可以關閉這個視窗。</p>
          )}

          {status === 'error' && (
            <div>
              <p className="font-display text-xl font-bold text-alarm">登入失敗</p>
              <p className="mt-3 break-words border border-line bg-surface px-3 py-2 text-left font-mono text-xs text-ink-muted">
                {error}
              </p>
              <Link href="/" className={cn(linkClass, "mt-5")}>回到首頁</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthCallbackClient;
