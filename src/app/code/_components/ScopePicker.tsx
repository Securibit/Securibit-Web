"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import { ScopePickerProps } from "@/types/Code/ScopePicker";

const pillClass = (active: boolean) =>
  cn(
    "shrink-0 rounded-full px-4 py-1.5 text-[15px] transition-colors",
    active ? "bg-ink text-surface" : "bg-surface-1 text-ink hover:bg-line/60"
  );

// 驗證碼頁最上面的切換：我的 / 家人 / 公司 … / ＋ 群組
const ScopePicker = (props: ScopePickerProps) => {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="驗證碼來源">
      <button type="button" role="tab" aria-selected={props.selected === ''} className={pillClass(props.selected === '')} onClick={() => props.onSelect('')}>
        我的
      </button>
      {props.groups.map((group) => (
        <button
          key={group.id}
          type="button"
          role="tab"
          aria-selected={props.selected === group.id}
          className={pillClass(props.selected === group.id)}
          onClick={() => props.onSelect(group.id)}
        >
          {group.name}
        </button>
      ))}
      {props.onCreate && (
        <button type="button" onClick={props.onCreate} className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[15px] text-accent hover:bg-surface-1">
          <FontAwesomeIcon icon={faPlus} className="w-3" />
          群組
        </button>
      )}
    </div>
  );
};

export default ScopePicker;
