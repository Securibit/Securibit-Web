import type { Metadata } from "next";
import UpdateInfoClient from "./UpdateInfoClient";

export const metadata: Metadata = {
  title: "更改個人資料 - TOTP 2FA",
};

const Page = () => <UpdateInfoClient />;

export default Page;
