import ButtonSection from "./ButtonSection";
import LiveReadout from "./LiveReadout";

// 首頁主視覺：左邊文字佔 7 欄，右邊的儀表往下壓、跨過分隔線
const TitleSection = () => {
  return (
    <section className="container mx-auto px-5 pt-14 pb-16 sm:pt-20 lg:pt-24 lg:pb-28">
      <div className="boot grid grid-cols-12 gap-x-6 gap-y-8">
        <p className="tech-label col-span-12 flex items-center gap-3">
          <span className="led" />
          SECURIBIT // TOTP · HOTP · RFC 6238
        </p>

        <h1 className="col-span-12 font-display text-[2.75rem] font-black leading-[1.05] tracking-tight text-ink sm:text-6xl lg:col-span-7 lg:text-7xl">
          你的 2FA，
          <br />
          <span className="text-phos">像儀表一樣</span>可靠。
        </h1>

        <p className="col-span-12 max-w-md text-lg text-ink-muted lg:col-span-5 lg:self-end lg:pb-2">
          驗證碼在你的瀏覽器裡算出來，金鑰可以用自己的密碼加密，也能放進群組、照權限分享給團隊的人。由台灣的區塊鏈團隊 Bityo 打造。
        </p>

        <div className="col-span-12 lg:col-span-7">
          <ButtonSection />
        </div>

        <div className="col-span-12 lg:col-span-5 lg:translate-y-14">
          <LiveReadout />
        </div>
      </div>

      <div className="rule-accent mt-12 lg:-mt-10" />
    </section>
  )
}

export default TitleSection;
