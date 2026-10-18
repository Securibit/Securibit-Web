import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import GroupClient from "./GroupClient";

export const metadata: Metadata = {
  title: SEO.Group.title,
  description: SEO.Group.description,
};

const Page = () => <GroupClient />;

export default Page;
