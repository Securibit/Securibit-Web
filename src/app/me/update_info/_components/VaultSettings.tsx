"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Checkbox, Input } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faLockOpen } from "@fortawesome/free-solid-svg-icons";
import Spinner from "@/components/ui/Loading/Spinner";
import useVault from "@/components/vault/useVault";
import VaultUnlock from "@/components/vault/VaultUnlock";
import { showError } from "@/lib/errorDialog";

const MIN_LENGTH = 8;

type Mode = "idle" | "change" | "disable";

// 管理帳戶頁的「金鑰加密」區塊：啟用、改密碼、停用、立即鎖定
const VaultSettings = () => {
  const vault = useVault();
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

  const resetForm = (next: Mode = "idle") => {
    setMode(next);
    setCurrent("");
    setPassphrase("");
    setConfirm("");
    setUnderstood(false);
  };

  const run = async (
    action: () => Promise<{ success: boolean; message?: string }>,
    successText: string,
    failText: string
  ) => {
    setPending(true);
    const result = await action();
    setPending(false);
    if (result.success) {
      toast.success(successText, { position: "top-right" });
      resetForm();
    } else {
      showError(failText, result.message);
    }
  };

  const newPassphraseFields = (
    <>
      <Input
        label={mode === "change" ? "新密碼" : "加密密碼"}
        type="password"
        autoComplete="new-password"
        value={passphrase}
        onValueChange={setPassphrase}
        isInvalid={tooShort}
        errorMessage={`至少 ${MIN_LENGTH} 個字元`}
        description="不是 Google 帳號密碼，是另外設定、只有你知道的密碼"
      />
      <Input
        label="再輸入一次"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onValueChange={setConfirm}
        isInvalid={mismatch}
        errorMessage="兩次輸入的密碼不一樣"
      />
    </>
  );

  return (
    <div className="mt-6 rounded-lg border border-gray-blue-200 bg-white p-4 shadow sm:p-6 dark:border-gray-blue-700 dark:bg-gray-blue-800">
      <h2 className="flex items-center gap-2 font-semibold">
        <FontAwesomeIcon icon={vault.status === "off" ? faLockOpen : faLock} className="w-4 text-tpp" />
        金鑰加密
      </h2>
      <p className="mt-1 mb-4 text-sm text-gray-blue-500 dark:text-gray-blue-400">
        啟用後，驗證碼的金鑰會先在你的瀏覽器用密碼加密才存到伺服器，資料庫裡只剩密文，連網站管理者也看不到。
        名稱與類別不會加密。每次在新的裝置或登出後都要輸入密碼。
        啟用後，網站管理員也無法查看你的金鑰；分享到群組的驗證碼不會加密。
      </p>

      {vault.status === "loading" && <Spinner label="確認加密狀態…" />}

      {vault.status === "off" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newPassphraseOk || !understood) return;
            run(() => vault.enable(passphrase, remember), "已啟用金鑰加密！", "啟用加密失敗");
          }}
        >
          {newPassphraseFields}
          <Checkbox size="sm" isSelected={remember} onValueChange={setRemember}>
            在這台裝置記住（登出或按「立即鎖定」就會忘記）
          </Checkbox>
          <Checkbox size="sm" color="danger" isSelected={understood} onValueChange={setUnderstood}>
            我了解忘記密碼就無法救回金鑰，只能清空重新綁定
          </Checkbox>
          <Button
            type="submit"
            color="primary"
            className="self-start"
            isLoading={pending}
            isDisabled={!newPassphraseOk || !understood}
          >
            啟用加密
          </Button>
        </form>
      )}

      {vault.status === "locked" && (
        <>
          <p className="mb-3 text-sm">已啟用加密，目前是鎖定狀態。解鎖後才能修改設定。</p>
          <VaultUnlock compact />
        </>
      )}

      {vault.status === "unlocked" && mode === "idle" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">已啟用加密，目前已解鎖。</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="bordered" startContent={<FontAwesomeIcon icon={faLock} className="w-3.5" />} onPress={vault.lock}>
              立即鎖定
            </Button>
            <Button variant="bordered" onPress={() => resetForm("change")}>
              更改密碼
            </Button>
            <Button variant="flat" color="danger" onPress={() => resetForm("disable")}>
              停用加密
            </Button>
          </div>
        </div>
      )}

      {vault.status === "unlocked" && mode !== "idle" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!current) return;
            if (mode === "change") {
              if (!newPassphraseOk) return;
              run(() => vault.changePassphrase(current, passphrase), "已更改加密密碼！", "更改密碼失敗");
            } else {
              run(() => vault.disable(current), "已停用金鑰加密", "停用加密失敗");
            }
          }}
        >
          <Input
            label="目前的密碼"
            type="password"
            autoComplete="current-password"
            value={current}
            onValueChange={setCurrent}
          />
          {mode === "change" && newPassphraseFields}
          {mode === "disable" && (
            <p className="text-sm text-amber-600 dark:text-amber-400">停用後金鑰會改回明文存放在伺服器。</p>
          )}
          <div className="flex gap-2">
            <Button variant="bordered" onPress={() => resetForm()} isDisabled={pending}>
              取消
            </Button>
            <Button
              type="submit"
              color={mode === "disable" ? "danger" : "primary"}
              isLoading={pending}
              isDisabled={!current || (mode === "change" && !newPassphraseOk)}
            >
              {mode === "change" ? "更改密碼" : "停用加密"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};

export default VaultSettings;
