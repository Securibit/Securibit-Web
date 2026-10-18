"use client";

import { faCircleInfo, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next-nprogress-bar";
import useAuth from "../auth/useAuth";

const ButtonSection = () => {
  const router = useRouter();
  const { user, login } = useAuth();

  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:w-fit sm:grid-cols-2 items-center">
      <button
        // 未登入時直接帶去 Google 登入，不要先跳到驗證碼頁再被擋回來
        onClick={() => (user ? router.push('/code') : login())}
        className="flex items-center justify-center rounded-lg px-2 py-2 border-2 border-tpp hover:bg-tpp/50 dark:hover:bg-tpp/50 text-white"
      >
        <FontAwesomeIcon icon={faKey} className="mr-2 w-4" />
        {user ? '前往驗證碼' : '開始使用'}
      </button>
      <button
        onClick={() => router.push('/about')}
        className="flex items-center justify-center px-2 py-2 rounded-lg border-2 border-[#17FFAD] hover:bg-[#17FFAD]/50 dark:hover:bg-tpp/50 text-white"
      >
        <FontAwesomeIcon icon={faCircleInfo} className="mr-2 w-4" />
        了解更多
      </button>
    </div>
  )
}

export default ButtonSection;
