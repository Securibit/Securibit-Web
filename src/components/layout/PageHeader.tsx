import { PageHeaderProps } from "@/types/Layout/PageHeader";

// 頁面標題區塊
const PageHeader = (props: PageHeaderProps) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-blue-900 dark:text-white">{props.title}</h1>
        {props.subtitle && (
          <p className="mt-1 text-sm text-gray-blue-500 dark:text-gray-blue-400">{props.subtitle}</p>
        )}
      </div>
      {props.right && <div className="flex flex-wrap gap-2">{props.right}</div>}
    </div>
  );
};

export default PageHeader;
