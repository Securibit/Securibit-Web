import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { AdminSectionCardProps } from "@/types/Admin/AdminSectionCard";

// 總覽頁的區塊入口：規格表的一列（編號、名稱與說明、讀數、箭頭）
const AdminSectionCard = (props: AdminSectionCardProps) => (
  <li>
    <Link
      href={props.href}
      className="group grid grid-cols-[3rem_1fr_auto] items-center gap-x-4 border-b border-line py-4 transition-colors hover:bg-ink/5 sm:grid-cols-[4rem_11rem_1fr_auto]"
    >
      <span className="readout text-sm text-ink-dim">{props.index}</span>
      <span className="font-display text-lg font-semibold text-ink transition-colors group-hover:text-phos">{props.title}</span>
      <span className="col-start-2 text-sm text-ink-muted sm:col-start-3">{props.description}</span>
      <span className="col-start-3 row-start-1 flex items-center gap-4 sm:col-start-4">
        {props.count !== undefined && (
          <span className="readout text-xl text-ink">{props.count}</span>
        )}
        <span className="flex h-8 w-8 items-center justify-center border border-line text-ink-muted transition-colors group-hover:border-phos group-hover:text-phos">
          <FontAwesomeIcon icon={faArrowRight} className="w-3" />
        </span>
      </span>
    </Link>
  </li>
);

export default AdminSectionCard;
