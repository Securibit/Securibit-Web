import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// 全站統一的時間顯示格式：YYYY/MM/DD HH:mm:ss（24 小時制）
const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY/MM/DD HH:mm:ss，空值顯示「無」，無法解析就原樣回傳 */
export const formatDateTime = (value?: string | null) => {
  if (!value) return '無';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return (
    `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
};
