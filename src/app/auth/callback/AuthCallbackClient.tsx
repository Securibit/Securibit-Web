"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Spinner from "@/components/ui/Loading/Spinner";
import { supabase } from "@/config/supabase";
import { AUTH_CHANNEL } from "@/lib/totp/account";
import { AuthPopupMessage } from "@/types/Auth/AuthPopup";

type Status = 'loading' | 'done' | 'cancelled' | 'error';

// 讀網址上的 OAuth 錯誤（Google 取消或設定錯誤時會帶 error / error_description）
const readUrlError = () => {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const code = query.get('error') ?? hash.get('error');
  const description = query.get('error_description') ?? hash.get('error_description');
  return code ? { code, description: description ?? code } : null;
};

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
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      {status === 'loading' && <Spinner label="登入中…" />}
      {status === 'done' && (
        <div>
          <p className="mb-2 text-lg font-semibold">登入完成</p>
          <p className="mb-4 text-gray-blue-500">可以關閉這個視窗，回到原本的頁面。</p>
          <Link href="/code" className="text-tpp underline underline-offset-4">前往驗證碼</Link>
        </div>
      )}
      {status === 'cancelled' && (
        <p className="text-gray-blue-500">已取消登入，可以關閉這個視窗。</p>
      )}
      {status === 'error' && (
        <div>
          <p className="mb-2 text-lg font-semibold text-red-500">登入失敗</p>
          <p className="mb-4 break-words text-gray-blue-500">{error}</p>
          <Link href="/" className="text-tpp underline underline-offset-4">回到首頁</Link>
        </div>
      )}
    </div>
  );
};

export default AuthCallbackClient;
