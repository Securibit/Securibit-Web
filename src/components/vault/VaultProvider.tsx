"use client";

import { createContext, useCallback, useEffect, useState } from "react";
import useAuth from "@/components/auth/useAuth";
import { putVaultEscrow, resetVault, saveVault, vaultEscrowNeeded } from "@/lib/totp/crud";
import { loadGroupAccountSecrets, loadMyGroups, setGroupEncrypted } from "@/lib/groups/groups";
import {
  createVault,
  decryptText,
  encryptText,
  isEncrypted,
  isValidVault,
  unlockVault,
  VAULT_INVALID_MESSAGE,
  verifyKey,
} from "@/lib/vault/crypto";
import { escrowEnvelope } from "@/lib/vault/escrow";
import { deleteDeviceKey, loadDeviceKey, saveDeviceKey } from "@/lib/vault/keyStore";
import { VaultActionResult, VaultContextValue, VaultInfo, VaultStatus } from "@/types/Vault/Vault";
import { VaultProviderProps } from "@/types/Vault/VaultProvider";

export const VaultContext = createContext<VaultContextValue | null>(null);

const WRONG_PASSPHRASE: VaultActionResult = { success: false, message: "密碼錯誤" };
// 加密設定的版本或次數不合法（可能被竄改）：不拿來算金鑰
const INVALID_VAULT: VaultActionResult = { success: false, message: VAULT_INVALID_MESSAGE };

// 新密碼的託管密文；算不出來（瀏覽器不支援）時不帶，下次解鎖會再補
const makeEscrow = async (uid: string, passphrase: string) => {
  try {
    return await escrowEnvelope(uid, passphrase);
  } catch (error) {
    console.error("建立託管密文失敗:", error);
    return null;
  }
};

// 解鎖成功後：這組密碼還沒有託管密文（舊版設定的）就補存一份；失敗只記 log，不影響解鎖
const backfillEscrow = async (uid: string, passphrase: string) => {
  try {
    if (!(await vaultEscrowNeeded())) return;
    const escrow = await escrowEnvelope(uid, passphrase);
    if (!(await putVaultEscrow(escrow))) console.error("補存託管密文失敗");
  } catch (error) {
    console.error("補存託管密文失敗:", error);
  }
};

// 解鎖狀態屬於哪個使用者、哪一組加密設定；任一個變了（換帳號、在別的裝置改密碼）就要重新確認
interface KeyState {
  uid: string;
  check: string;
  key: CryptoKey | null;
}

// 我擁有且已加密的群組裡全部驗證碼的金鑰（資料庫裡的原始值：enc:v1 密文）
const loadEncryptedSecrets = async (): Promise<{ success: true; data: Record<string, string> } | { success: false; message: string }> => {
  const groups = await loadMyGroups();
  if (!groups.success) return groups;
  const data: Record<string, string> = {};
  for (const group of groups.data.filter((g) => g.is_owner && g.encrypted)) {
    const loaded = await loadGroupAccountSecrets(group.id);
    if (!loaded.success) return loaded;
    Object.assign(data, loaded.data);
  }
  return { success: true, data };
};

// 開啟 / 關閉一個群組的加密：把群組裡的金鑰用 key 加密（或解密）後整批寫回
const rewriteGroup = async (gid: string, encrypted: boolean, key: CryptoKey, check: string): Promise<VaultActionResult> => {
  const loaded = await loadGroupAccountSecrets(gid);
  if (!loaded.success) return loaded;
  const secrets: Record<string, string> = {};
  try {
    for (const [id, secret] of Object.entries(loaded.data)) {
      if (encrypted) secrets[id] = isEncrypted(secret) ? secret : await encryptText(key, secret);
      else secrets[id] = isEncrypted(secret) ? await decryptText(key, secret) : secret;
    }
  } catch {
    return { success: false, message: "有金鑰無法解密，可能是在其他裝置用舊密碼新增的。請先刪除顯示「金鑰錯誤」的項目再試一次。" };
  }
  const saved = await setGroupEncrypted(gid, encrypted, secrets, check);
  return saved.success ? { success: true } : saved;
};

/**
 * 金鑰加密的狀態。掛在 AuthProvider 底下，加密設定來自 profile.vault。
 * 0011 起加密套用在群組上：只有「我擁有且已開啟加密」的群組，金鑰會用這組密碼加密。
 * 解開的 CryptoKey 只存在記憶體；勾選「在這台裝置記住」才會存進 IndexedDB（無法被讀出內容）。
 */
const VaultProvider = (props: VaultProviderProps) => {
  const { user, profile, refresh } = useAuth();
  const vault = profile?.vault ?? null;
  const uid = user?.uid;
  const [keyState, setKeyState] = useState<KeyState>();

  const current = uid && vault && keyState?.uid === uid && keyState.check === vault.check ? keyState : undefined;
  const status: VaultStatus = !vault ? "off" : !current ? "loading" : current.key ? "unlocked" : "locked";

  // 有啟用加密時，先看這台裝置有沒有記住金鑰
  useEffect(() => {
    if (!uid || !vault || current) return;
    let cancelled = false;

    loadDeviceKey(uid).then(async (stored) => {
      const key = stored && (await verifyKey(vault, stored)) ? stored : null;
      if (cancelled) return;
      setKeyState({ uid, check: vault.check, key });
    });
    return () => {
      cancelled = true;
    };
  }, [uid, vault, current]);

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
      if (!isValidVault(vault)) return INVALID_VAULT;
      const key = await unlockVault(vault, passphrase);
      if (!key) return WRONG_PASSPHRASE;

      await remember(uid, key, keep);
      setKeyState({ uid, check: vault.check, key });
      void backfillEscrow(uid, passphrase);
      return { success: true };
    },
    [uid, vault]
  );

  const lock = useCallback(async () => {
    if (!uid || !vault) return;
    await deleteDeviceKey(uid);
    setKeyState({ uid, check: vault.check, key: null });
  }, [uid, vault]);

  // 用新的加密設定重新寫入「我擁有且已加密的群組」的所有金鑰；decrypt 把目前存的值轉回明文、next 為 null 代表停用。
  // 送出時附上目前的 vault.check，別的裝置先改過密碼或新增了驗證碼，資料庫會拒絕（請使用者重新整理）。
  // 呼叫端要先更新 keyState 再 refresh profile，否則新設定進來時會被當成「還沒確認」而先鎖住
  const rewrite = useCallback(
    async (
      next: { info: VaultInfo; key: CryptoKey; escrow: string | null } | null,
      decrypt: (secret: string) => Promise<string>
    ): Promise<VaultActionResult> => {
      if (!uid) return { success: false, message: "尚未登入" };
      const loaded = await loadEncryptedSecrets();
      if (!loaded.success) return loaded;

      const secrets: Record<string, string> = {};
      try {
        for (const [id, secret] of Object.entries(loaded.data)) {
          const plain = await decrypt(secret);
          secrets[id] = next ? await encryptText(next.key, plain) : plain;
        }
      } catch {
        return { success: false, message: "有金鑰無法解密，可能是在其他裝置用舊密碼新增的。請先刪除顯示「金鑰錯誤」的項目再試一次。" };
      }

      const saved = await saveVault(next?.info ?? null, secrets, vault?.check ?? null, next?.escrow ?? null);
      return saved.success ? { success: true } : saved;
    },
    [uid, vault]
  );

  // 設定加密密碼；預設群組只有自己一個成員時順便開啟它的加密
  const enable = useCallback(
    async (passphrase: string, keep: boolean): Promise<VaultActionResult> => {
      if (!uid) return { success: false, message: "尚未登入" };
      const next = await createVault(passphrase);
      // 還沒有加密的群組，只需要存加密設定（連同新密碼的託管密文）
      const saved = await saveVault(next.info, {}, vault?.check ?? null, await makeEscrow(uid, passphrase));
      if (!saved.success) return saved;

      await remember(uid, next.key, keep);
      setKeyState({ uid, check: next.info.check, key: next.key });

      let note: string | undefined;
      const groups = await loadMyGroups();
      const home = groups.success ? groups.data.find((group) => group.is_default && group.is_owner) : undefined;
      if (home && !home.encrypted) {
        if (home.member_count > 1) {
          note = `「${home.name}」還有其他成員，沒有加密；移除成員後可以在群組設定開啟`;
        } else {
          const encrypted = await rewriteGroup(home.id, true, next.key, next.info.check);
          note = encrypted.success ? `已加密「${home.name}」` : `加密「${home.name}」失敗：${encrypted.message}`;
        }
      }
      await refresh();
      return { success: true, note };
    },
    [uid, vault, refresh]
  );

  const decryptWith = (key: CryptoKey) => async (secret: string) =>
    isEncrypted(secret) ? decryptText(key, secret) : secret;

  const changePassphrase = useCallback(
    async (currentPassphrase: string, nextPassphrase: string): Promise<VaultActionResult> => {
      if (!uid || !vault) return { success: false, message: "尚未啟用加密" };
      if (!isValidVault(vault)) return INVALID_VAULT;
      const oldKey = await unlockVault(vault, currentPassphrase);
      if (!oldKey) return WRONG_PASSPHRASE;

      const next = { ...(await createVault(nextPassphrase)), escrow: await makeEscrow(uid, nextPassphrase) };
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
      if (!isValidVault(vault)) return INVALID_VAULT;
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
    const cleared = await resetVault();
    if (!cleared.success) return cleared;
    await deleteDeviceKey(uid);
    await refresh();
    return { success: true };
  }, [uid, refresh]);

  // 在群組設定切換加密：要先設定密碼並解鎖
  const setGroupEncryption = useCallback(
    async (gid: string, encrypted: boolean): Promise<VaultActionResult> => {
      if (!vault) return { success: false, message: "請先到「帳戶設定」設定加密密碼" };
      if (!current?.key) return { success: false, message: "請先輸入加密密碼解鎖" };
      return rewriteGroup(gid, encrypted, current.key, vault.check);
    },
    [vault, current]
  );

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
        setGroupEncryption,
      }}
    >
      {props.children}
    </VaultContext.Provider>
  );
};

export default VaultProvider;
