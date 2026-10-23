import Link from "next/link";

const Footer = () => {
  return (
    <footer className="bg-surface-1">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <p suppressHydrationWarning>Copyright © {new Date().getFullYear()} 幣友 BITYO 🤝 靈魂之神工作室 保留一切權利。</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/download" className="hover:underline">下載 App</Link>
          <Link href="/about" className="hover:underline">關於我們</Link>
          <Link href="/disclaimer" className="hover:underline">免責聲明</Link>
          <Link href="/privacy" className="hover:underline">隱私權政策</Link>
          <a href="https://github.com/Securibit" target="_blank" rel="noopener noreferrer" className="hover:underline">GitHub 開源專案</a>
        </nav>
      </div>
    </footer>
  )
}

export default Footer;
