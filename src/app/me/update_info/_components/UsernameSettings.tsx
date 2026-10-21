"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Input } from "@heroui/react";
import useAuth from "@/components/auth/useAuth";
import { isUsernameAvailable, setUsername, usernameProblem } from "@/lib/totp/account";
import { showError } from "@/lib/errorDialog";

const FORMAT_HINT = "3～32 字，只能用小寫英文、數字、底線、點";
const CHECK_DELAY = 400;

// 去掉開頭的 @、轉小寫（輸入時也會即時處理）
const normalize = (value: string) => value.trim().replace(/^@/, "").toLowerCase();

// 帳戶設定頁的「@ID」群組：即時檢查格式與可不可以用，可清除
const UsernameSettings = () => {
  const { profile, refresh } = useAuth();
  const current = profile?.username ?? "";
  const [value, setValue] = useState(current);
  // 最後一次查詢的結果（name 對得上目前輸入才算數）；available 為 null 代表查詢失敗
  const [check, setCheck] = useState<{ name: string; available: boolean | null; message?: string }>();
  const [saving, setSaving] = useState(false);

  const name = normalize(value);
  const changed = name !== current;
  // 格式、UUID 樣式、保留字（不用查資料庫）；沒改的不檢查（舊的 @ID 可能是後來才變成保留字）
  const problem = changed && name !== "" ? usernameProblem(name) : undefined;
  // 只有「有改、本地檢查通過」時才需要查資料庫
  const needCheck = changed && name !== "" && !problem;
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

  const invalid = !!problem || checked?.available === false || checked?.available === null;
  const errorMessage = problem
    ? problem
    : checked?.available === false
      ? "這個 @ID 已被使用"
      : `無法檢查：${checked?.message ?? ""}`;
  // 欄位下方的即時檢查文字
  const description = !changed
    ? (current ? "這是你目前的 @ID" : FORMAT_HINT)
    : name === ""
      ? "儲存後會清除 @ID"
      : checked?.available
        ? "可以使用"
        : "檢查中…";

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
    <section>
      <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">@ID</h2>
      <form
        className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save(name);
        }}
      >
        <div className="px-5 py-4">
          <Input
            variant="flat"
            labelPlacement="outside"
            size="lg"
            label="@ID"
            placeholder="your.id"
            autoComplete="off"
            spellCheck="false"
            startContent={<span className="text-ink-muted">@</span>}
            value={value}
            onValueChange={(next) => setValue(next.replace(/\s/g, "").replace(/^@/, "").toLowerCase())}
            isInvalid={invalid}
            errorMessage={errorMessage}
            description={description}
          />
        </div>
        <button
          type="submit"
          className="w-full py-3 text-center text-[17px] text-accent hover:bg-surface-1 disabled:text-ink-muted disabled:hover:bg-transparent"
          disabled={!canSave || saving}
        >
          {saving ? "儲存中…" : "儲存 @ID"}
        </button>
        {current && (
          <button
            type="button"
            className="w-full py-3 text-center text-[17px] text-alarm hover:bg-surface-1 disabled:text-ink-muted"
            disabled={saving}
            onClick={() => save("")}
          >
            清除 @ID
          </button>
        )}
      </form>
      <p className="mt-2 px-5 text-[13px] text-ink-muted">
        @ID 是別人找到你的名字，例如邀請你加入群組時可以輸入 @ID
      </p>
    </section>
  );
};

export default UsernameSettings;
