"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import { CheckRowProps } from "@/types/Admin/Broadcast";

// 選擇列表的一列：整列可點，選中時右邊打勾
const CheckRow = (props: CheckRowProps) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={props.checked}
    disabled={props.disabled}
    onClick={props.onToggle}
    className={cn("flex w-full items-center justify-between gap-6 px-5 py-3 text-left hover:bg-surface-1 disabled:opacity-40 disabled:hover:bg-transparent")}
  >
    <span className="min-w-0">
      <span className="block text-[17px]">{props.children}</span>
      {props.description && <span className="block text-[13px] text-ink-muted">{props.description}</span>}
    </span>
    <FontAwesomeIcon icon={faCheck} className={cn("w-4 shrink-0 text-accent", !props.checked && "invisible")} />
  </button>
);

export default CheckRow;
