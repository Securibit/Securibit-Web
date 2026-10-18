"use client";

import { Avatar } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons";
import { UserChipProps } from "@/types/Permission/UserChip";

const TEXT_SIZE = {
  sm: { name: "text-sm", sub: "text-xs" },
  md: { name: "text-sm sm:text-base", sub: "text-xs sm:text-sm" },
  lg: { name: "text-base sm:text-lg", sub: "text-sm" },
};

// 名稱的第一個字（用 Array.from 才不會把 emoji 切成一半）
const firstChar = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? "?";

// 大頭照 + 名稱 + 第二行 @ID（沒有 @ID 時改顯示 Email）；使用者已刪除時傳 null
const UserChip = (props: UserChipProps) => {
  const { user } = props;
  const size = props.size ?? "md";
  const text = TEXT_SIZE[size];

  const sub = !user
    ? null
    : props.showEmail
      ? user.email || null
      : user.username
        ? `@${user.username}`
        : user.email || null;

  return (
    <div className={`flex min-w-0 items-center gap-2 ${props.className ?? ""}`}>
      <Avatar
        size={size}
        src={user?.photo_url ?? undefined}
        name={user ? user.name || "?" : undefined}
        getInitials={firstChar}
        icon={user ? undefined : <FontAwesomeIcon icon={faUser} className="w-3.5" />}
        showFallback
        className="flex-shrink-0"
      />
      <div className="min-w-0">
        <p className={`truncate font-medium text-gray-blue-900 dark:text-white ${text.name}`}>
          {user ? user.name || "（未命名）" : "已刪除的使用者"}
        </p>
        {sub && (
          <p className={`truncate text-gray-blue-500 dark:text-gray-blue-400 ${text.sub}`}>{sub}</p>
        )}
      </div>
    </div>
  );
};

export default UserChip;
