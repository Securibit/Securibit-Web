import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import NotifyClient from "./NotifyClient";

export const metadata: Metadata = {
  title: SEO.AdminNotify.title,
  description: SEO.AdminNotify.description,
};

const Page = () => <NotifyClient />;

export default Page;
