"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'nextjs-toploader/app';
import { Button, Chip, Input, Switch } from '@heroui/react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsUpDown, faCheck, faFileExport, faMagnifyingGlass, faPlus, faTrashCan, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import CodeCard from './_components/CodeCard';
import TotpEditModal from './_components/TotpEditModal';
import ExportModal from './_components/ExportModal';
import ConfirmModal from '@/components/ui/Modal/ConfirmModal';
import Spinner from '@/components/ui/Loading/Spinner';
import PageContent from '@/components/layout/PageContent';
import PageHeader from '@/components/layout/PageHeader';
import useAuth from '@/components/auth/useAuth';
import useVault from '@/components/vault/useVault';
import { TotpResult, clearTotp, deleteTotp, isValidSecret, loadTotp, reorderTotp, updateTotp } from '@/lib/totp/crud';
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
  // 有啟用加密時的金鑰（VaultGate 確認解鎖後才會掛上這個元件）
  const { key } = useVault();
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

  // 排序模式：顯示全部項目與上下移動按鈕（篩選中的列表無法正確換位置，所以先停用搜尋）
  const [sorting, setSorting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // 連按排序時只採用最後一次請求的結果，避免較早的回應蓋掉較新的順序
  const reorderSeq = useRef(0);

  // 釘選的排最上面，其餘維持儲存的順序
  const ordered = useMemo(
    () => [...(items ?? []).filter((item) => item.pinned), ...(items ?? []).filter((item) => !item.pinned)],
    [items]
  );

  // 名稱或類別包含關鍵字（不分大小寫），再依類別篩選
  const filtered = useMemo(() => {
    if (sorting) return ordered;
    const q = keyword.trim().toLowerCase();
    return ordered.filter((item) =>
      (!activeCategory || item.category === activeCategory) &&
      (!q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
    );
  }, [ordered, sorting, keyword, activeCategory]);

  // 登入狀態由 AuthGate 確認過，這裡只負責載入驗證碼
  useEffect(() => {
    if (!user) return;
    loadTotp(user.uid, key).then((result) => {
      if (result.success) {
        setItems(result.data);
      } else {
        setItems([]);
        showError('載入驗證碼失敗', result.message);
      }
    });
  }, [user?.uid, key]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return applyResult(await updateTotp(user.uid, id, input, key), '已儲存驗證碼！', '儲存驗證碼失敗');
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    applyResult(await deleteTotp(user.uid, id, key), '已成功刪除驗證碼！', '刪除驗證碼失敗');
  };

  const handleTogglePin = async (item: TotpItem) => {
    if (!user) return;
    applyResult(
      await updateTotp(user.uid, item.id, { pinned: !item.pinned }, key),
      item.pinned ? '已取消釘選' : '已釘選到最上面',
      item.pinned ? '取消釘選失敗' : '釘選失敗'
    );
  };

  // 和相鄰項目交換位置（只在同一組裡移動：釘選的和未釘選的不互換）
  const handleMove = async (index: number, offset: -1 | 1) => {
    if (!user || !items) return;
    const target = index + offset;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];

    // 先換畫面，失敗再換回來
    const previous = items;
    setItems(next);
    const seq = ++reorderSeq.current;
    const result = await reorderTotp(user.uid, next.map((item) => item.id), key);
    if (seq !== reorderSeq.current) return;
    if (result.success) {
      setItems(result.data);
    } else {
      setItems(previous);
      showError('排序失敗', result.message);
    }
  };

  const canSwap = (index: number, offset: -1 | 1) => {
    const neighbor = ordered[index + offset];
    return !!neighbor && !!neighbor.pinned === !!ordered[index].pinned;
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
            {items && (sorting || items.length > 1) && (
              <Button
                variant={sorting ? 'solid' : 'bordered'}
                color="primary"
                startContent={<FontAwesomeIcon icon={sorting ? faCheck : faArrowsUpDown} className="w-3.5" />}
                onPress={() => setSorting(!sorting)}
              >
                {sorting ? '完成排序' : '排序'}
              </Button>
            )}
            {items && items.length > 0 && !sorting && (
              <Button
                variant="bordered"
                startContent={<FontAwesomeIcon icon={faFileExport} className="w-3.5" />}
                onPress={() => setExportOpen(true)}
              >
                匯出
              </Button>
            )}
            {items && items.length > 0 && !sorting && (
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
          {sorting ? (
            <p className="mb-4 text-sm text-gray-blue-500 dark:text-gray-blue-400">
              用箭頭調整順序，釘選的項目固定排在最上面。調整完按「完成排序」。
            </p>
          ) : (
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
          )}

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-gray-blue-500 dark:text-gray-blue-400">
              沒有符合條件的驗證碼
            </p>
          ) : (
            <div className="w-full p-4 bg-white border border-gray-blue-200 rounded-lg shadow sm:px-8 dark:bg-gray-blue-800 dark:border-gray-blue-700">
              <ul role="list" className="divide-y divide-gray-blue-200 dark:divide-gray-blue-700">
                {filtered.map((item, index) => (
                  <CodeCard
                    key={item.id}
                    item={item}
                    onEdit={() => setEditing(item)}
                    onDelete={() => handleDelete(item.id)}
                    onTogglePin={() => handleTogglePin(item)}
                    hidden={hideCodes}
                    sort={
                      sorting
                        ? {
                            canUp: canSwap(index, -1),
                            canDown: canSwap(index, 1),
                            onUp: () => handleMove(index, -1),
                            onDown: () => handleMove(index, 1),
                          }
                        : undefined
                    }
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

      {/* 解不開的金鑰（顯示「金鑰錯誤」的項目）不匯出 */}
      {exportOpen && (
        <ExportModal items={ordered.filter((item) => isValidSecret(item.secret))} onClose={() => setExportOpen(false)} />
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
