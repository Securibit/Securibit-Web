"use client";

import { useEffect, useState } from "react";
import { loadSiteOwner } from "@/lib/admin/admin";

/**
 * 全站擁有者的 id：undefined 是還沒讀到（或讀不到，例如沒有「進入後台」），null 是還沒有擁有者。
 * enabled 為 false 時不讀
 */
const useSiteOwner = (enabled = true) => {
  const [ownerId, setOwnerId] = useState<string | null>();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadSiteOwner().then((result) => {
      if (!cancelled && result.success) setOwnerId(result.data ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return ownerId;
};

export default useSiteOwner;
