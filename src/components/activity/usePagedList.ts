"use client";

import { useEffect, useState } from "react";
import { showError } from "@/lib/errorDialog";
import { Result } from "@/types/Permission/Permission";

/**
 * 以 id 往前翻頁的列表：掛上時載入第一頁，loadMore 用最後一筆的 id 載入下一頁。
 * load 換了（例如換使用者）時請由外層用 key 重新掛載
 */
const usePagedList = <T extends { id: number }>(
  load: (beforeId: number | null) => Promise<Result<T[]>>,
  pageSize: number,
  errorTitle: string
) => {
  // null：第一頁載入中
  const [items, setItems] = useState<T[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load(null).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setItems(result.data);
        setHasMore(result.data.length >= pageSize);
      } else {
        setItems([]);
        showError(errorTitle, result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (!items || items.length === 0 || loadingMore) return;
    setLoadingMore(true);
    const result = await load(items[items.length - 1].id);
    setLoadingMore(false);
    if (!result.success) {
      showError(errorTitle, result.message);
      return;
    }
    // 避免重複（同一頁被載入兩次時）
    setItems((old) => {
      const seen = new Set((old ?? []).map((item) => item.id));
      return [...(old ?? []), ...result.data.filter((item) => !seen.has(item.id))];
    });
    setHasMore(result.data.length >= pageSize);
  };

  return { items, hasMore, loadingMore, loadMore };
};

export default usePagedList;
