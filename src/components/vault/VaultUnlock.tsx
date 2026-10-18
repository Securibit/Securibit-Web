"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Checkbox, Input } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import { showError } from "@/lib/errorDialog";
import { VaultUnlockProps } from "@/types/Vault/VaultUnlock";
import useVault from "./useVault";

// 輸入加密密碼解鎖；忘記密碼只能清空重來
const VaultUnlock = (props: VaultUnlockProps) => {
  const { unlock, reset } = useVault();
  const [passphrase, setPassphrase] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleUnlock = async () => {
    if (!passphrase) return;
    setPending(true);
    const result = await unlock(passphrase, remember);
    setPending(false);
    if (!result.success) setError(result.message);
  };

  const handleReset = async () => {
    const result = await reset();
    if (result.success) {
      toast.success("已清空驗證碼並停用加密", { position: "top-right" });
    } else {
      showError("重設失敗", result.message);
    }
  };

  return (
    <div className={props.compact ? "" : "mx-auto max-w-md py-10"}>
      {!props.compact && (
        <div className="mb-6 text-center">
          <FontAwesomeIcon icon={faLock} className="mb-3 w-8 h-8 text-tpp" />
          <h1 className="text-xl font-bold text-gray-blue-900 dark:text-white">驗證碼已加密</h1>
          <p className="mt-1 text-sm text-gray-blue-500 dark:text-gray-blue-400">輸入你設定的加密密碼來解鎖。</p>
        </div>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          handleUnlock();
        }}
      >
        <Input
          label="加密密碼"
          type="password"
          autoComplete="current-password"
          autoFocus={!props.compact}
          value={passphrase}
          onValueChange={(value) => {
            setPassphrase(value);
            setError(undefined);
          }}
          isInvalid={!!error}
          errorMessage={error}
        />
        <Checkbox size="sm" isSelected={remember} onValueChange={setRemember}>
          在這台裝置記住（登出或按「立即鎖定」就會忘記）
        </Checkbox>
        <Button type="submit" color="primary" isLoading={pending} isDisabled={!passphrase}>
          {pending ? "解鎖中…" : "解鎖"}
        </Button>
        <button
          type="button"
          className="text-sm text-gray-blue-500 underline underline-offset-4 hover:text-red-500"
          onClick={() => setConfirmReset(true)}
        >
          忘記密碼？
        </button>
      </form>

      <ConfirmModal
        isOpen={confirmReset}
        danger
        title="忘記加密密碼"
        description="密碼沒有辦法找回，也沒有人能幫你解開。只能清空所有驗證碼並停用加密，之後要到各服務重新綁定兩步驟驗證。確定要清空嗎？"
        confirmLabel="清空並停用加密"
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          await handleReset();
        }}
      />
    </div>
  );
};

export default VaultUnlock;
