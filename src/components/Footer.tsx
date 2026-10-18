import Link from "next/link";

const Footer = () => {
  return (
    <footer>
      <hr className="h-px my-2 bg-gray-blue-200 border-0 dark:bg-gray-blue-700" />
      <div className="flex flex-col items-center gap-1 mb-3 text-sm sm:flex-row sm:justify-center sm:gap-4">
        <p suppressHydrationWarning>
          © Bityo {new Date().getFullYear()}. TOTP 2FA 二步驟驗證器
        </p>
        <nav className="flex gap-4 text-gray-blue-500 dark:text-gray-blue-400">
          <Link href="/about" className="hover:text-tpp transition-colors">關於我們</Link>
          <Link href="/disclaimer" className="hover:text-tpp transition-colors">免責聲明</Link>
        </nav>
      </div>
    </footer>
  )
}

export default Footer;
