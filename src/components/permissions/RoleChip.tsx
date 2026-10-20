"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { RoleChipProps } from "@/types/Permission/RoleChip";

// 沒設定顏色的身分組用的灰（給 <input type="color"> 當預設值）
export const ROLE_FALLBACK_COLOR = "#6E6E73";

// 身分組標籤：灰底圓角藥丸，有顏色就在前面放一個色點；有 onRemove 時多一個移除鈕
const RoleChip = (props: RoleChipProps) => {
  const { role } = props;
  const color = role.color || null;

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-ink">
      {/* 顏色用圓點表示：像幣友綠這種亮色直接當文字色，在白底上會看不清楚 */}
      {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
      <span className="truncate">{role.name}</span>
      {props.onRemove && (
        <button
          type="button"
          onClick={props.onRemove}
          aria-label={`移除身分組 ${role.name}`}
          className="-mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-60 hover:opacity-100"
        >
          <FontAwesomeIcon icon={faXmark} className="w-2.5" />
        </button>
      )}
    </span>
  );
};

export default RoleChip;
