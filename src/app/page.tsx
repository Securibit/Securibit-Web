import Link from "next/link";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import CardSection from "@/components/homepage/CardSection";
import TitleSection from "@/components/homepage/TitleSection";

const Home = () => {
  return (
    <>
      <TitleSection />
      <CardSection />

      {/* 收尾：把最重要的提醒放最後 */}
      <section className="container mx-auto px-5 pb-8">
        <div className="panel flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-xl">
            <p className="tech-label">03 // BEFORE YOU START</p>
            <p className="mt-2 font-display text-2xl font-bold text-ink">開始之前，先把各服務的備用碼收好。</p>
            <p className="mt-2 text-ink-muted">
              驗證器只是其中一把鑰匙。帳號救不回來的時候，救你的是當初那串備用碼。
            </p>
          </div>
          <Link
            href="/about"
            className="flex items-center gap-2 self-start border border-line-strong px-4 py-2 font-display text-sm tracking-[0.12em] text-ink transition-colors hover:border-phos hover:text-phos sm:self-auto"
          >
            怎麼運作
            <FontAwesomeIcon icon={faArrowRight} className="w-3.5" />
          </Link>
        </div>
      </section>
    </>
  );
};

export default Home;
