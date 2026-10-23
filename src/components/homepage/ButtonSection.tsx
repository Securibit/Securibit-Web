"use client";

import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import useAuth from "../auth/useAuth";

// Apple 的主視覺不放大按鈕，只放藍色文字連結
const ButtonSection = () => {
  const router = useRouter();
  const { user, login } = useAuth();

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center justify-center gap-8 text-[19px]">
        {/* 未登入時直接帶去 Google 登入，不要先跳到驗證碼頁再被擋回來 */}
        <button onClick={() => (user ? router.push('/code') : login())} className="link-arrow">
          {user ? '前往驗證碼' : '開始使用'}
        </button>
        <Link href="/about" className="link-arrow">
          進一步了解
        </Link>
      </div>
      {!user && (
        <p className="text-[13px] text-ink-muted">
          登入即表示你同意<Link href="/disclaimer" className="text-accent hover:underline">免責聲明</Link>與
          <Link href="/privacy" className="text-accent hover:underline">隱私權政策</Link>
        </p>
      )}
    </div>
  )
}

export default ButtonSection;
