import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import VaultGate from "@/components/vault/VaultGate";
import AddCodeClient from "./AddCodeClient";

export const metadata: Metadata = {
  title: SEO.AddCode.title,
  description: SEO.AddCode.description,
};

// 有啟用金鑰加密時，先解鎖才顯示
const Page = () => (
  <VaultGate>
    <AddCodeClient />
  </VaultGate>
);

export default Page;
