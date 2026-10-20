import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import UserPageClient from "./UserPageClient";

export const metadata: Metadata = {
  title: SEO.UserPage.title,
  description: SEO.UserPage.description,
};

const Page = () => <UserPageClient />;

export default Page;
