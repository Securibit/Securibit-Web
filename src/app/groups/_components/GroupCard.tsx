"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { GroupCardProps } from "@/types/Group/GroupCard";

// 群組列表的一列：名稱、說明、成員數、驗證碼數、擁有者標記；整列可按
const GroupCard = (props: GroupCardProps) => {
  const { group } = props;

  return (
    <li className="border-b border-line">
      <button
        type="button"
        onClick={props.onOpen}
        className="group flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-ink/5 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-display text-base font-semibold text-ink group-hover:text-phos">{group.name}</p>
            {group.is_owner && (
              <span className="tech-label flex-shrink-0 border border-phos px-1.5 py-0.5 text-phos">OWNER</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-muted">{group.description || "沒有說明"}</p>
        </div>

        {/* 成員數 / 驗證碼數 */}
        <dl className="hidden flex-shrink-0 items-center gap-6 sm:flex">
          <div className="text-right">
            <dt className="tech-label">MEMBERS</dt>
            <dd className="font-mono text-sm text-ink tabular-nums">{group.member_count}</dd>
          </div>
          <div className="text-right">
            <dt className="tech-label">CODES</dt>
            <dd className="font-mono text-sm text-ink tabular-nums">{group.account_count}</dd>
          </div>
        </dl>
        {/* 手機：縮成一行 */}
        <p className="flex-shrink-0 font-mono text-xs text-ink-dim tabular-nums sm:hidden">
          {group.member_count}人 · {group.account_count}碼
        </p>

        <FontAwesomeIcon icon={faChevronRight} className="w-3 flex-shrink-0 text-ink-dim transition-colors group-hover:text-phos" />
      </button>
    </li>
  );
};

export default GroupCard;
