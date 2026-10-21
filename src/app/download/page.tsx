import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import { getLatestRelease } from "@/lib/release";
import DownloadClient from "./DownloadClient";

export const metadata: Metadata = {
  title: SEO.Download.title,
  description: SEO.Download.description,
};

// 整頁 10 分鐘重新產生一次；就算建置時 GitHub 讀不到，之後也會再試，不會一直卡在退回畫面
export const revalidate = 600;

const Page = async () => {
  const release = await getLatestRelease();
  return <DownloadClient release={release} />;
};

export default Page;
