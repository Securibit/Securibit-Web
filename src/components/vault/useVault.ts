"use client";

import { useContext } from "react";
import { VaultContextValue } from "@/types/Vault/Vault";
import { VaultContext } from "./VaultProvider";

/** 讀金鑰加密狀態。只能在 VaultProvider 底下用（Layout 已經包了全站） */
const useVault = (): VaultContextValue => {
  const value = useContext(VaultContext);

  if (!value) {
    throw new Error("useVault 必須放在 VaultProvider 底下使用。");
  }

  return value;
};

export default useVault;
