import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import AddCodeClient from "./AddCodeClient";

export const metadata: Metadata = {
  title: SEO.AddCode.title,
  description: SEO.AddCode.description,
};

const Page = () => <AddCodeClient />;

export default Page;
