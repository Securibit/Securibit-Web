import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import GroupsClient from "./GroupsClient";

export const metadata: Metadata = {
  title: SEO.Groups.title,
  description: SEO.Groups.description,
};

const Page = () => <GroupsClient />;

export default Page;
