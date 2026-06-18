"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination, Autoplay } from 'swiper/modules'; // 引入 Autoplay 和 Pagination 模組
import 'swiper/css'; // 引入 Swiper 樣式
import 'swiper/css/pagination'; // 引入 Pagination 樣式

import IMG1 from '@/images/swiper_bg1.jpg';
// import IMG2 from '@/image/kp2.webp';
// import IMG3 from '@/image/kp3.webp';
// import IMG4 from '@/image/kp4.webp';
// import IMG5 from '@/image/kp5.webp';
// import IMG6 from '@/image/kp6.webp';
// import IMG7 from '@/image/kp7.webp';

const SwiperSection = () => {

  const images = [IMG1];

  const pagination = {
    clickable: true,
    bulletClass: `swiper-pagination-bullet custom-bullet`, // 使用自定義樣式
    bulletActiveClass: `swiper-pagination-bullet-active custom-bullet-active`, // 使用自定義樣式
    renderBullet: function (index: number, className: string) {
      return '<span class="' + className + '"></span>';
    },
  };

  return (
    <Swiper
      modules={[Pagination, Autoplay]} // 啟用 Autoplay 和 Pagination 模組  
      pagination={pagination}
      autoplay={{
        delay: 3000,
        disableOnInteraction: false,
      }}
      className="absolute inset-0 w-full h-full z-0"
    >
      {images.map((image, index) => (
        <SwiperSlide key={index}>
          <div className="relative w-full h-full">
            <div
              style={{
                backgroundImage: `linear-gradient(to top, rgba(19, 21, 25, 0.6), rgba(19, 21, 25, 0.6)), url('${image.src}')`,
                backgroundAttachment: 'fixed',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
              className="w-full h-full"
            />
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}

export default SwiperSection;
