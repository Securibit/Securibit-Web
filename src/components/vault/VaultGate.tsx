"use client";

import Spinner from "@/components/ui/Loading/Spinner";
import PageContent from "@/components/layout/PageContent";
import { VaultGateProps } from "@/types/Vault/VaultGate";
import useVault from "./useVault";
import VaultUnlock from "./VaultUnlock";

// 有啟用加密時，解鎖後才顯示驗證碼相關頁面
const VaultGate = (props: VaultGateProps) => {
  const { status } = useVault();

  if (status === "loading") return <Spinner block label="確認加密狀態…" />;
  if (status === "locked") {
    return (
      <PageContent>
        <VaultUnlock />
      </PageContent>
    );
  }
  return <>{props.children}</>;
};

export default VaultGate;
