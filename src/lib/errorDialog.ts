import { useSyncExternalStore } from 'react';

export interface ErrorDialogItem {
  id: number;
  title: string;
  message?: string;
}

// 全站共用的錯誤佇列：任何地方呼叫 showError，Layout 裡的 ErrorDialogHost 依序彈出對話框
let queue: ErrorDialogItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const EMPTY: ErrorDialogItem[] = [];

const emit = () => listeners.forEach((listener) => listener());

/** 彈出錯誤對話框（要按確定才會關閉）。同時有多個錯誤時依序顯示 */
export const showError = (title: string, message?: string) => {
  // 同樣的錯誤已經在排隊就不重複顯示（例如連按好幾次）
  if (queue.some((item) => item.title === title && item.message === message)) return;
  queue = [...queue, { id: nextId++, title, message }];
  emit();
};

/** 關閉目前顯示的錯誤 */
export const dismissError = () => {
  queue = queue.slice(1);
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useErrorQueue = () => useSyncExternalStore(subscribe, () => queue, () => EMPTY);
