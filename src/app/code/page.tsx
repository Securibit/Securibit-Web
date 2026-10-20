import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import CodeClient from "./CodeClient";

export const metadata: Metadata = {
  title: SEO.Code.title,
  description: SEO.Code.description,
};

// 加密群組要解鎖才能使用，由頁面裡看的群組各自處理（沒加密的群組不用解鎖）
const Page = () => <CodeClient />;

export default Page;
