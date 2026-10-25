"use client";

import { useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { Input, Tab, Tabs } from "@heroui/react";
import useAuth from "@/components/auth/useAuth";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import useReauth from "@/components/auth/useReauth";
import { deleteAccount, REAUTH_CANCELLED, submitChange, syncGoogleUserData } from "@/lib/totp/account";
import { Profile } from "@/types/Profile/Profile";
import UsernameSettings from "./_components/UsernameSettings";
import VaultSettings from "./_components/VaultSettings";
import PhotoSettings from "./_components/PhotoSettings";
import NotificationSettings from "./_components/NotificationSettings";
import { showError } from "@/lib/errorDialog";
import { SettingsTab, UpdateInfoClientProps } from "@/types/Profile/UpdateInfoClient";

// 大頭照與背景圖在 PhotoSettings 直接上傳，不經過「儲存」
type ProfileForm = Pick<Profile, 'name' | 'phoneNumber'>;

const toForm = (profile?: Profile): ProfileForm => ({
  name: profile?.name ?? '',
  phoneNumber: profile?.phoneNumber ?? '',
});

// 帳戶設定：像 iOS 設定的分組列表，一列一個欄位，右上角「儲存」；「通知」分頁的開關改了就存
const UpdateInfoClient = (props: UpdateInfoClientProps) => {
  const { user, profile, refresh } = useAuth();
  const [tab, setTab] = useState<SettingsTab>(props.initialTab);
  // 已經在這頁時點了帶 ?tab= 的連結（例如通知面板的「通知設定」），跟著切換
  const [lastInitialTab, setLastInitialTab] = useState(props.initialTab);
  if (lastInitialTab !== props.initialTab) {
    setLastInitialTab(props.initialTab);
    setTab(props.initialTab);
  }
  const router = useRouter();
  // AuthGate 放行時 profile 已載入完成，直接拿來當表單初始值
  const [form, setForm] = useState<ProfileForm>(() => toForm(profile));
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { withReauth, reauthModal } = useReauth();

  const set = (patch: Partial<ProfileForm>) => setForm({ ...form, ...patch });

  const nameInvalid = !form.name.trim();
  const canSave = !saving && !nameInvalid;

  // 更新用戶資料
  const handleSubmit = async () => {
    if (!user || nameInvalid) return;

    setSaving(true);
    const result = await submitChange(user.uid, {
      name: form.name.trim(),
      phoneNumber: form.phoneNumber.trim(),
    });
    setSaving(false);

    if (result.success) {
      await refresh();
      toast.success('已儲存', { position: 'top-right' });
    } else {
      showError('修改失敗', result.message);
    }
  };

  // 將 Google 資料同步到用戶資料（覆蓋名稱；自己上傳過大頭照時保留，背景圖與電話保留）
  const handleSync = async () => {
    if (!user) return;

    setSyncing(true);
    try {
      await syncGoogleUserData(user, profile?.photoCustom ?? false);
      setForm(toForm(await refresh()));
      toast.success('已同步 Google 資料', { position: 'top-right' });
    } catch (error) {
      showError('同步 Google 資料失敗', (error as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  // 刪除帳號（太久沒登入時先重新登入再刪）
  const handleDeleteAccount = async () => {
    const result = await withReauth(deleteAccount);
    if (!result.success) {
      if (result.code !== REAUTH_CANCELLED) showError('刪除帳戶失敗', result.message);
      return;
    }
    router.push('/');
    toast.success('已刪除帳戶', { position: 'top-right' });
  };

  return (
    <PageContent className="max-w-2xl">
      <PageHeader
        title="帳戶設定"
        right={
          tab === 'account' && (
            <button
              type="submit"
              form="profile-form"
              className="text-[17px] font-semibold text-accent hover:underline disabled:text-ink-muted disabled:no-underline"
              disabled={!canSave}
            >
              {saving ? '儲存中…' : '儲存'}
            </button>
          )
        }
      />

      <Tabs
        aria-label="帳戶設定分頁"
        variant="light"
        radius="full"
        fullWidth
        selectedKey={tab}
        onSelectionChange={(key) => setTab(key as SettingsTab)}
        classNames={{
          base: "mb-6",
          tabList: "gap-1 rounded-full bg-surface-1 p-1",
          tab: "h-9",
          tabContent: "text-[15px] font-medium text-ink-muted group-data-[selected=true]:text-ink",
          cursor: "bg-surface shadow-none",
          panel: "hidden",
        }}
      >
        <Tab key="account" title="帳戶" />
        <Tab key="notifications" title="通知" />
      </Tabs>

      {tab === 'notifications' ? (
        <NotificationSettings />
      ) : (
        <div className="flex flex-col gap-8">
          {/* 個人資料 */}
          <section>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">個人資料</h2>
            <form
              id="profile-form"
              className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <div className="flex items-center justify-between gap-6 px-5 py-3">
                <span className="shrink-0 text-[17px]">電子郵件</span>
                <span className="min-w-0 truncate text-right text-[17px] text-ink-muted">{profile?.email || '無'}</span>
              </div>
              <div className="px-5 py-4">
                <Input
                  variant="flat"
                  labelPlacement="outside"
                  size="lg"
                  label="名稱"
                  isRequired
                  value={form.name}
                  onValueChange={(name) => set({ name })}
                  isInvalid={nameInvalid}
                  errorMessage="請輸入名稱"
                />
              </div>
              <PhotoSettings />
              <div className="px-5 py-4">
                <Input
                  variant="flat"
                  labelPlacement="outside"
                  size="lg"
                  label="電話"
                  type="tel"
                  placeholder="0912-345-678"
                  value={form.phoneNumber}
                  onValueChange={(phoneNumber) => set({ phoneNumber })}
                  classNames={{ input: 'tabular-nums' }}
                />
              </div>
            </form>
            <p className="mt-2 px-5 text-[13px] text-ink-muted">
              名稱與大頭照會顯示在導覽列、個人頁面與群組成員列表。電子郵件來自 Google 帳號，無法修改
            </p>
          </section>

          <UsernameSettings />

          <VaultSettings />

          {/* 同步與刪除 */}
          <section>
            <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
              <button
                type="button"
                className="w-full py-3 text-center text-[17px] text-accent hover:bg-surface-1 disabled:text-ink-muted"
                disabled={syncing}
                onClick={handleSync}
              >
                {syncing ? '同步中…' : '同步 Google 資料'}
              </button>
              <button
                type="button"
                className="w-full py-3 text-center text-[17px] text-alarm hover:bg-surface-1"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                刪除帳戶
              </button>
            </div>
            <p className="mt-2 px-5 text-[13px] text-ink-muted">
              同步會用 Google 帳號的名稱蓋掉目前的名稱；大頭照只有沒自己上傳過時才會換成 Google 的，背景圖與電話保留。刪除帳戶會一併永久刪除所有驗證碼金鑰，刪除前請確認已在各服務關閉兩步驟驗證或改用其他驗證器
            </p>
          </section>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteOpen}
        danger
        title="刪除帳戶"
        description="確定要刪除帳戶嗎？帳戶與所有驗證碼金鑰都會永久刪除，無法恢復。"
        confirmLabel="刪除帳戶"
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          setConfirmDeleteOpen(false);
          await handleDeleteAccount();
        }}
      />
      {reauthModal}
    </PageContent>
  );
};

export default UpdateInfoClient;
