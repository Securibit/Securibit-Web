import type { Metadata } from "next";
import MyPageClient from "./MyPageClient";

export const metadata: Metadata = {
  title: "我的頁面 - TOTP 2FA",
};

const Page = () => <MyPageClient />;

export default Page;
