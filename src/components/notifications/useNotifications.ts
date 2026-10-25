"use client";

import { useContext } from "react";
import { NotificationsContextValue } from "@/types/Notification/NotificationsProvider";
import { NotificationsContext } from "./NotificationsProvider";

/** 讀通知的未讀數與更新訊號。只能在 NotificationsProvider 底下用（Layout 已經包了全站） */
const useNotifications = (): NotificationsContextValue => {
  const value = useContext(NotificationsContext);

  if (!value) {
    throw new Error("useNotifications 必須放在 NotificationsProvider 底下使用。");
  }

  return value;
};

export default useNotifications;
