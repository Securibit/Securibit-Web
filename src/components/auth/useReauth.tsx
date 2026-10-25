"use client";

import { useCallback, useState } from "react";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import { supabase } from "@/config/supabase";
import { REAUTH_CANCELLED, REAUTH_CODE, waitForReauth } from "@/lib/totp/account";
import { Result } from "@/types/Permission/Permission";
import useAuth from "./useAuth";

interface Pending {
  retry: () => Promise<void>;
  cancel: () => void;
}

/**
 * 刪除帳號這類操作，API 回 reauth_required（太久沒登入）時：跳出對話框請使用者重新用 Google 登入，
 * 登入完成後自動再試一次。登入彈窗一定要在點擊裡開（否則會被擋），所以要先問一次再開。
 * 回傳的 modal 要放進畫面裡；使用者按取消時結果的 code 是 REAUTH_CANCELLED，呼叫端不用再顯示錯誤
 */
const useReauth = () => {
  const { user, login } = useAuth();
  const [pending, setPending] = useState<Pending>();

  const withReauth = useCallback(
    async <T,>(action: () => Promise<Result<T>>): Promise<Result<T>> => {
      const first = await action();
      if (first.success || first.code !== REAUTH_CODE || !user) return first;
      const uid = user.uid;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const oldToken = session?.access_token ?? "";

      return new Promise<Result<T>>((resolve) => {
        setPending({
          cancel: () => {
            setPending(undefined);
            resolve({ success: false, message: "已取消", code: REAUTH_CANCELLED });
          },
          retry: async () => {
            // 先開始等再開登入視窗；login() 必須在這次點擊裡同步開窗
            const waiting = waitForReauth(uid, oldToken);
            login();
            const outcome = await waiting;
            setPending(undefined);
            if (outcome === "ok") resolve(await action());
            else if (outcome === "other-user") {
              resolve({ success: false, message: "登入的不是原本的帳號，已取消這次操作" });
            } else resolve({ success: false, message: "沒有完成重新登入，請再試一次" });
          },
        });
      });
    },
    [user, login]
  );

  const reauthModal = (
    <ConfirmModal
      isOpen={!!pending}
      title="請重新登入"
      description="這個操作需要確認是你本人。請用目前的 Google 帳號重新登入，完成後會自動繼續"
      confirmLabel="重新登入"
      onCancel={() => pending?.cancel()}
      onConfirm={() => pending?.retry()}
    />
  );

  return { withReauth, reauthModal };
};

export default useReauth;
