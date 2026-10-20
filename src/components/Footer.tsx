import Link from "next/link";

const Footer = () => {
  return (
    <footer className="bg-surface-1">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <p suppressHydrationWarning>Copyright © {new Date().getFullYear()} Bityo. 保留一切權利。</p>
        <nav className="flex gap-5">
          <Link href="/about" className="hover:underline">關於我們</Link>
          <Link href="/disclaimer" className="hover:underline">免責聲明</Link>
        </nav>
      </div>
    </footer>
  )
}

export default Footer;
