"use client";

import { useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { Input } from "@heroui/react";
import useAuth from "@/components/auth/useAuth";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import { deleteAccount, submitChange, syncGoogleUserData } from "@/lib/totp/account";
import { Profile } from "@/types/Profile/Profile";
import UsernameSettings from "./_components/UsernameSettings";
import VaultSettings from "./_components/VaultSettings";
import { showError } from "@/lib/errorDialog";

type ProfileForm = Pick<Profile, 'name' | 'phoneNumber' | 'photoURL' | 'bgPhotoURL'>;

const toForm = (profile?: Profile): ProfileForm => ({
  name: profile?.name ?? '',
  phoneNumber: profile?.phoneNumber ?? '',
  photoURL: profile?.photoURL ?? '',
  bgPhotoURL: profile?.bgPhotoURL ?? '',
});

const isUrl = (value: string) => {
  if (!value) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

// 帳戶設定：像 iOS 設定的分組列表，一列一個欄位，右上角「儲存」
const UpdateInfoClient = () => {
  const { user, profile, refresh } = useAuth();
  const router = useRouter();
  // AuthGate 放行時 profile 已載入完成，直接拿來當表單初始值
  const [form, setForm] = useState<ProfileForm>(() => toForm(profile));
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const set = (patch: Partial<ProfileForm>) => setForm({ ...form, ...patch });

  const nameInvalid = !form.name.trim();
  const photoInvalid = !isUrl(form.photoURL);
  const bgInvalid = !isUrl(form.bgPhotoURL);
  const canSave = !saving && !nameInvalid && !photoInvalid && !bgInvalid;

  // 更新用戶資料
  const handleSubmit = async () => {
    if (!user || nameInvalid || photoInvalid || bgInvalid) return;

    setSaving(true);
    const result = await submitChange(user.uid, {
      name: form.name.trim(),
      phoneNumber: form.phoneNumber.trim(),
      photoURL: form.photoURL.trim(),
      bgPhotoURL: form.bgPhotoURL.trim(),
    });
    setSaving(false);

    if (result.success) {
      await refresh();
      toast.success('已儲存', { position: 'top-right' });
    } else {
      showError('修改失敗', result.message);
    }
  };

  // 將 Google 資料同步到用戶資料（只覆蓋名稱、Email、大頭照，背景圖與電話保留）
  const handleSync = async () => {
    if (!user) return;

    setSyncing(true);
    try {
      await syncGoogleUserData(user);
      setForm(toForm(await refresh()));
      toast.success('已同步 Google 資料', { position: 'top-right' });
    } catch (error) {
      showError('同步 Google 資料失敗', (error as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  // 刪除帳號
  const handleDeleteAccount = async () => {
    try {
      await deleteAccount();
      router.push('/');
      toast.success('已刪除帳戶', { position: 'top-right' });
    } catch (error) {
      showError('刪除帳戶失敗', (error as Error).message);
    }
  };

  return (
    <PageContent className="max-w-2xl">
      <PageHeader
        title="帳戶設定"
        right={
          <button
            type="submit"
            form="profile-form"
            className="text-[17px] font-semibold text-accent hover:underline disabled:text-ink-muted disabled:no-underline"
            disabled={!canSave}
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
        }
      />

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
            <div className="px-5 py-4">
              <Input
                variant="flat"
                labelPlacement="outside"
                size="lg"
                label="大頭照網址"
                type="url"
                placeholder="https://"
                value={form.photoURL}
                onValueChange={(photoURL) => set({ photoURL })}
                isInvalid={photoInvalid}
                errorMessage="請輸入 http(s):// 開頭的網址"
              />
            </div>
            <div className="px-5 py-4">
              <Input
                variant="flat"
                labelPlacement="outside"
                size="lg"
                label="背景圖網址"
                type="url"
                placeholder="https://"
                value={form.bgPhotoURL}
                onValueChange={(bgPhotoURL) => set({ bgPhotoURL })}
                isInvalid={bgInvalid}
                errorMessage="請輸入 http(s):// 開頭的網址"
              />
            </div>
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
            同步會用 Google 帳號的名稱與大頭照蓋掉目前的資料，背景圖與電話保留。刪除帳戶會一併永久刪除所有驗證碼金鑰，刪除前請確認已在各服務關閉兩步驟驗證或改用其他驗證器
          </p>
        </section>
      </div>

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
    </PageContent>
  );
};

export default UpdateInfoClient;
