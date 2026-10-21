/*
 * 一筆驗證碼可以有多個類別。資料庫沿用原本的 category text 欄位，
 * 多個類別用半形逗號「,」串起來存；只有一個類別的舊資料自然相容。
 */

// 輸入時接受半形逗號、全形逗號、頓號當分隔
const SEPARATOR = /[,，、]/;

/** 把存起來的字串切成類別陣列：去頭尾空白、去空、去重，保留原本順序 */
export const parseCategories = (value: string | null | undefined): string[] => {
  if (!value) return [];
  const seen = new Set<string>();
  for (const part of value.split(SEPARATOR)) {
    const name = part.trim();
    if (name) seen.add(name);
  }
  return [...seen];
};

/** 把類別陣列接成要存的字串（會順便整理一次） */
export const joinCategories = (list: string[]) => parseCategories(list.join(',')).join(',');

/** 整理成標準格式（存檔前用） */
export const normalizeCategories = (value: string | null | undefined) => joinCategories(parseCategories(value));

/** 一組驗證碼所有類別的聯集（排序），給篩選與建議清單用 */
export const collectCategories = (items: { category: string }[]) =>
  [...new Set(items.flatMap((item) => parseCategories(item.category)))].sort();

/** 是否含有某個類別 */
export const hasCategory = (value: string, name: string) => parseCategories(value).includes(name);

/** 名稱下方顯示用：用「、」串起來 */
export const formatCategories = (value: string) => parseCategories(value).join('、');
