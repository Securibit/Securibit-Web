import { CardProps } from "@/types/HomePage/Card";

// 規格表的一列：編號、項目、說明
const HomePageCard = (props: CardProps) => {
  return (
    <li className="grid grid-cols-[3rem_1fr] gap-x-4 gap-y-1 border-b border-line py-5 sm:grid-cols-[4rem_13rem_1fr]">
      <span className="readout pt-1 text-sm text-ink-dim">{props.index}</span>
      <h3 className="font-display text-lg font-semibold text-ink">{props.title}</h3>
      <p className="col-start-2 text-ink-muted sm:col-start-3">{props.description}</p>
    </li>
  )
}

export default HomePageCard;
