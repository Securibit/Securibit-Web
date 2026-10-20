"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import useAuth from "@/components/auth/useAuth";
import useVault from "@/components/vault/useVault";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";
import TotpForm from "@/components/totp/TotpForm";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import { addTotp, addTotps, loadTotp, normalizeSecret } from "@/lib/totp/crud";
import { ImportTextResult } from "@/lib/totp/importText";
import { TotpErrors, validateTotpInput } from "@/lib/totp/validate";
import { TOTP_DEFAULTS, TotpInput, TotpItem } from "@/types/Totp/Totp";
import QrImport from "./_components/QrImport";
import BulkImportModal from "./_components/BulkImportModal";
import { showError } from "@/lib/errorDialog";

const EMPTY_FORM: TotpInput = { name: '', secret: '', category: '', ...TOTP_DEFAULTS };

const isDefaultAdvanced = (input: TotpInput) =>
  input.digits === TOTP_DEFAULTS.digits &&
  input.period === TOTP_DEFAULTS.period &&
  input.algorithm === TOTP_DEFAULTS.algorithm;

const AddCodeClient = () => {
  const { user } = useAuth();
  const { key } = useVault();
  const router = useRouter();
  const [totp, setTotp] = useState<TotpInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<TotpErrors>({});
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<TotpItem[]>([]);
  const [lastAdded, setLastAdded] = useState<string>();
  // 匯入時換 key 讓表單重新掛上，進階設定才會依匯入值決定是否展開
  const [formKey, setFormKey] = useState(0);
  // 金鑰和既有的某筆相同時，先問使用者要不要照樣新增
  const [duplicate, setDuplicate] = useState<TotpItem>();
  // 一次匯入多筆的解析結果；有值時開整批匯入對話框
  const [bulk, setBulk] = useState<ImportTextResult>();

  // 讀取既有驗證碼，只用來提供類別建議
  useEffect(() => {
    if (!user) return;
    loadTotp(user.uid, key).then((result) => {
      if (result.success) setItems(result.data);
    });
  }, [user?.uid, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category).filter(Boolean))].sort(),
    [items]
  );

  const handleImport = (input: TotpInput) => {
    // 保留使用者已選的類別
    setTotp({ ...input, category: totp.category || input.category });
    setErrors({});
    setFormKey((key) => key + 1);
  };

  const handleBulkImport = async (inputs: TotpInput[]) => {
    if (!user) return false;
    const result = await addTotps(user.uid, inputs, key);
    if (!result.success) {
      showError('匯入驗證碼失敗', result.message);
      return false;
    }
    toast.success(`已匯入 ${inputs.length} 筆驗證碼！`, { position: 'top-right' });
    setItems(result.data);
    setLastAdded(inputs.length === 1 ? `「${inputs[0].name.trim()}」` : ` ${inputs.length} 筆驗證碼`);
    return true;
  };

  // 新增 TOTP 資料（force：已確認重複也要新增）
  const handleAddTotp = async (force = false) => {
    if (!user) return;

    const nextErrors = validateTotpInput(totp);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const secret = normalizeSecret(totp.secret);
    const existing = items.find((item) => normalizeSecret(item.secret) === secret);
    if (existing && !force) {
      setDuplicate(existing);
      return;
    }

    setSaving(true);
    const result = await addTotp(user.uid, totp, key);
    setSaving(false);

    if (result.success) {
      toast.success('新增 TOTP 成功！', { position: 'top-right' });
      setItems(result.data);
      setLastAdded(`「${totp.name.trim()}」`);
      // 清空表單，類別保留方便連續新增同類
      setTotp({ ...EMPTY_FORM, category: totp.category });
      setFormKey((key) => key + 1);
    } else {
      showError('新增驗證碼失敗', result.message);
    }
  };

  return (
    <PageContent className="max-w-5xl">
      <PageHeader
        index="02 // ADD CODE"
        title="新增驗證碼"
        subtitle="掃描 QR Code、匯入 Google Authenticator 或備份檔，或手動輸入金鑰"
        right={
          <Button
            variant="bordered"
            className="font-display tracking-[0.08em]"
            startContent={<FontAwesomeIcon icon={faArrowLeft} className="w-3.5" />}
            onPress={() => router.push('/code')}
          >
            回到驗證碼列表
          </Button>
        }
      />

      <div className="boot">
        {lastAdded && (
          <div className="mb-6 flex flex-wrap items-center gap-3 border border-phos/50 bg-phos/10 p-3 text-sm text-ink">
            <span className="led" aria-hidden />
            <span className="flex-1">已新增{lastAdded}，可以繼續新增下一筆。</span>
            <Button size="sm" color="primary" variant="bordered" className="font-display tracking-[0.08em]" onPress={() => router.push('/code')}>
              查看驗證碼
            </Button>
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {/* 左：說明 + 快速匯入 */}
          <div className="col-span-12 lg:col-span-5">
            <p className="tech-label">A // IMPORT</p>
            <h2 className="mt-1 font-display text-xl font-bold text-ink">快速匯入</h2>
            <p className="mt-2 text-sm text-ink-muted">
              貼上服務給的 otpauth 連結，或上傳綁定畫面的 QR Code 截圖；Google Authenticator 的匯出 QR Code 和本站的備份檔可以一次匯入多筆。
            </p>
            <div className="mt-4 border border-line bg-surface-1 p-4">
              <QrImport onImport={handleImport} onImportMany={setBulk} />
            </div>
            <p className="mt-3 font-mono text-[11px] tracking-[0.08em] text-ink-dim">
              解析成功後會自動帶入右邊的表單，確認後再按新增。
            </p>
          </div>

          {/* 右：手動輸入表單 */}
          <div className="col-span-12 lg:col-span-7">
            <div className="panel p-5 sm:p-6">
              <p className="tech-label">B // MANUAL</p>
              <h2 className="mt-1 font-display text-xl font-bold text-ink">手動輸入</h2>
              <div className="rule mt-4 mb-5" />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddTotp();
                }}
              >
                <TotpForm
                  key={formKey}
                  value={totp}
                  onChange={(value) => {
                    setTotp(value);
                    setErrors({});
                  }}
                  categories={categories}
                  errors={errors}
                  advancedOpen={!isDefaultAdvanced(totp)}
                />
                <Button type="submit" color="primary" className="mt-6 w-full font-display tracking-[0.08em] sm:w-auto" isLoading={saving}>
                  新增驗證碼
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {bulk && (
        <BulkImportModal
          result={bulk}
          existing={items}
          categories={categories}
          onClose={() => setBulk(undefined)}
          onConfirm={handleBulkImport}
        />
      )}

      <ConfirmModal
        isOpen={!!duplicate}
        title="已經有相同的金鑰"
        description={`「${duplicate?.name ?? ""}」使用相同的金鑰，產生的驗證碼會一模一樣。確定還要再新增一筆嗎？`}
        confirmLabel="仍要新增"
        onCancel={() => setDuplicate(undefined)}
        onConfirm={async () => {
          setDuplicate(undefined);
          await handleAddTotp(true);
        }}
      />
    </PageContent>
  );
};

export default AddCodeClient;
