import { CardProps } from "@/types/HomePage/Card";

// 一區一個想法：小字主題、大標題、一段說明、（可選）一個畫面
const HomePageCard = (props: CardProps) => {
  return (
    <section className="border-t border-line/70 px-5 py-20 text-center sm:py-28">
      <p className="text-[15px] font-semibold text-ink-muted">{props.eyebrow}</p>
      <h2 className="mx-auto mt-2 max-w-3xl text-[36px] font-semibold tracking-tight sm:text-[48px]">{props.title}</h2>
      <p className="mx-auto mt-5 max-w-xl text-[19px] text-ink-muted sm:text-[21px]">{props.description}</p>
      {props.children && <div className="mt-12">{props.children}</div>}
    </section>
  )
}

export default HomePageCard;
