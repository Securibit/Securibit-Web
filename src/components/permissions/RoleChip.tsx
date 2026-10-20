"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import { RoleChipProps } from "@/types/Permission/RoleChip";

// 沒設定顏色的身分組用的灰（同 --fg-dim；給 <input type="color"> 當預設值）
export const ROLE_FALLBACK_COLOR = "#7B8A84";

// 身分組標籤：方形、1px 邊框，邊框與文字用身分組顏色（沒顏色就灰階）；有 onRemove 時多一個移除鈕
const RoleChip = (props: RoleChipProps) => {
  const { role } = props;
  const color = role.color || null;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 border px-1.5 py-0.5 font-display text-[11px] font-semibold tracking-[0.08em]",
        !color && "border-line text-ink-muted"
      )}
      style={color ? { borderColor: color, color } : undefined}
    >
      <span
        className={cn("h-2 w-2 flex-shrink-0", !color && "bg-ink-dim")}
        style={color ? { backgroundColor: color } : undefined}
        aria-hidden
      />
      <span className="truncate">{role.name}</span>
      {props.onRemove && (
        <button
          type="button"
          onClick={props.onRemove}
          aria-label={`移除身分組 ${role.name}`}
          className="-mr-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center opacity-60 transition-opacity hover:opacity-100"
        >
          <FontAwesomeIcon icon={faXmark} className="w-2.5" />
        </button>
      )}
    </span>
  );
};

export default RoleChip;
