import type { Metadata } from "next";
import AuthCallbackClient from "./AuthCallbackClient";

export const metadata: Metadata = {
  title: "登入中",
  robots: { index: false },
};

const Page = () => <AuthCallbackClient />;

export default Page;
