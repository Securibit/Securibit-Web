import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import VaultGate from "@/components/vault/VaultGate";
import CodeClient from "./CodeClient";

export const metadata: Metadata = {
  title: SEO.Code.title,
  description: SEO.Code.description,
};

// 有啟用金鑰加密時，先解鎖才顯示
const Page = () => (
  <VaultGate>
    <CodeClient />
  </VaultGate>
);

export default Page;
