"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'nextjs-toploader/app';
import { Button, Chip, Input, Switch } from '@heroui/react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faPlus, faTrashCan, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import CodeCard from './_components/CodeCard';
import TotpEditModal from './_components/TotpEditModal';
import ConfirmModal from '@/components/ui/Modal/ConfirmModal';
import Spinner from '@/components/ui/Loading/Spinner';
import PageContent from '@/components/layout/PageContent';
import PageHeader from '@/components/layout/PageHeader';
import useAuth from '@/components/auth/useAuth';
import { TotpResult, clearTotp, deleteTotp, loadTotp, updateTotp } from '@/lib/totp/crud';
import { TotpInput, TotpItem } from '@/types/Totp/Totp';
import { showError } from "@/lib/errorDialog";

// 「隱藏驗證碼」偏好記在這個瀏覽器（私密視窗等讀寫失敗時就當沒設定）
const HIDE_KEY = 'securibit:hideCodes';
const readHidePref = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
};

const CodeClient = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<TotpItem[]>();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [editing, setEditing] = useState<TotpItem>();
  const [keyword, setKeyword] = useState('');
  // 目前篩選的類別，undefined 代表全部
  const [category, setCategory] = useState<string>();
  // AuthGate 確認登入後才掛上這個元件，不會在伺服器端執行，可以直接讀 localStorage
  const [hideCodes, setHideCodes] = useState(readHidePref);

  const toggleHideCodes = (hide: boolean) => {
    setHideCodes(hide);
    try {
      localStorage.setItem(HIDE_KEY, hide ? '1' : '0');
    } catch {
      // 存不了就只在這次有效
    }
  };

  // 既有類別（去重、排序），給編輯表單當建議選項
  const categories = useMemo(
    () => [...new Set((items ?? []).map((item) => item.category).filter(Boolean))].sort(),
    [items]
  );

  // 篩選中的類別被刪光或改名時，自動回到全部
  const activeCategory = category && categories.includes(category) ? category : undefined;

  // 名稱或類別包含關鍵字（不分大小寫），再依類別篩選
  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return (items ?? []).filter((item) =>
      (!activeCategory || item.category === activeCategory) &&
      (!q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
    );
  }, [items, keyword, activeCategory]);

  // 登入狀態由 AuthGate 確認過，這裡只負責載入驗證碼
  useEffect(() => {
    if (!user) return;
    loadTotp(user.uid).then((result) => {
      if (result.success) {
        setItems(result.data);
      } else {
        setItems([]);
        showError('載入驗證碼失敗', result.message);
      }
    });
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 資料層回傳最新陣列，成功就直接換掉畫面上的資料
  const applyResult = (result: TotpResult, successText: string, failText: string) => {
    if (result.success) {
      setItems(result.data);
      toast.success(successText, { position: 'top-right' });
    } else {
      showError(failText, result.message);
    }
    return result.success;
  };

  const handleUpdate = async (id: string, input: TotpInput) => {
    if (!user) return false;
    return applyResult(await updateTotp(user.uid, id, input), '已儲存驗證碼！', '儲存驗證碼失敗');
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    applyResult(await deleteTotp(user.uid, id), '已成功刪除驗證碼！', '刪除驗證碼失敗');
  };

  const handleClear = async () => {
    if (!user) return;
    applyResult(await clearTotp(user.uid), '已成功清空驗證碼！', '清空驗證碼失敗');
  };

  return (
    <PageContent>
      <PageHeader
        title="驗證碼"
        subtitle="點擊驗證碼即可複製"
        right={
          <>
            {items && items.length > 0 && (
              <Button
                variant="bordered"
                color="danger"
                startContent={<FontAwesomeIcon icon={faTrashCan} className="w-3.5" />}
                onPress={() => setConfirmClearOpen(true)}
              >
                清空全部
              </Button>
            )}
            <Button
              color="primary"
              startContent={<FontAwesomeIcon icon={faPlus} className="w-3.5" />}
              onPress={() => router.push('/addCode')}
            >
              新增驗證碼
            </Button>
          </>
        }
      />

      {items === undefined ? (
        <Spinner block label="載入驗證碼…" />
      ) : items.length === 0 ? (
        <div className="flex items-center p-4 text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-gray-blue-800 dark:text-red-400 dark:border-red-800 text-lg" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} className="inline w-4 h-4 mr-3" />
          <div>
            <span className="font-bold">喔不!</span> 驗證碼是空的！！！
            <button className="ml-1 underline underline-offset-4 text-cyan-500 dark:text-cyan-300" onClick={() => router.push('/addCode')}>點我立刻去新增驗證碼？</button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3">
            <Input
              aria-label="搜尋驗證碼"
              placeholder="搜尋名稱或類別"
              value={keyword}
              onValueChange={setKeyword}
              isClearable
              onClear={() => setKeyword('')}
              startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="w-3.5 text-gray-blue-400" />}
              className="sm:max-w-sm"
            />
            <Switch size="sm" isSelected={hideCodes} onValueChange={toggleHideCodes}>
              隱藏驗證碼（點一下才顯示）
            </Switch>
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Chip
                  as="button"
                  variant={activeCategory ? 'bordered' : 'solid'}
                  color="primary"
                  onClick={() => setCategory(undefined)}
                >
                  全部 {items.length}
                </Chip>
                {categories.map((name) => (
                  <Chip
                    key={name}
                    as="button"
                    variant={activeCategory === name ? 'solid' : 'bordered'}
                    color="primary"
                    onClick={() => setCategory(activeCategory === name ? undefined : name)}
                  >
                    {name} {items.filter((item) => item.category === name).length}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-gray-blue-500 dark:text-gray-blue-400">
              沒有符合條件的驗證碼
            </p>
          ) : (
            <div className="w-full p-4 bg-white border border-gray-blue-200 rounded-lg shadow sm:px-8 dark:bg-gray-blue-800 dark:border-gray-blue-700">
              <ul role="list" className="divide-y divide-gray-blue-200 dark:divide-gray-blue-700">
                {filtered.map((item) => (
                  <CodeCard
                    key={item.id}
                    item={item}
                    onEdit={() => setEditing(item)}
                    onDelete={() => handleDelete(item.id)}
                    hidden={hideCodes}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {editing && (
        <TotpEditModal
          key={editing.id}
          item={editing}
          categories={categories}
          onClose={() => setEditing(undefined)}
          onSave={(input) => handleUpdate(editing.id, input)}
        />
      )}

      <ConfirmModal
        isOpen={confirmClearOpen}
        danger
        title="清空所有驗證碼"
        description="確定要清空所有驗證碼嗎？刪除後無法恢復，所有金鑰都會遺失。"
        confirmLabel="全部清空"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={async () => {
          setConfirmClearOpen(false);
          await handleClear();
        }}
      />
    </PageContent>
  );
};

export default CodeClient;
