"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import useAuth from "@/components/auth/useAuth";
import useVault from "@/components/vault/useVault";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";
import TotpForm from "@/components/totp/TotpForm";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import ScopePicker from "@/app/code/_components/ScopePicker";
import { readCodeScope, writeCodeScope } from "@/lib/codeScope";
import { addGroupAccounts, loadMyGroups } from "@/lib/groups/groups";
import { GROUP, has } from "@/lib/permissions/bits";
import { addTotp, addTotps, loadTotp, normalizeSecret } from "@/lib/totp/crud";
import { ImportTextResult } from "@/lib/totp/importText";
import { TotpErrors, validateTotpInput } from "@/lib/totp/validate";
import { GroupSummary } from "@/types/Group/Group";
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

  // 放到哪裡：我的（空字串）或群組；預設跟驗證碼頁目前看的一樣
  const [scope, setScope] = useState(readCodeScope);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const selectScope = (gid: string) => {
    setScope(gid);
    writeCodeScope(gid);
  };

  // 讀取既有驗證碼，只用來提供類別建議；群組只列我能新增驗證碼的
  useEffect(() => {
    if (!user) return;
    loadTotp(user.uid, key).then((result) => {
      if (result.success) setItems(result.data);
    });
    loadMyGroups().then((result) => {
      setGroups(result.success ? result.data.filter((group) => has(group.permissions, GROUP.MANAGE_CODES)) : []);
    });
  }, [user?.uid, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // 記住的群組不能新增（或已不在）就回到我的
  const targetGroup = groups.find((group) => group.id === scope);
  const target = targetGroup ? scope : '';

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

  const describe = (inputs: TotpInput[]) =>
    `${inputs.length === 1 ? `「${inputs[0].name.trim()}」` : ` ${inputs.length} 筆驗證碼`}${targetGroup ? `到「${targetGroup.name}」` : ''}`;

  const handleBulkImport = async (inputs: TotpInput[]) => {
    if (!user) return false;
    if (target) {
      const result = await addGroupAccounts(target, inputs);
      if (!result.success) {
        showError('匯入驗證碼失敗', result.message);
        return false;
      }
    } else {
      const result = await addTotps(user.uid, inputs, key);
      if (!result.success) {
        showError('匯入驗證碼失敗', result.message);
        return false;
      }
      setItems(result.data);
    }
    toast.success(`已匯入 ${inputs.length} 筆驗證碼`, { position: 'top-right' });
    setLastAdded(describe(inputs));
    return true;
  };

  // 新增 TOTP 資料（force：已確認重複也要新增）
  const handleAddTotp = async (force = false) => {
    if (!user) return;

    const nextErrors = validateTotpInput(totp);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // 重複金鑰只在「我的」檢查（群組的金鑰拿不到）
    const secret = normalizeSecret(totp.secret);
    const existing = target ? undefined : items.find((item) => normalizeSecret(item.secret) === secret);
    if (existing && !force) {
      setDuplicate(existing);
      return;
    }

    setSaving(true);
    const result = target ? await addGroupAccounts(target, [totp]) : await addTotp(user.uid, totp, key);
    setSaving(false);

    if (result.success) {
      toast.success('已新增', { position: 'top-right' });
      if (!target) setItems(result.data as TotpItem[]);
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

        {/* 放到哪裡：有群組才需要選 */}
        {groups.length > 0 && (
          <section>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">放到</h2>
            <ScopePicker groups={groups} selected={target} onSelect={selectScope} />
            {targetGroup && (
              <p className="mt-2 px-5 text-[13px] text-ink-muted">加到「{targetGroup.name}」的驗證碼，群組成員會依身分組權限看到</p>
            )}
          </section>
        )}

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
              {targetGroup ? `新增到「${targetGroup.name}」` : '新增'}
            </Button>
          </form>
        </section>
      </div>

      {bulk && (
        <BulkImportModal
          result={bulk}
          existing={target ? [] : items}
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
