import type { Metadata } from "next";
import Link from "next/link";
import SEO from "@/config/SEO.json";

export const metadata: Metadata = {
  title: SEO.NotFound.title,
  description: SEO.NotFound.description,
};

const NotFound = () => {
  return (
    <div className="flex items-center justify-center w-full h-96 m-auto">
      <div className="text-center">
        <p className="text-5xl">404</p>
        <p className="mb-4">找不到這個頁面</p>
        <Link href="/" className="text-tpp underline underline-offset-4">回到首頁</Link>
      </div>
    </div>
  );
};

export default NotFound;
