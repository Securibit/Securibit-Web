import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import InviteClient from "./InviteClient";

export const metadata: Metadata = {
  title: SEO.Invite.title,
  description: SEO.Invite.description,
};

const Page = () => <InviteClient />;

export default Page;
