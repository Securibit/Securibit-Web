import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import MyPageClient from "./MyPageClient";

export const metadata: Metadata = {
  title: SEO.MyPage.title,
  description: SEO.MyPage.description,
};

const Page = () => <MyPageClient />;

export default Page;
