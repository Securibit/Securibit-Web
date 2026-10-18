import { InfoRowProps } from "@/types/Admin/InfoRow";

// 使用者詳情的一列「標題：內容」（放在 <dl> 裡）
const InfoRow = (props: InfoRowProps) => (
  <div className="grid gap-1 py-2 sm:grid-cols-[8rem_1fr] sm:gap-4">
    <dt className="text-sm text-gray-blue-500 dark:text-gray-blue-400">{props.label}</dt>
    <dd className="min-w-0 break-words text-sm text-gray-blue-900 dark:text-white">{props.children}</dd>
  </div>
);

export default InfoRow;
