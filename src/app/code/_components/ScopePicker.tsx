"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faPlus } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import { ScopePickerProps } from "@/types/Code/ScopePicker";

const pillClass = (active: boolean) =>
  cn(
    "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-[15px] transition-colors",
    active ? "bg-ink text-surface" : "bg-surface-1 text-ink hover:bg-line/60"
  );

// 驗證碼頁最上面的切換：我的（預設群組，排第一）/ 家人 / 公司 … / ＋ 群組
const ScopePicker = (props: ScopePickerProps) => {
  // 預設群組排第一，其餘維持原順序
  const groups = [...props.groups.filter((group) => group.is_default), ...props.groups.filter((group) => !group.is_default)];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="驗證碼來源">
      {groups.map((group) => {
        const active = props.selected === group.id;
        return (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={pillClass(active)}
            onClick={() => props.onSelect(group.id)}
          >
            {group.encrypted && <FontAwesomeIcon icon={faLock} className="w-2.5" aria-label="已加密" />}
            {group.name}
            {group.is_default && <span className={cn("text-[13px]", active ? "text-surface/70" : "text-accent")}>預設</span>}
          </button>
        );
      })}
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
