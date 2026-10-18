"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { RoleChipProps } from "@/types/Permission/RoleChip";

// 沒設定顏色的身分組用灰色（gray-blue-400）
export const ROLE_FALLBACK_COLOR = "#9CA3AF";

// 身分組標籤：身分組顏色的小圓點 + 名稱，有 onRemove 時多一個移除鈕
const RoleChip = (props: RoleChipProps) => {
  const { role } = props;

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-blue-200 bg-gray-blue-50 px-2 py-0.5 text-xs font-medium text-gray-blue-800 dark:border-gray-blue-600 dark:bg-gray-blue-700 dark:text-gray-blue-100">
      <span
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: role.color || ROLE_FALLBACK_COLOR }}
      />
      <span className="truncate">{role.name}</span>
      {props.onRemove && (
        <button
          type="button"
          onClick={props.onRemove}
          aria-label={`移除身分組 ${role.name}`}
          className="-mr-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-gray-blue-400 transition-colors hover:bg-gray-blue-200 hover:text-gray-blue-700 dark:hover:bg-gray-blue-600 dark:hover:text-white"
        >
          <FontAwesomeIcon icon={faXmark} className="w-2.5" />
        </button>
      )}
    </span>
  );
};

export default RoleChip;
