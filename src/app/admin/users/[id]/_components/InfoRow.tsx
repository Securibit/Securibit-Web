import { InfoRowProps } from "@/types/Admin/InfoRow";

// 使用者詳情的一列規格：左邊 tech-label 欄位名，右邊等寬字的值（放在 <dl> 裡）
const InfoRow = (props: InfoRowProps) => (
  <div className="grid gap-1 border-b border-line py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
    <dt className="tech-label pt-0.5">{props.label}</dt>
    <dd className="min-w-0 break-words font-mono text-sm text-ink">{props.children}</dd>
  </div>
);

export default InfoRow;
