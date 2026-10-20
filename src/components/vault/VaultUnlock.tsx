"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Checkbox, Input } from "@heroui/react";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import { showError } from "@/lib/errorDialog";
import { cn } from "@/lib/utils";
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
    <div className={cn(!props.compact && "boot mx-auto max-w-md py-10")}>
      {!props.compact && (
        <div className="mb-6">
          <p className="tech-label flex items-center gap-2">
            <span className={cn("led", error ? "led-alarm" : "led-off")} aria-hidden />
            LOCKED // VAULT
          </p>
          <h1 className="mt-3 font-display text-2xl font-bold text-ink sm:text-3xl">驗證碼已加密</h1>
          <p className="mt-2 text-sm text-ink-muted">輸入你設定的加密密碼來解鎖。</p>
          <div className="rule-accent mt-4" />
        </div>
      )}
      <form
        className={cn("flex flex-col gap-3", !props.compact && "panel p-5")}
        onSubmit={(e) => {
          e.preventDefault();
          handleUnlock();
        }}
      >
        <Input
          label="加密密碼"
          type="password"
          variant="bordered"
          autoComplete="current-password"
          autoFocus={!props.compact}
          value={passphrase}
          onValueChange={(value) => {
            setPassphrase(value);
            setError(undefined);
          }}
          isInvalid={!!error}
          errorMessage={error}
          classNames={{ input: "font-mono tracking-[0.08em]" }}
        />
        <Checkbox size="sm" isSelected={remember} onValueChange={setRemember} classNames={{ label: "text-sm text-ink-muted" }}>
          在這台裝置記住（登出或按「立即鎖定」就會忘記）
        </Checkbox>
        <Button type="submit" color="primary" className="font-display tracking-[0.08em]" isLoading={pending} isDisabled={!passphrase}>
          {pending ? "解鎖中…" : "解鎖"}
        </Button>
        <button
          type="button"
          className="self-start text-sm text-ink-muted underline underline-offset-4 transition-colors hover:text-alarm"
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
