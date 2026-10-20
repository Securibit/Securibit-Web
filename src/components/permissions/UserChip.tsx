"use client";

import { Avatar } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import { UserChipProps } from "@/types/Permission/UserChip";

const TEXT_SIZE = {
  sm: { name: "text-[15px]", sub: "text-[13px]" },
  md: { name: "text-[17px]", sub: "text-[13px]" },
  lg: { name: "text-[22px] font-semibold", sub: "text-[15px]" },
};

// 名稱的第一個字（用 Array.from 才不會把 emoji 切成一半）
const firstChar = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? "?";

// 圓頭像 + 名稱 + 灰字的 @ID（沒有 @ID 時改顯示 Email）；使用者已刪除時傳 null
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
    <div className={cn("flex min-w-0 items-center gap-3", props.className)}>
      <Avatar
        size={size}
        radius="full"
        src={user?.photo_url ?? undefined}
        name={user ? user.name || "?" : undefined}
        getInitials={firstChar}
        icon={user ? undefined : <FontAwesomeIcon icon={faUser} className="w-3.5" />}
        showFallback
        className="shrink-0 bg-surface-1 text-ink"
        classNames={{ name: "font-semibold" }}
      />
      <div className="min-w-0">
        <p className={cn("truncate text-ink", text.name, !user && "text-ink-muted")}>
          {user ? user.name || "（未命名）" : "已刪除的使用者"}
        </p>
        {sub && <p className={cn("truncate text-ink-muted", text.sub)}>{sub}</p>}
      </div>
    </div>
  );
};

export default UserChip;
