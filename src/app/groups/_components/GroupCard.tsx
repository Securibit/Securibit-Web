"use client";

import { Card, CardBody, Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown, faKey, faUsers } from "@fortawesome/free-solid-svg-icons";
import { GroupCardProps } from "@/types/Group/GroupCard";

// 群組列表的一張卡片：名稱、說明、成員數、驗證碼數、擁有者標記
const GroupCard = (props: GroupCardProps) => {
  const { group } = props;

  return (
    <Card
      isPressable
      onPress={props.onOpen}
      shadow="sm"
      className="border border-gray-blue-200 dark:border-gray-blue-700 dark:bg-gray-blue-800"
    >
      <CardBody className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 truncate text-lg font-semibold text-gray-blue-900 dark:text-white">{group.name}</h2>
          {group.is_owner && (
            <Chip
              size="sm"
              variant="flat"
              color="warning"
              startContent={<FontAwesomeIcon icon={faCrown} className="ml-1 w-3" />}
              className="flex-shrink-0"
            >
              擁有者
            </Chip>
          )}
        </div>
        <p className="line-clamp-2 min-h-[2.5rem] text-sm text-gray-blue-500 dark:text-gray-blue-400">
          {group.description || "沒有說明"}
        </p>
        <div className="flex gap-4 text-sm text-gray-blue-600 dark:text-gray-blue-300">
          <span className="flex items-center gap-1.5">
            <FontAwesomeIcon icon={faUsers} className="w-3.5" />
            {group.member_count} 位成員
          </span>
          <span className="flex items-center gap-1.5">
            <FontAwesomeIcon icon={faKey} className="w-3.5" />
            {group.account_count} 個驗證碼
          </span>
        </div>
      </CardBody>
    </Card>
  );
};

export default GroupCard;
