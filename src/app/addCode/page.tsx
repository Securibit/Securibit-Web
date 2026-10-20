import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import AddCodeClient from "./AddCodeClient";

export const metadata: Metadata = {
  title: SEO.AddCode.title,
  description: SEO.AddCode.description,
};

// 加密群組要解鎖才能使用，由頁面裡看的群組各自處理（沒加密的群組不用解鎖）
const Page = () => <AddCodeClient />;

export default Page;
