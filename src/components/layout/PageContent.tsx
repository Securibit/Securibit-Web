import { cn } from "@/lib/utils";
import { PageContentProps } from "@/types/Layout/PageContent";

// 一般頁面的內容容器，統一左右與上方間距
const PageContent = (props: PageContentProps) => {
  return (
    <div className={cn("container mx-auto px-5 pt-8 pb-12", props.className)}>
      {props.children}
    </div>
  );
};

export default PageContent;
