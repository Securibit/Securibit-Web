import Link from "next/link";
import CardSection from "@/components/homepage/CardSection";
import TitleSection from "@/components/homepage/TitleSection";
import ButtonSection from "@/components/homepage/ButtonSection";

const Home = () => {
  return (
    <>
      <TitleSection />
      <CardSection />

      {/* 收尾：免費、一個動作 */}
      <section className="border-t border-line/70 px-5 py-24 text-center sm:py-32">
        <h2 className="text-[36px] font-semibold tracking-tight sm:text-[48px]">免費，用 Google 帳號就能開始</h2>
        <p className="mx-auto mt-4 max-w-xl text-[19px] text-ink-muted">
          開始之前，記得把各服務給你的備用碼另外收好。
          <Link href="/disclaimer" className="link-arrow ml-1">為什麼</Link>
        </p>
        <div className="mt-8">
          <ButtonSection />
        </div>
      </section>
    </>
  );
};

export default Home;
