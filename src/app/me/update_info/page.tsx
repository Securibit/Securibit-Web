import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import { SettingsTab } from "@/types/Profile/UpdateInfoClient";
import UpdateInfoClient from "./UpdateInfoClient";

export const metadata: Metadata = {
  title: SEO.UpdateInfo.title,
  description: SEO.UpdateInfo.description,
};

// ?tab=notifications 直接打開「通知」分頁（通知面板、隱私權政策的連結會帶）
const Page = async ({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) => {
  const { tab } = await searchParams;
  const initialTab: SettingsTab = tab === "notifications" ? "notifications" : "account";
  return <UpdateInfoClient initialTab={initialTab} />;
};

export default Page;
