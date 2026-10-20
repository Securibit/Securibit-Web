import { cn } from "@/lib/utils";
import { PageContentProps } from "@/types/Layout/PageContent";

// 一般頁面的內容容器，統一寬度與間距
const PageContent = (props: PageContentProps) => {
  return (
    <div className={cn("mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-6", props.className)}>
      {props.children}
    </div>
  );
};

export default PageContent;
