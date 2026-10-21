"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import useAuth from "@/components/auth/useAuth";
import useVault from "@/components/vault/useVault";
import VaultUnlock from "@/components/vault/VaultUnlock";
import Spinner from "@/components/ui/Loading/Spinner";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";
import TotpForm from "@/components/totp/TotpForm";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import ScopePicker from "@/app/code/_components/ScopePicker";
import { readCodeScope, writeCodeScope } from "@/lib/codeScope";
import { addGroupAccounts, loadGroupAccounts, loadGroupAccountSecrets, loadMyGroups } from "@/lib/groups/groups";
import { GROUP, has } from "@/lib/permissions/bits";
import { normalizeSecret } from "@/lib/totp/crud";
import { ImportTextResult } from "@/lib/totp/importText";
import { TotpErrors, validateTotpInput } from "@/lib/totp/validate";
import { GroupSummary } from "@/types/Group/Group";
import { TOTP_DEFAULTS, TotpInput, TotpItem } from "@/types/Totp/Totp";
import QrImport from "./_components/QrImport";
import BulkImportModal from "./_components/BulkImportModal";
import { showError } from "@/lib/errorDialog";
import { collectCategories } from '@/lib/totp/categories';

const EMPTY_FORM: TotpInput = { name: '', secret: '', category: '', ...TOTP_DEFAULTS };

const isDefaultAdvanced = (input: TotpInput) =>
  input.digits === TOTP_DEFAULTS.digits &&
  input.period === TOTP_DEFAULTS.period &&
  input.algorithm === TOTP_DEFAULTS.algorithm;

// 新增驗證碼：放到哪個群組（預設放在預設群組）、匯入或手動輸入
const AddCodeClient = () => {
  const { user } = useAuth();
  const vault = useVault();
  const [totp, setTotp] = useState<TotpInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<TotpErrors>({});
  const [saving, setSaving] = useState(false);
  // 目標群組既有的驗證碼（記著是哪個群組的，換群組時舊的就不算數）
  const [loadedItems, setLoadedItems] = useState<{ gid: string; list: TotpItem[] }>();
  const [lastAdded, setLastAdded] = useState<string>();
  // 匯入時換 key 讓表單重新掛上，進階設定才會依匯入值決定是否展開
  const [formKey, setFormKey] = useState(0);
  // 金鑰和既有的某筆相同時，先問使用者要不要照樣新增
  const [duplicate, setDuplicate] = useState<TotpItem>();
  // 一次匯入多筆的解析結果；有值時開整批匯入對話框
  const [bulk, setBulk] = useState<ImportTextResult>();

  // 放到哪個群組：只列我能新增驗證碼的；預設跟驗證碼頁目前看的一樣，沒有就用預設群組
  const [remembered, setRemembered] = useState(readCodeScope);
  // undefined 代表載入中
  const [groups, setGroups] = useState<GroupSummary[]>();
  const selectScope = (gid: string) => {
    setRemembered(gid);
    writeCodeScope(gid);
  };

  useEffect(() => {
    if (!user) return;
    loadMyGroups().then((result) => {
      if (!result.success) showError('載入群組失敗', result.message);
      setGroups(result.success ? result.data.filter((group) => has(group.permissions, GROUP.MANAGE_CODES)) : []);
    });
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const targetGroup =
    groups?.find((group) => group.id === remembered) ?? groups?.find((group) => group.is_default) ?? groups?.[0];
  const target = targetGroup?.id ?? '';
  // 加密群組：要解鎖後用加密密碼把金鑰加密再送出
  const key = targetGroup?.encrypted ? vault.key : undefined;
  const needsUnlock = !!targetGroup?.encrypted && !key;

  const items = useMemo(
    () => (loadedItems && loadedItems.gid === target && !needsUnlock ? loadedItems.list : []),
    [loadedItems, target, needsUnlock]
  );

  // 讀取目標群組既有的驗證碼：提供類別建議；拿得到金鑰時也用來檢查重複
  useEffect(() => {
    if (!target || needsUnlock) return;
    let cancelled = false;
    (async () => {
      const accounts = await loadGroupAccounts(target);
      if (cancelled || !accounts.success) return;
      let secrets: Record<string, string> = {};
      if (accounts.data.some((account) => has(account.permissions, GROUP.VIEW_SECRETS))) {
        const loaded = await loadGroupAccountSecrets(target, key);
        if (cancelled) return;
        if (loaded.success) secrets = loaded.data;
      }
      setLoadedItems({ gid: target, list: accounts.data.map((account) => ({ ...account, secret: secrets[account.id] ?? '' })) });
    })();
    return () => {
      cancelled = true;
    };
  }, [target, needsUnlock, key]);

  // 所有驗證碼類別的聯集，給類別欄位當建議
  const categories = useMemo(() => collectCategories(items), [items]);

  const handleImport = (input: TotpInput) => {
    // 保留使用者已選的類別
    setTotp({ ...input, category: totp.category || input.category });
    setErrors({});
    setFormKey((key) => key + 1);
  };

  const describe = (inputs: TotpInput[]) =>
    `${inputs.length === 1 ? `「${inputs[0].name.trim()}」` : ` ${inputs.length} 筆驗證碼`}${targetGroup ? `到「${targetGroup.name}」` : ''}`;

  // 新增後把新的項目接在清單後面（只用來提供類別建議與檢查重複）
  const remember = (inputs: TotpInput[], ids: string[]) =>
    setLoadedItems({
      gid: target,
      list: [...items, ...inputs.map((input, i) => ({ ...input, id: ids[i] ?? crypto.randomUUID(), secret: normalizeSecret(input.secret) }))],
    });

  const handleBulkImport = async (inputs: TotpInput[]) => {
    if (!user || !target || needsUnlock) return false;
    const result = await addGroupAccounts(target, inputs, key);
    if (!result.success) {
      showError('匯入驗證碼失敗', result.message);
      return false;
    }
    remember(inputs, result.data);
    toast.success(`已匯入 ${inputs.length} 筆驗證碼`, { position: 'top-right' });
    setLastAdded(describe(inputs));
    return true;
  };

  // 新增 TOTP 資料（force：已確認重複也要新增）
  const handleAddTotp = async (force = false) => {
    if (!user || !target || needsUnlock) return;

    const nextErrors = validateTotpInput(totp);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // 重複金鑰只比得到我看得到金鑰的那些
    const secret = normalizeSecret(totp.secret);
    const existing = items.find((item) => item.secret && normalizeSecret(item.secret) === secret);
    if (existing && !force) {
      setDuplicate(existing);
      return;
    }

    setSaving(true);
    const result = await addGroupAccounts(target, [totp], key);
    setSaving(false);

    if (result.success) {
      toast.success('已新增', { position: 'top-right' });
      remember([totp], result.data);
      setLastAdded(describe([totp]));
      // 清空表單，類別保留方便連續新增同類
      setTotp({ ...EMPTY_FORM, category: totp.category });
      setFormKey((key) => key + 1);
    } else {
      showError('新增驗證碼失敗', result.message);
    }
  };

  return (
    <PageContent className="max-w-2xl">
      <PageHeader
        title="新增驗證碼"
        right={
          <Link href="/code" className="text-[17px] text-accent hover:underline">
            回到列表
          </Link>
        }
      />

      <div className="flex flex-col gap-8">
        {lastAdded && (
          <p className="flex flex-wrap items-center gap-3 px-5 text-[15px]">
            <FontAwesomeIcon icon={faCircleCheck} className="w-4 shrink-0 text-success" />
            <span className="flex-1">已新增{lastAdded}，可以繼續新增下一筆</span>
            <Link href="/code" className="link-arrow shrink-0">查看驗證碼</Link>
          </p>
        )}

        {/* 放到哪個群組：預設選預設群組 */}
        {groups === undefined ? (
          <Spinner block label="載入群組…" />
        ) : !targetGroup ? (
          <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center">
            <p className="text-[19px] font-semibold">沒有可以新增驗證碼的群組</p>
            <p className="mt-1 text-ink-muted">重新整理頁面試試看；登入時會自動建立預設群組</p>
          </div>
        ) : (
          <section>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">放到</h2>
            <ScopePicker groups={groups} selected={target} onSelect={selectScope} />
            <p className="mt-2 px-5 text-[13px] text-ink-muted">
              {targetGroup.encrypted
                ? `「${targetGroup.name}」已加密，金鑰會先用你的加密密碼加密才送出`
                : targetGroup.member_count > 1
                  ? `加到「${targetGroup.name}」的驗證碼，群組成員會依身分組權限看到`
                  : `加到「${targetGroup.name}」，目前只有你看得到`}
            </p>
          </section>
        )}

        {/* 加密群組還沒解鎖：先解鎖 */}
        {targetGroup && needsUnlock && (
          <section className="rounded-[18px] border border-line/70 bg-surface px-5 py-5">
            <p className="mb-4 text-[15px] text-ink-muted">「{targetGroup.name}」已加密，輸入加密密碼解鎖後才能新增</p>
            {vault.status === "loading" ? <Spinner /> : vault.status === "locked" ? <VaultUnlock compact /> : (
              <p className="text-[15px] text-alarm">找不到你的加密設定，請重新整理</p>
            )}
          </section>
        )}

        {targetGroup && !needsUnlock && (
          <>
          {/* 匯入：貼連結、上傳圖片、開相機 */}
          <section>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">匯入</h2>
            <QrImport onImport={handleImport} onImportMany={setBulk} />
          </section>

          {/* 手動輸入 */}
          <section>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">手動輸入</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddTotp();
              }}
            >
              <div className="rounded-[18px] border border-line/70 bg-surface p-5">
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
              </div>
              <Button type="submit" color="primary" radius="full" size="lg" className="mt-6 w-full" isLoading={saving}>
                {`新增到「${targetGroup.name}」`}
              </Button>
            </form>
          </section>
          </>
        )}
      </div>

      {bulk && (
        <BulkImportModal
          result={bulk}
          existing={items.filter((item) => item.secret)}
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
