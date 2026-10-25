"use client";

import { useEffect, useState } from "react";
import { Switch } from "@heroui/react";
import Spinner from "@/components/ui/Loading/Spinner";
import { showError } from "@/lib/errorDialog";
import { loadNotificationPrefs, setNotificationPref } from "@/lib/notifications/notifications";
import { NOTIFICATION_CATEGORIES, notificationTypeDef } from "@/lib/notifications/types";
import { NotificationPref } from "@/types/Notification/Notification";

// 帳戶設定的「通知」分頁：三大類分組，每種一個開關，切換就存；重要公告顯示但鎖住。
// 種類、順序、預設與能不能關都照資料庫的 notification_prefs_get()，名稱與說明在 lib/notifications/types.ts
const NotificationSettings = () => {
  // null：載入中；undefined：載入失敗
  const [prefs, setPrefs] = useState<NotificationPref[] | null | undefined>(null);
  const [saving, setSaving] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    loadNotificationPrefs().then((result) => {
      if (cancelled) return;
      if (result.success) {
        setPrefs(result.data);
      } else {
        setPrefs(undefined);
        showError("載入通知設定失敗", result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (prefs === null) return <Spinner block label="載入通知設定…" />;
  if (prefs === undefined) {
    return <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">讀不到通知設定，請稍後再試</div>;
  }

  const toggle = async (type: string, enabled: boolean) => {
    const previous = prefs;
    setPrefs(prefs.map((pref) => (pref.type === type ? { ...pref, enabled } : pref)));
    setSaving(type);
    const result = await setNotificationPref(type, enabled);
    setSaving(undefined);
    if (!result.success) {
      setPrefs(previous);
      showError("儲存通知設定失敗", result.message);
      return;
    }
    if (result.data.length > 0) setPrefs(result.data);
  };

  return (
    <div className="flex flex-col gap-8">
      {NOTIFICATION_CATEGORIES.map((category) => {
        const rows = prefs.filter((pref) => pref.category === category.key);
        if (rows.length === 0) return null;
        return (
          <section key={category.key}>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">{category.name}</h2>
            <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
              {rows.map((pref) => {
                const def = notificationTypeDef(pref.type);
                const name = def?.name ?? pref.type;
                return (
                  <div key={pref.type} className="flex items-center justify-between gap-6 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-[17px]">{name}</p>
                      {def?.description && <p className="text-[13px] text-ink-muted">{def.description}</p>}
                    </div>
                    <Switch
                      aria-label={name}
                      isSelected={pref.locked || pref.enabled}
                      isDisabled={pref.locked || saving === pref.type}
                      onValueChange={(on) => toggle(pref.type, on)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="-mt-6 px-5 text-[13px] text-ink-muted">
        關掉後不會再跳出通知或推播，但鈴鐺裡還是看得到。這份設定網站與 App 共用；App 的推播也可以在系統設定裡關閉
      </p>
    </div>
  );
};

export default NotificationSettings;
