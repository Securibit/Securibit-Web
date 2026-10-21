import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import AuditClient from "./AuditClient";

export const metadata: Metadata = {
  title: SEO.AdminAudit.title,
  description: SEO.AdminAudit.description,
};

const Page = () => <AuditClient />;

export default Page;
