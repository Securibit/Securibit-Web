import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import UsersClient from "./UsersClient";

export const metadata: Metadata = {
  title: SEO.AdminUsers.title,
  description: SEO.AdminUsers.description,
};

const Page = () => <UsersClient />;

export default Page;
