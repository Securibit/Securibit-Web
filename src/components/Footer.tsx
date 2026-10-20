import Link from "next/link";

// 底部狀態列：像儀表的底欄，等寬小字
const Footer = () => {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="container mx-auto flex flex-col gap-3 px-5 py-5 font-mono text-[11px] tracking-[0.08em] text-ink-dim sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2" suppressHydrationWarning>
          <span className="led" aria-hidden />
          © Bityo {new Date().getFullYear()} · TOTP 2FA 二步驟驗證器
        </p>
        <p className="hidden lg:block">RFC 6238 · SHA-1 / 256 / 512 · 6 / 8 DIGITS · 30 / 60 S</p>
        <nav className="flex gap-5 font-display text-xs tracking-[0.12em]">
          <Link href="/about" className="transition-colors hover:text-phos">關於我們</Link>
          <Link href="/disclaimer" className="transition-colors hover:text-phos">免責聲明</Link>
        </nav>
      </div>
    </footer>
  )
}

export default Footer;
