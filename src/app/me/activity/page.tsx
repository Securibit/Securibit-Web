import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import { ActivityTab } from "@/types/Activity/ActivityClient";
import ActivityClient from "./ActivityClient";

export const metadata: Metadata = {
  title: SEO.MyActivity.title,
  description: SEO.MyActivity.description,
};

// ?tab=activity 直接打開「操作」分頁（個人頁面的「全部」連結會帶）
const Page = async ({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) => {
  const { tab } = await searchParams;
  const initialTab: ActivityTab = tab === "activity" ? "activity" : "login";
  return <ActivityClient initialTab={initialTab} />;
};

export default Page;
