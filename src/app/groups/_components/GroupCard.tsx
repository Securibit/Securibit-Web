"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faLock } from "@fortawesome/free-solid-svg-icons";
import { GroupCardProps } from "@/types/Group/GroupCard";

// 群組列表的一列：名稱（預設、加密、擁有者標示）、成員數與驗證碼數、右箭頭；整列可按
const GroupCard = (props: GroupCardProps) => {
  const { group } = props;

  return (
    <li>
      <button
        type="button"
        onClick={props.onOpen}
        className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-surface-1"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[17px] text-ink">
            {group.encrypted && <FontAwesomeIcon icon={faLock} className="w-3 shrink-0 text-ink-muted" aria-label="已加密" />}
            <span className="truncate">{group.name}</span>
            {group.is_default && (
              <span className="shrink-0 rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-accent">預設</span>
            )}
            {group.is_owner && (
              <span className="shrink-0 rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-ink-muted">擁有者</span>
            )}
          </p>
          <p className="truncate text-[15px] text-ink-muted tabular-nums">
            {group.member_count} 位成員 · {group.account_count} 筆驗證碼
          </p>
        </div>
        <FontAwesomeIcon icon={faChevronRight} className="w-2.5 shrink-0 text-ink-muted" />
      </button>
    </li>
  );
};

export default GroupCard;
