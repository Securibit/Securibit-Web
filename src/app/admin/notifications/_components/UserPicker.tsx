"use client";

import { useEffect, useRef, useState } from "react";
import { useDebounce } from "react-use";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import UserChip from "@/components/permissions/UserChip";
import Spinner from "@/components/ui/Loading/Spinner";
import { loadAdminUsers } from "@/lib/admin/admin";
import { AdminUser } from "@/types/Admin/Admin";
import { BroadcastUserPickerProps } from "@/types/Admin/Broadcast";

const RESULT_LIMIT = 8;
// 一次最多指定的人數（更多的話用身分組或所有使用者）
export const USER_PICK_MAX = 200;

// 發送通知的使用者多選：上面是已選的人，下面搜尋 Email、名稱或 @ID 加入
const UserPicker = (props: BroadcastUserPickerProps) => {
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  useDebounce(() => setSearch(keyword.trim()), 300, [keyword]);

  // 搜尋結果與它對應的搜尋字
  const [results, setResults] = useState<{ key: string; users: AdminUser[] }>();
  const seq = useRef(0);

  useEffect(() => {
    if (!search) return;
    const current = ++seq.current;
    loadAdminUsers(search, 0, RESULT_LIMIT).then((result) => {
      if (current !== seq.current) return;
      setResults({ key: search, users: result.success ? result.data.users : [] });
    });
  }, [search]);

  const selectedIds = new Set(props.selected.map((user) => user.id));
  const loading = !!search && results?.key !== search;
  const shown = search && results?.key === search ? results.users.filter((user) => !selectedIds.has(user.id)) : [];
  const full = props.selected.length >= USER_PICK_MAX;

  return (
    <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
      {props.selected.map((user) => (
        <div key={user.id} className="flex items-center gap-4 px-5 py-3">
          <UserChip user={user} showEmail size="sm" className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={() => props.onChange(props.selected.filter((item) => item.id !== user.id))}
            aria-label={`移除 ${user.name || user.email}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-1 hover:text-alarm"
          >
            <FontAwesomeIcon icon={faXmark} className="w-3.5" />
          </button>
        </div>
      ))}

      <div className="px-5 py-3">
        <label className="flex items-center gap-2 rounded-[12px] bg-surface-1 px-3.5 py-2 text-[17px] text-ink-muted focus-within:ring-2 focus-within:ring-accent/40">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="w-4 shrink-0" />
          <input
            type="search"
            aria-label="搜尋使用者"
            placeholder={full ? `最多指定 ${USER_PICK_MAX} 位` : "搜尋 Email、名稱或 @ID"}
            value={keyword}
            disabled={full}
            onChange={(e) => setKeyword(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted"
          />
          {keyword && (
            <button type="button" onClick={() => setKeyword("")} aria-label="清除" className="hover:text-ink">
              <FontAwesomeIcon icon={faXmark} className="w-3.5" />
            </button>
          )}
        </label>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      {!loading && search && shown.length === 0 && (
        <p className="px-5 py-3 text-[15px] text-ink-muted">沒有符合的使用者</p>
      )}
      {!loading &&
        shown.map((user) => (
          <button
            key={user.id}
            type="button"
            disabled={full}
            onClick={() => props.onChange([...props.selected, user])}
            className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-surface-1 disabled:opacity-40"
          >
            <UserChip user={user} showEmail size="sm" className="min-w-0 flex-1" />
            <FontAwesomeIcon icon={faPlus} className="w-3.5 shrink-0 text-accent" />
          </button>
        ))}
    </div>
  );
};

export default UserPicker;
