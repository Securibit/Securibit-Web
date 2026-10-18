"use client";

import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next-nprogress-bar';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import CodeCard from '@/components/CodeCard';
import ConfirmModal from '@/components/ui/Modal/ConfirmModal';
import { clearTotpItems, deleteTotpItem, loadUserData } from '@/lib/totp/crud';
import { UserData, totpItems } from '@/types/userData';
import useAuth from '@/components/auth/useAuth';

const CodeClient = () => {
  const [userData, setUserData] = useState<UserData | undefined>();
  const { user } = useAuth();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const router = useRouter();

  // 清空 TOTP 項目
  const clearTotpItem = async () => {
    if (!user) {
      toast.error('請先登入！', { position: 'top-right' });
      return;
    }

    const result = await clearTotpItems(user.uid);
    if (result.success) {
      toast.success('已成功清空驗證碼！', { position: 'top-right' });
      const updatedUserData = await loadUserData(user.uid);
      if (updatedUserData.success) {
        setUserData(updatedUserData.data);  // 更新使用者資料
      }
    } else {
      toast.error(`清空驗證碼失敗！\n錯誤訊息：\n${result.message}`, { position: 'top-right' });
    }
  };

  // 刪除 TOTP 項目
  const deleteTotpItemHandler = async (totpCode: string) => {
    if (!user) {
      toast.error('請先登入！', { position: 'top-right' });
      return;
    }

    const result = await deleteTotpItem(user.uid, totpCode);
    if (result.success) {
      toast.success('已成功刪除驗證碼！', { position: 'top-right' });
      const updatedUserData = await loadUserData(user.uid);
      if (updatedUserData.success) {
        setUserData(updatedUserData.data);  // 刪除成功後更新使用者資料
      }
    } else {
      toast.error(`刪除驗證碼失敗！\n錯誤訊息：\n${result.message}`, { position: 'top-right' });
    }
  };

  // 登入狀態由 AuthGate 確認過，這裡只負責載入驗證碼
  useEffect(() => {
    if (!user) return;
    loadUserData(user.uid).then((result) => {
      if (result.success) {
        setUserData(result.data);
      } else {
        toast.error('找不到使用者資料！', { position: 'top-right' });
      }
    });
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="container pt-5 pl-5 pr-5">
      {
        userData?.totp.length === 0 ? (
          <div className="flex items-center p-4 mb-4 text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-gray-blue-800 dark:text-red-400 dark:border-red-800 text-lg" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} className="inline w-4 h-4 mr-3" />
            <span className="sr-only">Info</span>
            <div>
              <span className="font-bold">喔不!</span> 驗證碼是空的！！！
              <button className="underline underline-offset-4 text-cyan-300" onClick={() => router.push('/addCode')}>點我立刻去新增驗證碼？</button>
            </div>
          </div>
        ) : (

          <button onClick={() => setConfirmClearOpen(true)}>
            <span className="relative inline-flex items-center justify-center p-0.5 mb-2 mr-2 overflow-hidden text-sm font-medium text-gray-blue-900 rounded-lg group bg-gradient-to-br from-cyan-500 to-blue-500 group-hover:from-cyan-500 group-hover:to-blue-500 hover:text-white dark:text-white focus:ring-4 focus:outline-none focus:ring-cyan-200 dark:focus:ring-cyan-800">
              <span className="relative px-5 py-2.5 transition-all ease-in duration-75 bg-white dark:bg-gray-blue-900 rounded-md group-hover:bg-opacity-0">
                點我清空所有驗證碼
              </span>
            </span>
          </button>
        )
      }
      <ConfirmModal
        isOpen={confirmClearOpen}
        danger
        title="清空所有驗證碼"
        description="確定要清空所有驗證碼嗎？刪除後無法恢復，所有金鑰都會遺失。"
        confirmLabel="全部清空"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={async () => {
          setConfirmClearOpen(false);
          await clearTotpItem();
        }}
      />
      <div className="w-full p-4 bg-white border border-gray-blue-200 rounded-lg shadow sm:px-8 sm:pt-8 dark:bg-gray-blue-800 dark:border-gray-blue-700">
        <div className="flex items-center justify-between mb-4">
          <h5 className="text-xl font-bold leading-none text-gray-blue-900 dark:text-white">驗證碼</h5>
          <button
            onClick={() => router.push('/addCode')}
            className="text-sm border-tpp border-2 rounded-lg px-2 py-2 hover:bg-tpp/30dark:hover:bg-tpp-30"
          >
            新增驗證碼
          </button>
        </div>
        <div className="flow-root">
          <ul role="list" className="divide-y divide-gray-blue-200 dark:divide-gray-blue-700">
            {
              userData?.totp.map((items: totpItems) => (
                <div key={items.name}>
                  <CodeCard
                    code={items.secret}
                    name={items.name}
                    category={items.category}
                    deleteCode={() => deleteTotpItemHandler(items.secret)}
                  />
                </div>
              ))
            }
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CodeClient;
