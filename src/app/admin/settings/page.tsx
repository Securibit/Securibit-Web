import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import SettingsClient from "./SettingsClient";

export const metadata: Metadata = {
  title: SEO.AdminSettings.title,
  description: SEO.AdminSettings.description,
};

const Page = () => <SettingsClient />;

export default Page;
