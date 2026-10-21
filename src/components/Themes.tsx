"use client";

import { faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { ThemesProps } from "@/types/Themes/Themes";

const subscribe = () => () => {};

const Themes = (props: ThemesProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  // 伺服器端不知道使用者的主題，掛載到瀏覽器後才顯示，避免 hydration 不一致
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  // 佔位，避免掛載後版面跳動
  if (!mounted) return <span className={cn("inline-block h-6", props.showLabel ? "w-24" : "w-6")} />;

  const dark = resolvedTheme === 'dark';
  const label = dark ? '切換成亮色' : '切換成暗色';

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={cn("flex items-center gap-2 text-ink/70 transition-colors hover:text-ink", props.showLabel && "text-[17px]")}
    >
      <FontAwesomeIcon icon={dark ? faSun : faMoon} className="w-4" />
      {props.showLabel && <span>{dark ? '亮色模式' : '暗色模式'}</span>}
    </button>
  );
};

export default Themes;
