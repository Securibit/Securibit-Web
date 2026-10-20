"use client";

import { faArrowRight, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "@heroui/react";
import { useRouter } from "nextjs-toploader/app";
import useAuth from "../auth/useAuth";

const ButtonSection = () => {
  const router = useRouter();
  const { user, login } = useAuth();

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button
        // 未登入時直接帶去 Google 登入，不要先跳到驗證碼頁再被擋回來
        onPress={() => (user ? router.push('/code') : login())}
        color="primary"
        size="lg"
        className="font-display tracking-[0.12em]"
        startContent={<FontAwesomeIcon icon={faKey} className="w-4" />}
      >
        {user ? '前往驗證碼' : '開始使用'}
      </Button>
      <Button
        onPress={() => router.push('/about')}
        variant="bordered"
        size="lg"
        className="border-line-strong font-display tracking-[0.12em] text-ink"
        endContent={<FontAwesomeIcon icon={faArrowRight} className="w-3.5" />}
      >
        怎麼運作
      </Button>
    </div>
  )
}

export default ButtonSection;
