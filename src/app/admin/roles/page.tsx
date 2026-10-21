import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import RolesClient from "./RolesClient";

export const metadata: Metadata = {
  title: SEO.AdminRoles.title,
  description: SEO.AdminRoles.description,
};

const Page = () => <RolesClient />;

export default Page;
