import SwiperSection from "@/components/homepage/SwiperSection";
import Particles from "@/components/Particles";
import CardSection from "@/components/homepage/CardSection";
import TitleSection from "@/components/homepage/TitleSection";

const Home = () => {
  return (
    <>
      <div className="relative w-full h-[80vh]">
        {/* 例子效果 */}
        <Particles
          className="absolute z-10 animate-fade-in w-full h-[90%]"
          quantity={100}
        />
        {/* 背後swiper */}
        <SwiperSection />

        {/* 文字內容 */}
        <TitleSection />
      </div>

      {/* 底下部分 */}
      <div className="container mx-auto pt-5 pl-5 pr-5">
        <CardSection />
      </div>
    </>
  );
};

export default Home;
