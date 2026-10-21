import { PageHeaderProps } from "@/types/Layout/PageHeader";

// 頁面標題：像 iOS 的大標題，右邊放這頁的主要動作
const PageHeader = (props: PageHeaderProps) => {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[34px] font-bold tracking-tight text-ink">{props.title}</h1>
        {props.subtitle && <p className="mt-1 text-[15px] text-ink-muted">{props.subtitle}</p>}
      </div>
      {props.right && <div className="flex flex-wrap items-center gap-3 pb-1.5">{props.right}</div>}
    </div>
  );
};

export default PageHeader;
