import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import UserDetailClient from "./UserDetailClient";

export const metadata: Metadata = {
  title: SEO.AdminUser.title,
  description: SEO.AdminUser.description,
};

const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  // 換到另一位使用者時重新掛載，狀態（例如已顯示的 2FA）不會沿用
  return <UserDetailClient key={id} userId={id} />;
};

export default Page;
