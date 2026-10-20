import { PageHeaderProps } from "@/types/Layout/PageHeader";

// 頁面標題區塊：小標籤、顯示字標題、底下一條左端帶磷光的分隔線
const PageHeader = (props: PageHeaderProps) => {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {props.index && <p className="tech-label mb-2">{props.index}</p>}
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{props.title}</h1>
          {props.subtitle && <p className="mt-2 text-sm text-ink-muted">{props.subtitle}</p>}
        </div>
        {props.right && <div className="flex flex-wrap gap-2">{props.right}</div>}
      </div>
      <div className="rule-accent mt-4" />
    </div>
  );
};

export default PageHeader;
