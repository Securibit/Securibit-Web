import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import CodeClient from "./CodeClient";

export const metadata: Metadata = {
  title: SEO.Code.title,
  description: SEO.Code.description,
};

const Page = () => <CodeClient />;

export default Page;
