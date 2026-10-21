"use client";

import { useContext } from "react";
import { AuthContextValue } from "@/types/Auth/Auth";
import { AuthContext } from "./AuthProvider";

/** 讀登入狀態。只能在 AuthProvider 底下用（Layout 已經包了全站） */
const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth 必須放在 AuthProvider 底下使用。");
  }

  return value;
};

export default useAuth;
