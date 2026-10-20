"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input } from "@heroui/react";
import useAuth from "@/components/auth/useAuth";
import { USERNAME_PATTERN, isUsernameAvailable, setUsername } from "@/lib/totp/account";
import { showError } from "@/lib/errorDialog";

const FORMAT_HINT = "3～32 字，只能用小寫英文、數字、底線、點";
const CHECK_DELAY = 400;

// 去掉開頭的 @、轉小寫（輸入時也會即時處理）
const normalize = (value: string) => value.trim().replace(/^@/, "").toLowerCase();

// 管理帳戶頁的「@ID」區塊：即時檢查格式與可不可以用，可清除
const UsernameSettings = () => {
  const { profile, refresh } = useAuth();
  const current = profile?.username ?? "";
  const [value, setValue] = useState(current);
  // 最後一次查詢的結果（name 對得上目前輸入才算數）；available 為 null 代表查詢失敗
  const [check, setCheck] = useState<{ name: string; available: boolean | null; message?: string }>();
  const [saving, setSaving] = useState(false);

  const name = normalize(value);
  const changed = name !== current;
  const formatOk = USERNAME_PATTERN.test(name);
  // 只有「有改、格式正確」時才需要查資料庫
  const needCheck = changed && name !== "" && formatOk;
  const checked = check?.name === name ? check : undefined;

  useEffect(() => {
    if (!needCheck) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await isUsernameAvailable(name);
      if (cancelled) return;
      setCheck(
        result.success
          ? { name, available: result.data }
          : { name, available: null, message: result.message }
      );
    }, CHECK_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, needCheck]);

  const invalid = (name !== "" && !formatOk) || checked?.available === false || checked?.available === null;
  const errorMessage = !formatOk
    ? FORMAT_HINT
    : checked?.available === false
      ? "已被使用"
      : `無法檢查：${checked?.message ?? ""}`;
  const description = !changed ? (
    current ? "這是你目前的 @ID" : FORMAT_HINT
  ) : name === "" ? (
    "儲存後會清除 @ID"
  ) : checked?.available ? (
    <span className="inline-flex items-center gap-2 text-phos">
      <span className="led" aria-hidden />
      可以使用
    </span>
  ) : (
    "檢查中…"
  );

  // 清除時傳空字串
  const canSave = changed && (name === "" || checked?.available === true);

  const save = async (next: string) => {
    setSaving(true);
    const result = await setUsername(next);
    setSaving(false);

    if (!result.success) {
      showError(next ? "設定 @ID 失敗" : "清除 @ID 失敗", result.message);
      return;
    }
    await refresh();
    setValue(result.data ?? "");
    toast.success(result.data ? `已將 @ID 設為 @${result.data}` : "已清除 @ID", { position: "top-right" });
  };

  return (
    <section className="grid grid-cols-12 gap-6 border-t border-line py-10">
      <div className="col-span-12 md:col-span-5">
        <p className="tech-label">02 // HANDLE</p>
        <h2 className="mt-2 font-display text-xl font-bold text-ink">@ID</h2>
        <p className="mt-2 max-w-xs text-sm text-ink-muted">
          @ID 是別人找到你的名字，例如邀請你加入群組時可以輸入 @ID。
        </p>
        <p className="mt-2 font-mono text-xs text-ink-dim">
          {current ? `目前是 @${current}` : "你還沒有設定 @ID"}
        </p>
      </div>

      <form
        className="col-span-12 flex flex-col gap-4 border border-line bg-surface-1 p-4 sm:p-6 md:col-span-7"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save(name);
        }}
      >
        <Input
          variant="bordered"
          label="@ID"
          placeholder="your.id"
          autoComplete="off"
          spellCheck="false"
          startContent={<span className="font-mono text-ink-dim">@</span>}
          classNames={{ input: 'font-mono' }}
          value={value}
          onValueChange={(next) => setValue(next.replace(/\s/g, "").replace(/^@/, "").toLowerCase())}
          isInvalid={invalid}
          errorMessage={errorMessage}
          description={description}
        />
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button
            type="submit"
            color="primary"
            className="font-display tracking-[0.08em]"
            isLoading={saving}
            isDisabled={!canSave}
          >
            儲存 @ID
          </Button>
          {current && (
            <Button
              variant="bordered"
              color="danger"
              className="font-display tracking-[0.08em]"
              isDisabled={saving}
              onPress={() => save("")}
            >
              清除 @ID
            </Button>
          )}
        </div>
      </form>
    </section>
  );
};

export default UsernameSettings;
