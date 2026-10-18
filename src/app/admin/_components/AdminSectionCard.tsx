import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AdminSectionCardProps } from "@/types/Admin/AdminSectionCard";

// 總覽頁的區塊入口
const AdminSectionCard = (props: AdminSectionCardProps) => (
  <Link
    href={props.href}
    className="group flex gap-4 rounded-lg border border-gray-blue-200 bg-white p-4 shadow-sm transition-colors hover:border-tpp dark:border-gray-blue-700 dark:bg-gray-blue-800 dark:hover:border-tpp"
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tpp/15 text-tpp">
      <FontAwesomeIcon icon={props.icon} className="w-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-gray-blue-900 group-hover:text-tpp dark:text-white">{props.title}</span>
        {props.count !== undefined && (
          <span className="text-xl font-bold tabular-nums text-gray-blue-900 dark:text-white">{props.count}</span>
        )}
      </span>
      <span className="mt-1 block text-sm text-gray-blue-500 dark:text-gray-blue-400">{props.description}</span>
    </span>
  </Link>
);

export default AdminSectionCard;
