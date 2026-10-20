import type { Metadata } from "next";
import { Suspense } from "react";
import SEO from "@/config/SEO.json";
import GroupClient from "./GroupClient";

export const metadata: Metadata = {
  title: SEO.Group.title,
  description: SEO.Group.description,
};

// GroupClient 會讀 ?tab=，useSearchParams 需要 Suspense 邊界
const Page = () => (
  <Suspense>
    <GroupClient />
  </Suspense>
);

export default Page;
