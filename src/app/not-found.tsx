import type { Metadata } from "next";
import Link from "next/link";
import SEO from "@/config/SEO.json";

export const metadata: Metadata = {
  title: SEO.NotFound.title,
  description: SEO.NotFound.description,
};

// 404：置中，大字、一行說明、一個藍色連結
const NotFound = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 py-12 text-center">
      <p className="text-[72px] font-semibold tracking-tight tabular-nums sm:text-[96px]">404</p>
      <p className="mt-2 text-[21px] text-ink-muted">找不到這個頁面</p>
      <Link href="/" className="link-arrow mt-6 text-[17px]">
        回到首頁
      </Link>
    </div>
  );
};

export default NotFound;
