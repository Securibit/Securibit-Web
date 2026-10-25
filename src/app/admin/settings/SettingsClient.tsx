"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Switch, Textarea } from "@heroui/react";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Loading/Spinner";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import useAuth from "@/components/auth/useAuth";
import { isValidVersion, loadSiteSettings, saveAdminChangeNotify, saveMinAppVersion } from "@/lib/notifications/broadcast";
import { MIN_VERSION_MESSAGE_MAX } from "@/lib/notifications/types";
import { SITE, permissionName, SITE_PERMISSIONS } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import { AdminChangeNotify, SiteSettings } from "@/types/Notification/Notification";

const ADMIN_CHANGE_ROWS: { key: keyof AdminChangeNotify; name: string; description: string }[] = [
  { key: "role", name: "變更網站身分組", description: "在後台指派或移除使用者的網站身分組" },
  { key: "username", name: "修改 @ID", description: "在後台修改或清除使用者的 @ID" },
  { key: "codes", name: "修改驗證碼", description: "在後台修改或刪除使用者的驗證碼" },
];

// 後台「通知設定」：後台修改帳號時要不要通知本人、最低 App 版本（強制更新）。
// 有「進入後台」就能看，要「管理使用者」才能修改
const SettingsClient = () => {
  const { can } = useAuth();
  const canEdit = can(SITE.MANAGE_USERS);

  // null：載入中；undefined：載入失敗
  const [settings, setSettings] = useState<SiteSettings | null | undefined>(null);
  const [savingNotify, setSavingNotify] = useState<keyof AdminChangeNotify>();
  const [version, setVersion] = useState("");
  const [message, setMessage] = useState("");
  const [savingVersion, setSavingVersion] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSiteSettings().then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setSettings(undefined);
        showError("載入通知設定失敗", result.message);
        return;
      }
      setSettings(result.data);
      setVersion(result.data.min_app_version?.version ?? "");
      setMessage(result.data.min_app_version?.message ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (settings === null) return <Spinner block label="載入通知設定…" />;
  if (settings === undefined) {
    return (
      <div>
        <PageHeader title="通知設定" />
        <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">讀不到設定，請稍後再試</div>
      </div>
    );
  }

  const toggleNotify = async (key: keyof AdminChangeNotify, on: boolean) => {
    const previous = settings;
    const next = { ...settings.notify_admin_changes, [key]: on };
    setSettings({ ...settings, notify_admin_changes: next });
    setSavingNotify(key);
    const result = await saveAdminChangeNotify(next);
    setSavingNotify(undefined);
    if (!result.success) {
      setSettings(previous);
      showError("儲存失敗", result.message);
    }
  };

  const trimmedVersion = version.trim();
  const trimmedMessage = message.trim();
  const versionInvalid = !!trimmedVersion && !isValidVersion(trimmedVersion);
  const messageInvalid = trimmedMessage.length > MIN_VERSION_MESSAGE_MAX;
  const current = settings.min_app_version;
  const versionChanged = trimmedVersion !== (current?.version ?? "") || trimmedMessage !== (current?.message ?? "");
  const canSaveVersion = canEdit && !savingVersion && !!trimmedVersion && !versionInvalid && !messageInvalid && versionChanged;

  const handleSaveVersion = async () => {
    const value = { version: trimmedVersion, message: trimmedMessage };
    setSavingVersion(true);
    const result = await saveMinAppVersion(value);
    setSavingVersion(false);
    if (!result.success) {
      showError("儲存最低版本失敗", result.message);
      return;
    }
    setSettings({ ...settings, min_app_version: value });
    toast.success("已儲存最低版本", { position: "top-right" });
  };

  const handleClearVersion = async () => {
    const result = await saveMinAppVersion(null);
    setConfirmClear(false);
    if (!result.success) {
      showError("清除最低版本失敗", result.message);
      return;
    }
    setSettings({ ...settings, min_app_version: null });
    setVersion("");
    setMessage("");
    toast.success("已清除最低版本", { position: "top-right" });
  };

  return (
    <div>
      <PageHeader title="通知設定" subtitle="後台修改帳號時的通知，以及 App 強制更新的最低版本" />

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">管理員修改帳號時通知本人</h2>
          <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {ADMIN_CHANGE_ROWS.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-6 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-[17px]">{row.name}</p>
                  <p className="text-[13px] text-ink-muted">{row.description}</p>
                </div>
                <Switch
                  aria-label={row.name}
                  isSelected={settings.notify_admin_changes[row.key]}
                  isDisabled={!canEdit || savingNotify === row.key}
                  onValueChange={(on) => toggleNotify(row.key, on)}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 px-5 text-[13px] text-ink-muted">
            關掉後，管理員在後台做這些修改時不會通知使用者本人。開著的時候，使用者也可以在自己的通知設定關掉
          </p>
        </section>

        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">強制更新的最低 App 版本</h2>
          <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            <div className="flex items-center justify-between gap-6 px-5 py-3">
              <span className="shrink-0 text-[17px]">目前</span>
              <span className="min-w-0 truncate text-right text-[17px] tabular-nums text-ink-muted">{current ? current.version : "未設定"}</span>
            </div>
            <div className="px-5 py-4">
              <Input
                variant="flat"
                labelPlacement="outside"
                size="lg"
                label="最低版本"
                placeholder="1.5.0"
                isReadOnly={!canEdit}
                value={version}
                onValueChange={setVersion}
                isInvalid={versionInvalid}
                errorMessage="版本格式不正確，例如 1.5.0"
                classNames={{ input: "tabular-nums" }}
              />
            </div>
            <div className="px-5 py-4">
              <Textarea
                variant="flat"
                labelPlacement="outside"
                size="lg"
                label="說明文字"
                placeholder="這個版本修正了重要的安全問題，請更新後再使用"
                minRows={2}
                isReadOnly={!canEdit}
                maxLength={MIN_VERSION_MESSAGE_MAX}
                value={message}
                onValueChange={setMessage}
                isInvalid={messageInvalid}
                description={canEdit ? `${trimmedMessage.length} / ${MIN_VERSION_MESSAGE_MAX}` : undefined}
              />
            </div>
          </div>
          <p className="mt-2 px-5 text-[13px] text-ink-muted">
            版本低於這個的 App 打開時會整頁顯示「強制更新」與說明文字，更新前無法使用；App 離線讀不到設定時不會擋。網站不受影響
          </p>
          {canEdit ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button color="primary" radius="full" className="font-semibold" isDisabled={!canSaveVersion} isLoading={savingVersion} onPress={handleSaveVersion}>
                儲存
              </Button>
              {current && (
                <Button variant="flat" radius="full" className="text-alarm" onPress={() => setConfirmClear(true)}>
                  清除最低版本
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-2 px-5 text-[13px] text-ink-muted">需要「{permissionName(SITE_PERMISSIONS, SITE.MANAGE_USERS)}」權限才能修改</p>
          )}
        </section>
      </div>

      <ConfirmModal
        isOpen={confirmClear}
        danger
        title="清除最低版本"
        description="清除後所有版本的 App 都能繼續使用，不會再要求強制更新。"
        confirmLabel="清除"
        onCancel={() => setConfirmClear(false)}
        onConfirm={handleClearVersion}
      />
    </div>
  );
};

export default SettingsClient;
