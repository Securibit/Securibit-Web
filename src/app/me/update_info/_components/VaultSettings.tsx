"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Checkbox, Input } from "@heroui/react";
import Spinner from "@/components/ui/Loading/Spinner";
import useVault from "@/components/vault/useVault";
import VaultUnlock from "@/components/vault/VaultUnlock";
import { showError } from "@/lib/errorDialog";
import { loadMyGroups } from "@/lib/groups/groups";
import { VaultActionResult, VaultStatus } from "@/types/Vault/Vault";

const MIN_LENGTH = 8;

type Mode = "idle" | "change" | "disable";

// 「加密」那一列右邊的狀態文字
const STATUS_TEXT: Record<VaultStatus, string> = {
  loading: "檢查中…",
  off: "未設定",
  locked: "已設定，鎖定中",
  unlocked: "已設定，已解鎖",
};

// 列裡的文字按鈕：藍字是動作、紅字是停用，停用時變灰
const actionClass = "w-full py-3 text-center text-[17px] text-accent hover:bg-surface-1 disabled:text-ink-muted disabled:hover:bg-transparent";
const dangerClass = "w-full py-3 text-center text-[17px] text-alarm hover:bg-surface-1 disabled:text-ink-muted disabled:hover:bg-transparent";
const cancelClass = "w-full py-3 text-center text-[17px] text-ink-muted hover:bg-surface-1";

// 帳戶設定頁的「金鑰加密」：設定加密密碼、改密碼、停用、立即鎖定。
// 加密套用在「我擁有且已開啟加密」的群組；個別群組在群組設定的「加密」開關切換
const VaultSettings = () => {
  const vault = useVault();
  // 我擁有且已加密的群組名稱（undefined 代表載入中）
  const [encryptedGroups, setEncryptedGroups] = useState<string[]>();
  const [mode, setMode] = useState<Mode>("idle");
  const [current, setCurrent] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [pending, setPending] = useState(false);

  const tooShort = passphrase.length > 0 && passphrase.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== passphrase;
  const newPassphraseOk = passphrase.length >= MIN_LENGTH && confirm === passphrase;

  // 加密狀態變了（啟用、停用、改密碼）就重新讀取
  useEffect(() => {
    let cancelled = false;
    loadMyGroups().then((result) => {
      if (cancelled) return;
      setEncryptedGroups(result.success ? result.data.filter((g) => g.is_owner && g.encrypted).map((g) => g.name) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [vault.status]);

  const resetForm = (next: Mode = "idle") => {
    setMode(next);
    setCurrent("");
    setPassphrase("");
    setConfirm("");
    setUnderstood(false);
  };

  const run = async (action: () => Promise<VaultActionResult>, successText: string, failText: string) => {
    setPending(true);
    const result = await action();
    setPending(false);
    if (result.success) {
      toast.success(result.note ? `${successText}，${result.note}` : successText, { position: "top-right" });
      resetForm();
      // 群組的加密狀態可能變了
      const groups = await loadMyGroups();
      if (groups.success) setEncryptedGroups(groups.data.filter((g) => g.is_owner && g.encrypted).map((g) => g.name));
    } else {
      showError(failText, result.message);
    }
  };

  const newPassphraseFields = (
    <>
      <div className="px-5 py-4">
        <Input
          variant="flat"
          labelPlacement="outside"
          size="lg"
          label={mode === "change" ? "新密碼" : "加密密碼"}
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onValueChange={setPassphrase}
          isInvalid={tooShort}
          errorMessage={`至少 ${MIN_LENGTH} 個字元`}
          description="不是 Google 帳號密碼，是另外設定、只有你知道的密碼"
        />
      </div>
      <div className="px-5 py-4">
        <Input
          variant="flat"
          labelPlacement="outside"
          size="lg"
          label="再輸入一次"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onValueChange={setConfirm}
          isInvalid={mismatch}
          errorMessage="兩次輸入的密碼不一樣"
        />
      </div>
    </>
  );

  return (
    <section>
      <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">金鑰加密</h2>
      <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
        {/* 狀態列 */}
        <div className="flex items-center justify-between gap-6 px-5 py-3">
          <span className="text-[17px]">加密密碼</span>
          <span className="text-[17px] text-ink-muted">{STATUS_TEXT[vault.status]}</span>
        </div>
        {vault.status !== "off" && (
          <div className="flex items-center justify-between gap-6 px-5 py-3">
            <span className="shrink-0 text-[17px]">已加密的群組</span>
            <span className="min-w-0 truncate text-[17px] text-ink-muted">
              {encryptedGroups === undefined ? "…" : encryptedGroups.length > 0 ? encryptedGroups.join("、") : "沒有"}
            </span>
          </div>
        )}

        {vault.status === "loading" && (
          <div className="flex justify-center px-5 py-4">
            <Spinner />
          </div>
        )}

        {vault.status === "off" && (
          <form
            className="divide-y divide-line/60"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newPassphraseOk || !understood) return;
              run(() => vault.enable(passphrase, remember), "已設定加密密碼", "設定加密密碼失敗");
            }}
          >
            {newPassphraseFields}
            <div className="flex flex-col gap-3 px-5 py-4">
              <Checkbox size="sm" isSelected={remember} onValueChange={setRemember} classNames={{ label: "text-[15px]" }}>
                在這台裝置記住（登出或按「立即鎖定」就會忘記）
              </Checkbox>
              <Checkbox size="sm" color="danger" isSelected={understood} onValueChange={setUnderstood} classNames={{ label: "text-[15px]" }}>
                我了解忘記密碼就無法救回金鑰，只能清空重新綁定
              </Checkbox>
            </div>
            <button type="submit" className={actionClass} disabled={pending || !newPassphraseOk || !understood}>
              {pending ? "設定中…" : "設定密碼並啟用加密"}
            </button>
          </form>
        )}

        {vault.status === "locked" && (
          <div className="px-5 py-4">
            <p className="mb-3 text-[15px] text-ink-muted">目前是鎖定狀態，解鎖後才能修改設定</p>
            <VaultUnlock compact />
          </div>
        )}

        {vault.status === "unlocked" && mode === "idle" && (
          <>
            <button type="button" className={actionClass} onClick={vault.lock}>
              立即鎖定
            </button>
            <button type="button" className={actionClass} onClick={() => resetForm("change")}>
              更改密碼
            </button>
            <button type="button" className={dangerClass} onClick={() => resetForm("disable")}>
              停用加密
            </button>
          </>
        )}

        {vault.status === "unlocked" && mode !== "idle" && (
          <form
            className="divide-y divide-line/60"
            onSubmit={(e) => {
              e.preventDefault();
              if (!current) return;
              if (mode === "change") {
                if (!newPassphraseOk) return;
                run(() => vault.changePassphrase(current, passphrase), "已更改加密密碼", "更改密碼失敗");
              } else {
                run(() => vault.disable(current), "已停用金鑰加密", "停用加密失敗");
              }
            }}
          >
            <div className="px-5 py-4">
              <Input
                variant="flat"
                labelPlacement="outside"
                size="lg"
                label="目前的密碼"
                type="password"
                autoComplete="current-password"
                value={current}
                onValueChange={setCurrent}
                description={mode === "disable" ? "停用後所有加密群組的金鑰會改回明文存放在伺服器，群組也會改成沒加密" : undefined}
              />
            </div>
            {mode === "change" && newPassphraseFields}
            <button
              type="submit"
              className={mode === "disable" ? dangerClass : actionClass}
              disabled={pending || !current || (mode === "change" && !newPassphraseOk)}
            >
              {pending ? "處理中…" : mode === "change" ? "更改密碼" : "停用加密"}
            </button>
            <button type="button" className={cancelClass} onClick={() => resetForm()} disabled={pending}>
              取消
            </button>
          </form>
        )}
      </div>
      <p className="mt-2 px-5 text-[13px] text-ink-muted">
        加密套用在你擁有、已開啟加密的群組：金鑰會先在你的瀏覽器用這組密碼加密才存到伺服器，資料庫裡只剩密文，網站管理員也看不到。
        設定密碼時會順便加密你的預設群組（只有你一個成員時），其他群組到群組設定的「加密」開關切換；加密的群組只能有你一個成員，不能邀請其他人。
        名稱與類別不會加密。每次在新的裝置或登出後都要輸入密碼
      </p>
    </section>
  );
};

export default VaultSettings;
