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
  if (!mounted) return <span className={cn("inline-block h-8", props.showLabel ? "w-24" : "w-8")} />;

  const dark = resolvedTheme === 'dark';
  const label = dark ? '亮色模式' : '暗色模式';

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 items-center gap-2 border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-phos",
        props.showLabel ? "px-3" : "w-8 justify-center"
      )}
    >
      <FontAwesomeIcon icon={dark ? faSun : faMoon} className="w-3.5" />
      {props.showLabel && <span className="font-display text-xs tracking-[0.12em]">{label}</span>}
    </button>
  );
};

export default Themes;
