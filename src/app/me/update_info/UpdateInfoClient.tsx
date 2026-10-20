"use client";

import { useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { Button, Input } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faRotate, faTrashCan } from "@fortawesome/free-solid-svg-icons";
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

// 管理帳戶：每個區塊左邊 5 欄說明、右邊 7 欄表單，手機堆疊
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
      toast.success('修改成功！', { position: 'top-right' });
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
      toast.success('同步 Google 資料成功！', { position: 'top-right' });
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
      toast.success('刪除帳號成功！', { position: 'top-right' });
    } catch (error) {
      showError('刪除帳號失敗', (error as Error).message);
    }
  };

  return (
    <PageContent className="max-w-4xl">
      <PageHeader
        index="00 // ACCOUNT"
        title="管理帳戶"
        subtitle="修改顯示在個人頁面的資料"
        right={
          <Button
            variant="bordered"
            className="font-display tracking-[0.08em]"
            startContent={<FontAwesomeIcon icon={faArrowLeft} className="w-3.5" />}
            onPress={() => router.push('/me/MyPage')}
          >
            回到個人頁面
          </Button>
        }
      />

      <div className="boot">
        {/* 01 基本資料 */}
        <section className="grid grid-cols-12 gap-6 pb-10">
          <div className="col-span-12 md:col-span-5">
            <p className="tech-label">01 // PROFILE</p>
            <h2 className="mt-2 font-display text-xl font-bold text-ink">基本資料</h2>
            <p className="mt-2 max-w-xs text-sm text-ink-muted">
              名稱與大頭照會顯示在導覽列、個人頁面與群組成員列表。Email 來自 Google 帳號，無法修改。
            </p>
          </div>

          <form
            className="col-span-12 flex flex-col gap-4 border border-line bg-surface-1 p-4 sm:p-6 md:col-span-7"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <Input
              variant="bordered"
              label="電子郵件"
              description="Email 來自 Google 帳號，無法修改"
              value={profile?.email ?? ''}
              classNames={{ input: 'font-mono' }}
              isDisabled
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                variant="bordered"
                label="姓名"
                isRequired
                value={form.name}
                onValueChange={(name) => set({ name })}
                isInvalid={nameInvalid}
                errorMessage="請輸入姓名"
              />
              <Input
                variant="bordered"
                label="電話號碼"
                type="tel"
                placeholder="0912-345-678"
                value={form.phoneNumber}
                onValueChange={(phoneNumber) => set({ phoneNumber })}
                classNames={{ input: 'font-mono' }}
              />
            </div>
            <Input
              variant="bordered"
              label="大頭照網址"
              type="url"
              placeholder="https://..."
              value={form.photoURL}
              onValueChange={(photoURL) => set({ photoURL })}
              isInvalid={photoInvalid}
              errorMessage="請輸入 http(s):// 開頭的網址"
              classNames={{ input: 'font-mono' }}
            />
            <Input
              variant="bordered"
              label="背景圖片網址"
              type="url"
              placeholder="https://..."
              value={form.bgPhotoURL}
              onValueChange={(bgPhotoURL) => set({ bgPhotoURL })}
              isInvalid={bgInvalid}
              errorMessage="請輸入 http(s):// 開頭的網址"
              classNames={{ input: 'font-mono' }}
            />

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button type="submit" color="primary" className="font-display tracking-[0.08em]" isLoading={saving}>
                儲存
              </Button>
              <Button
                variant="bordered"
                className="font-display tracking-[0.08em]"
                startContent={!syncing && <FontAwesomeIcon icon={faRotate} className="w-3.5" />}
                isLoading={syncing}
                onPress={handleSync}
              >
                同步 Google 資料
              </Button>
            </div>
          </form>
        </section>

        <UsernameSettings />

        <VaultSettings />

        {/* 04 危險區 */}
        <section className="grid grid-cols-12 gap-6 border-t border-line py-10">
          <div className="col-span-12 md:col-span-5">
            <p className="tech-label flex items-center gap-2 text-alarm">
              <span className="led led-alarm" aria-hidden />
              04 // DANGER ZONE
            </p>
            <h2 className="mt-2 font-display text-xl font-bold text-ink">刪除帳戶</h2>
            <p className="mt-2 max-w-xs text-sm text-ink-muted">
              帳戶與所有驗證碼金鑰會永久刪除。刪除前請確認已在各服務關閉兩步驟驗證或改用其他驗證器。
            </p>
          </div>

          <div className="hatch col-span-12 flex items-center border border-alarm p-4 sm:p-6 md:col-span-7">
            <Button
              color="danger"
              variant="bordered"
              className="bg-surface-1 font-display tracking-[0.08em]"
              startContent={<FontAwesomeIcon icon={faTrashCan} className="w-3.5" />}
              onPress={() => setConfirmDeleteOpen(true)}
            >
              刪除帳戶
            </Button>
          </div>
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
