import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import GroupDetailAdminClient from "./GroupDetailAdminClient";

export const metadata: Metadata = {
  title: SEO.AdminGroup.title,
  description: SEO.AdminGroup.description,
};

const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  // 換到另一個群組時重新掛載，分頁與資料不會沿用
  return <GroupDetailAdminClient key={id} groupId={id} />;
};

export default Page;
