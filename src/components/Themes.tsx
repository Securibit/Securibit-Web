"use client";

import { faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

const subscribe = () => () => {};

const Themes = () => {
  const { resolvedTheme, setTheme } = useTheme();
  // 伺服器端不知道使用者的主題，掛載到瀏覽器後才顯示，避免 hydration 不一致
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  if (!mounted) return null;

  return (
    <button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} type="button" className="flex items-center font-normal w-full sm:w-fit hover:text-tpp transition-colors">
      {
        resolvedTheme === 'dark' ? (
          <>
            <FontAwesomeIcon icon={faSun} className='mr-1 w-4' />
            <p>亮色模式</p>
          </>
        ) : (
          <>
            <FontAwesomeIcon icon={faMoon} className='mr-1 w-4' />
            <p>暗色模式</p>
          </>
        )
      }
    </button>
  )
}

export default Themes;
