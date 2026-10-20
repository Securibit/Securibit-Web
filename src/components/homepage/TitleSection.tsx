import ButtonSection from "./ButtonSection";
import LiveReadout from "./LiveReadout";

// 主視覺：置中的大標題、一行灰字、兩個藍色連結，然後是產品本人
const TitleSection = () => {
  return (
    <section className="px-5 pt-20 pb-24 text-center sm:pt-28">
      <p className="text-[21px] font-semibold text-ink-muted">Securibit</p>
      <h1 className="mt-2 text-[44px] font-semibold tracking-tight sm:text-[64px] lg:text-[72px]">
        驗證碼，終於有地方放了
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-[21px] text-ink-muted sm:text-[24px]">
        網頁版的兩步驟驗證器。換手機不用重綁，金鑰可以加密，還能和團隊共用。
      </p>
      <div className="mt-6">
        <ButtonSection />
      </div>
      <div className="mt-16 sm:mt-20">
        <LiveReadout />
      </div>
    </section>
  )
}

export default TitleSection;
