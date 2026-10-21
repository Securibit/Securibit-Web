import type { Metadata } from "next";
import Link from "next/link";
import SEO from "@/config/SEO.json";

export const metadata: Metadata = {
  title: SEO.About.title,
  description: SEO.About.description,
};

const steps = [
  {
    title: '登入',
    text: '使用 Google 帳號登入，驗證碼會跟著帳號走，換電腦或手機都看得到。',
  },
  {
    title: '新增驗證碼',
    text: '在服務的「兩步驟驗證」設定中選擇驗證器 App，掃描或上傳它提供的 QR Code，或手動輸入金鑰。',
  },
  {
    title: '登入時輸入驗證碼',
    text: '驗證碼每 30 秒（或服務指定的週期）更新一次，點一下就能複製。',
  },
];

const features = [
  { title: '匯入', text: '支援 otpauth:// 連結、QR Code 圖片與相機掃描匯入' },
  { title: '參數', text: '可編輯名稱、類別與金鑰，並支援 6 / 8 位數、30 / 60 秒週期與 SHA-1、SHA-256、SHA-512 演算法' },
  { title: '搜尋', text: '依名稱或類別搜尋、篩選驗證碼' },
  { title: '主題', text: '亮色 / 暗色模式' },
];

// 關於：照首頁的味道，一區一個想法，置中大標題加一段灰字
const About = () => {
  return (
    <>
      {/* 這是什麼 */}
      <section className="px-5 pt-20 pb-20 text-center sm:pt-28 sm:pb-28">
        <p className="text-[15px] font-semibold text-ink-muted">關於</p>
        <h1 className="mx-auto mt-2 max-w-3xl text-[36px] font-semibold tracking-tight sm:text-[48px]">
          網頁版的兩步驟驗證器
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[19px] text-ink-muted sm:text-[21px]">
          Securibit 由幣友 BITYO 與靈魂之神工作室打造，使用與 Google Authenticator 相同的 TOTP 演算法（RFC 6238），
          可以取代手機上的驗證器 App，產生各大網站登入時需要的 6 或 8 位數驗證碼。
        </p>
      </section>

      {/* 怎麼使用 */}
      <section className="border-t border-line/70 px-5 py-20 text-center sm:py-28">
        <p className="text-[15px] font-semibold text-ink-muted">怎麼使用</p>
        <h2 className="mx-auto mt-2 max-w-3xl text-[36px] font-semibold tracking-tight sm:text-[48px]">
          三步，和手機上的驗證器一樣
        </h2>
        <ol className="mx-auto mt-12 flex max-w-xl flex-col gap-8 text-left">
          {steps.map((step, index) => (
            <li key={step.title} className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-1 text-[15px] font-semibold tabular-nums">
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-[22px] font-semibold">{step.title}</h3>
                <p className="mt-1 text-[17px] text-ink-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 功能 */}
      <section className="border-t border-line/70 px-5 py-20 text-center sm:py-28">
        <p className="text-[15px] font-semibold text-ink-muted">功能</p>
        <h2 className="mx-auto mt-2 max-w-3xl text-[36px] font-semibold tracking-tight sm:text-[48px]">
          該有的都有
        </h2>
        <div className="mx-auto mt-12 max-w-xl divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface text-left">
          {features.map((feature) => (
            <div key={feature.title} className="px-5 py-4">
              <p className="text-[17px] font-semibold">{feature.title}</p>
              <p className="mt-0.5 text-[15px] text-ink-muted">{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 資料與安全 */}
      <section className="border-t border-line/70 px-5 py-20 text-center sm:py-28">
        <p className="text-[15px] font-semibold text-ink-muted">資料與安全</p>
        <h2 className="mx-auto mt-2 max-w-3xl text-[36px] font-semibold tracking-tight sm:text-[48px]">
          金鑰放在哪裡
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[19px] text-ink-muted sm:text-[21px]">
          金鑰儲存在本服務的雲端資料庫，只有登入的帳戶本人能讀寫自己的資料；驗證碼在你的瀏覽器裡計算。
          請務必另外保存各服務提供的備用碼，以免帳號無法登入時救不回來。
        </p>
        <Link href="/disclaimer" className="link-arrow mt-6 inline-block text-[19px]">
          閱讀免責聲明
        </Link>
      </section>
    </>
  );
};

export default About;
