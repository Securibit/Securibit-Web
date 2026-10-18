"use client";

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next-nprogress-bar';
import { Button } from '@heroui/react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrashCan, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import CodeCard from './_components/CodeCard';
import ConfirmModal from '@/components/ui/Modal/ConfirmModal';
import Spinner from '@/components/ui/Loading/Spinner';
import PageContent from '@/components/layout/PageContent';
import PageHeader from '@/components/layout/PageHeader';
import useAuth from '@/components/auth/useAuth';
import { TotpResult, clearTotp, deleteTotp, loadTotp } from '@/lib/totp/crud';
import { TotpItem } from '@/types/Totp/Totp';

const CodeClient = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<TotpItem[]>();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // 登入狀態由 AuthGate 確認過，這裡只負責載入驗證碼
  useEffect(() => {
    if (!user) return;
    loadTotp(user.uid).then((result) => {
      if (result.success) {
        setItems(result.data);
      } else {
        setItems([]);
        toast.error(`載入驗證碼失敗！\n錯誤訊息：${result.message}`, { position: 'top-right' });
      }
    });
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 資料層回傳最新陣列，成功就直接換掉畫面上的資料
  const applyResult = (result: TotpResult, successText: string, failText: string) => {
    if (result.success) {
      setItems(result.data);
      toast.success(successText, { position: 'top-right' });
    } else {
      toast.error(`${failText}\n錯誤訊息：${result.message}`, { position: 'top-right' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    applyResult(await deleteTotp(user.uid, id), '已成功刪除驗證碼！', '刪除驗證碼失敗！');
  };

  const handleClear = async () => {
    if (!user) return;
    applyResult(await clearTotp(user.uid), '已成功清空驗證碼！', '清空驗證碼失敗！');
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
        <div className="w-full p-4 bg-white border border-gray-blue-200 rounded-lg shadow sm:px-8 dark:bg-gray-blue-800 dark:border-gray-blue-700">
          <ul role="list" className="divide-y divide-gray-blue-200 dark:divide-gray-blue-700">
            {items.map((item) => (
              <CodeCard
                key={item.id}
                item={item}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </ul>
        </div>
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
