import type { Metadata } from "next";
import Link from "next/link";
import SEO from "@/config/SEO.json";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";

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

// 兩位數編號的方形標籤
const Index = ({ n }: { n: number }) => (
  <span className="inline-flex h-7 min-w-7 items-center justify-center justify-self-start border border-line-strong px-1.5 font-mono text-xs tracking-[0.08em] text-ink">
    {String(n).padStart(2, '0')}
  </span>
);

const About = () => {
  return (
    <PageContent className="max-w-4xl">
      <PageHeader index="ABOUT // TOTP 2FA" title="關於我們" subtitle="TOTP 2FA 二步驟驗證器" />

      <div className="boot flex flex-col">
        {/* 01 簡介 */}
        <section className="grid grid-cols-12 gap-6 pb-10">
          <div className="col-span-12 md:col-span-4">
            <p className="tech-label">01 // OVERVIEW</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink">這是什麼</h2>
          </div>
          <p className="col-span-12 leading-relaxed text-ink-muted md:col-span-8">
            TOTP 2FA 是由 Bityo 團隊打造的網頁版兩步驟驗證器。它使用與 Google Authenticator
            相同的 TOTP 演算法（RFC 6238），可以取代手機上的驗證器 App，產生各大網站登入時需要的 6 或 8 位數驗證碼。
          </p>
        </section>

        {/* 02 步驟 */}
        <section className="grid grid-cols-12 gap-6 border-t border-line py-10">
          <div className="col-span-12 md:col-span-4">
            <p className="tech-label">02 // HOW TO</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink">怎麼使用</h2>
            <p className="mt-3 max-w-xs text-sm text-ink-muted">三步，和手機上的驗證器一樣。</p>
          </div>
          <ol className="col-span-12 border-t border-line md:col-span-8">
            {steps.map((step, index) => (
              <li key={step.title} className="grid grid-cols-[3rem_1fr] gap-x-4 gap-y-1 border-b border-line py-5">
                <Index n={index + 1} />
                <h3 className="font-display text-lg font-semibold text-ink">{step.title}</h3>
                <p className="col-start-2 text-ink-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 03 功能規格表 */}
        <section className="grid grid-cols-12 gap-6 border-t border-line py-10">
          <div className="col-span-12 md:col-span-4">
            <p className="tech-label">03 // SPEC SHEET</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink">功能</h2>
          </div>
          <ol className="col-span-12 border-t border-line md:col-span-8">
            {features.map((feature, index) => (
              <li
                key={feature.title}
                className="grid grid-cols-[3rem_1fr] gap-x-4 gap-y-1 border-b border-line py-4 sm:grid-cols-[3rem_6rem_1fr]"
              >
                <Index n={index + 1} />
                <h3 className="font-display text-base font-semibold text-ink">{feature.title}</h3>
                <p className="col-start-2 text-sm text-ink-muted sm:col-start-3">{feature.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 04 資料與安全 */}
        <section className="grid grid-cols-12 gap-6 border-t border-line py-10">
          <div className="col-span-12 md:col-span-4">
            <p className="tech-label">04 // SECURITY</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink">資料與安全</h2>
          </div>
          <div className="panel col-span-12 p-5 sm:p-6 md:col-span-8">
            <p className="leading-relaxed text-ink-muted">
              驗證碼金鑰儲存在本服務的雲端資料庫，資料庫權限設定為只有登入的帳戶本人能讀寫自己的資料。
              驗證碼在您的瀏覽器中計算產生。請務必另外保存各服務提供的備用碼（Recovery Codes），以免帳號無法登入時無法救回。
              詳細說明請參閱
              <Link href="/disclaimer" className="text-phos underline underline-offset-4 transition-colors hover:text-ink">
                免責聲明
              </Link>
              。
            </p>
          </div>
        </section>
      </div>
    </PageContent>
  );
};

export default About;
