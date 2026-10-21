import Link from "next/link";
import { ActivitySectionProps } from "@/types/Activity/ActivitySection";

// 分組列表的一組：灰色小標題（右邊可以有「全部」），下面是內容
const ActivitySection = (props: ActivitySectionProps) => (
  <section>
    <div className="mb-2 flex items-center justify-between px-5">
      <h2 className="text-[13px] font-normal text-ink-muted">{props.title}</h2>
      {props.href && (
        <Link href={props.href} className="text-[13px] text-accent hover:underline">
          全部
        </Link>
      )}
    </div>
    {props.children}
  </section>
);

export default ActivitySection;
