"use client";

import { createContext, useCallback, useEffect, useState } from "react";
import useAuth from "@/components/auth/useAuth";
import { clearTotp, loadRawTotp, saveVault } from "@/lib/totp/crud";
import { createVault, decryptText, encryptText, isEncrypted, unlockVault, verifyKey } from "@/lib/vault/crypto";
import { deleteDeviceKey, loadDeviceKey, saveDeviceKey } from "@/lib/vault/keyStore";
import { VaultActionResult, VaultContextValue, VaultInfo, VaultStatus } from "@/types/Vault/Vault";
import { VaultProviderProps } from "@/types/Vault/VaultProvider";

export const VaultContext = createContext<VaultContextValue | null>(null);

const WRONG_PASSPHRASE: VaultActionResult = { success: false, message: "密碼錯誤" };

// 解鎖狀態屬於哪個使用者、哪一組加密設定；任一個變了（換帳號、在別的裝置改密碼）就要重新確認
interface KeyState {
  uid: string;
  check: string;
  key: CryptoKey | null;
}

/**
 * 金鑰加密的狀態。掛在 AuthProvider 底下，加密設定來自 profile.vault。
 * 解開的 CryptoKey 只存在記憶體；勾選「在這台裝置記住」才會存進 IndexedDB（無法被讀出內容）。
 */
const VaultProvider = (props: VaultProviderProps) => {
  const { user, profile, refresh } = useAuth();
  const vault = profile?.vault ?? null;
  const uid = user?.uid;
  const [keyState, setKeyState] = useState<KeyState>();

  const current = uid && vault && keyState?.uid === uid && keyState.check === vault.check ? keyState : undefined;
  const status: VaultStatus = !vault ? "off" : !current ? "loading" : current.key ? "unlocked" : "locked";

  // 把還是明文的金鑰補加密（例如別的裝置在啟用加密前新增的）
  const sealPlaintext = useCallback(async (userId: string, info: VaultInfo, key: CryptoKey) => {
    const result = await loadRawTotp(userId);
    if (!result.success) return;
    const plain = result.data.filter((item) => item.id && !isEncrypted(item.secret));
    if (plain.length === 0) return;

    const secrets: Record<string, string> = {};
    for (const item of plain) secrets[item.id] = await encryptText(key, item.secret);
    await saveVault(info, secrets);
  }, []);

  // 有啟用加密時，先看這台裝置有沒有記住金鑰
  useEffect(() => {
    if (!uid || !vault || current) return;
    let cancelled = false;

    loadDeviceKey(uid).then(async (stored) => {
      const key = stored && (await verifyKey(vault, stored)) ? stored : null;
      if (cancelled) return;
      setKeyState({ uid, check: vault.check, key });
      if (key) sealPlaintext(uid, vault, key);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, vault, current, sealPlaintext]);

  // 登出時忘記這台裝置記住的金鑰
  useEffect(() => {
    if (uid || !keyState) return;
    deleteDeviceKey(keyState.uid);
  }, [uid, keyState]);

  const remember = async (userId: string, key: CryptoKey, keep: boolean) => {
    if (keep) await saveDeviceKey(userId, key);
    else await deleteDeviceKey(userId);
  };

  const unlock = useCallback(
    async (passphrase: string, keep: boolean): Promise<VaultActionResult> => {
      if (!uid || !vault) return { success: false, message: "尚未啟用加密" };
      const key = await unlockVault(vault, passphrase);
      if (!key) return WRONG_PASSPHRASE;

      await remember(uid, key, keep);
      setKeyState({ uid, check: vault.check, key });
      sealPlaintext(uid, vault, key);
      return { success: true };
    },
    [uid, vault, sealPlaintext]
  );

  const lock = useCallback(async () => {
    if (!uid || !vault) return;
    await deleteDeviceKey(uid);
    setKeyState({ uid, check: vault.check, key: null });
  }, [uid, vault]);

  // 用新的加密設定重新寫入所有金鑰；decrypt 把目前存的值轉回明文。
  // 呼叫端要先更新 keyState 再 refresh profile，否則新設定進來時會被當成「還沒確認」而先鎖住
  const rewrite = useCallback(
    async (
      next: { info: VaultInfo; key: CryptoKey } | null,
      decrypt: (secret: string) => Promise<string>
    ): Promise<VaultActionResult> => {
      if (!uid) return { success: false, message: "尚未登入" };
      const loaded = await loadRawTotp(uid);
      if (!loaded.success) return loaded;

      const secrets: Record<string, string> = {};
      try {
        for (const item of loaded.data) {
          const plain = await decrypt(item.secret);
          secrets[item.id] = next ? await encryptText(next.key, plain) : plain;
        }
      } catch {
        return { success: false, message: "有金鑰無法解密，可能是在其他裝置用舊密碼新增的。請先刪除顯示「金鑰錯誤」的項目再試一次。" };
      }

      const saved = await saveVault(next?.info ?? null, secrets);
      return saved.success ? { success: true } : saved;
    },
    [uid]
  );

  const enable = useCallback(
    async (passphrase: string, keep: boolean): Promise<VaultActionResult> => {
      if (!uid) return { success: false, message: "尚未登入" };
      const next = await createVault(passphrase);
      // 目前的金鑰都是明文（未啟用加密）
      const result = await rewrite(next, async (secret) => secret);
      if (!result.success) return result;

      await remember(uid, next.key, keep);
      setKeyState({ uid, check: next.info.check, key: next.key });
      await refresh();
      return result;
    },
    [uid, rewrite, refresh]
  );

  const decryptWith = (key: CryptoKey) => async (secret: string) =>
    isEncrypted(secret) ? decryptText(key, secret) : secret;

  const changePassphrase = useCallback(
    async (currentPassphrase: string, nextPassphrase: string): Promise<VaultActionResult> => {
      if (!uid || !vault) return { success: false, message: "尚未啟用加密" };
      const oldKey = await unlockVault(vault, currentPassphrase);
      if (!oldKey) return WRONG_PASSPHRASE;

      const next = await createVault(nextPassphrase);
      const result = await rewrite(next, decryptWith(oldKey));
      if (!result.success) return result;

      // 原本有記住就改記新的金鑰
      const stored = await loadDeviceKey(uid);
      await remember(uid, next.key, !!stored);
      setKeyState({ uid, check: next.info.check, key: next.key });
      await refresh();
      return result;
    },
    [uid, vault, rewrite, refresh]
  );

  const disable = useCallback(
    async (passphrase: string): Promise<VaultActionResult> => {
      if (!uid || !vault) return { success: false, message: "尚未啟用加密" };
      const key = await unlockVault(vault, passphrase);
      if (!key) return WRONG_PASSPHRASE;

      const result = await rewrite(null, decryptWith(key));
      if (!result.success) return result;
      await deleteDeviceKey(uid);
      await refresh();
      return result;
    },
    [uid, vault, rewrite, refresh]
  );

  const reset = useCallback(async (): Promise<VaultActionResult> => {
    if (!uid) return { success: false, message: "尚未登入" };
    const cleared = await clearTotp(uid);
    if (!cleared.success) return cleared;
    const saved = await saveVault(null, {});
    if (!saved.success) return saved;
    await deleteDeviceKey(uid);
    await refresh();
    return { success: true };
  }, [uid, refresh]);

  return (
    <VaultContext.Provider
      value={{
        status,
        key: current?.key ?? undefined,
        unlock,
        lock,
        enable,
        changePassphrase,
        disable,
        reset,
      }}
    >
      {props.children}
    </VaultContext.Provider>
  );
};

export default VaultProvider;
