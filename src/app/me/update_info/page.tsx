import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import UpdateInfoClient from "./UpdateInfoClient";

export const metadata: Metadata = {
  title: SEO.UpdateInfo.title,
  description: SEO.UpdateInfo.description,
};

const Page = () => <UpdateInfoClient />;

export default Page;
