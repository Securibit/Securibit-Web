import { InfoRowProps } from "@/types/Admin/InfoRow";

// 使用者詳情分組列表的一列：左邊欄位名，右邊灰字的值（放在 <dl> 裡）
const InfoRow = (props: InfoRowProps) => (
  <div className="flex items-center justify-between gap-6 px-5 py-3">
    <dt className="shrink-0 text-[17px]">{props.label}</dt>
    <dd className="min-w-0 text-right text-[17px] text-ink-muted">{props.children}</dd>
  </div>
);

export default InfoRow;
