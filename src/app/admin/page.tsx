import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import AdminHomeClient from "./AdminHomeClient";

export const metadata: Metadata = {
  title: SEO.Admin.title,
  description: SEO.Admin.description,
};

const Page = () => <AdminHomeClient />;

export default Page;
