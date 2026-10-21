import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { AdminSectionCardProps } from "@/types/Admin/AdminSectionCard";

// 總覽頁「管理」群組的一列：圖示、名稱，右邊讀數與箭頭，整列可點
const AdminSectionCard = (props: AdminSectionCardProps) => (
  <li>
    <Link href={props.href} className="flex items-center justify-between gap-6 px-5 py-3 hover:bg-surface-1">
      <span className="flex min-w-0 items-center gap-3 text-[17px]">
        {props.icon && <FontAwesomeIcon icon={props.icon} className="w-4 shrink-0 text-ink-muted" />}
        <span className="truncate">{props.title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3 text-[17px] text-ink-muted">
        {props.count !== undefined && <span className="tabular-nums">{props.count}</span>}
        <FontAwesomeIcon icon={faChevronRight} className="w-2.5" />
      </span>
    </Link>
  </li>
);

export default AdminSectionCard;
