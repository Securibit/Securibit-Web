import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import GroupsAdminClient from "./GroupsAdminClient";

export const metadata: Metadata = {
  title: SEO.AdminGroups.title,
  description: SEO.AdminGroups.description,
};

const Page = () => <GroupsAdminClient />;

export default Page;
