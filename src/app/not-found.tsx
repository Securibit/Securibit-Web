import type { Metadata } from "next";
import Link from "next/link";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import SEO from "@/config/SEO.json";

export const metadata: Metadata = {
  title: SEO.NotFound.title,
  description: SEO.NotFound.description,
};

// 404：斜線填充的面板，中間一個大大的等寬讀數
const NotFound = () => {
  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-5 py-12">
      <div className="panel hatch boot w-full max-w-lg p-8 text-center sm:p-12">
        <p className="tech-label flex items-center justify-center gap-2">
          <span className="led led-alarm" aria-hidden />
          ERROR // ROUTE
        </p>
        <p className="readout glow mt-6 text-7xl font-medium text-phos sm:text-8xl">404</p>
        <p className="tech-label mt-3">NOT FOUND</p>
        <p className="mt-6 text-ink-muted">找不到這個頁面</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 border border-line-strong bg-surface-1 px-4 py-2 font-display text-sm tracking-[0.12em] text-ink transition-colors hover:border-phos hover:text-phos"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-3.5" />
          回到首頁
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
