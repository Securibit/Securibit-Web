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

const About = () => {
  return (
    <PageContent className="max-w-3xl">
      <PageHeader title="關於我們" subtitle="TOTP 2FA 二步驟驗證器" />

      <div className="flex flex-col gap-8 leading-relaxed">
        <section>
          <p>
            TOTP 2FA 是由 Bityo 團隊打造的網頁版兩步驟驗證器。它使用與 Google Authenticator
            相同的 TOTP 演算法（RFC 6238），可以取代手機上的驗證器 App，產生各大網站登入時需要的 6 或 8 位數驗證碼。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold">怎麼使用</h2>
          <ol className="flex flex-col gap-3">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-tpp font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <p className="text-gray-blue-600 dark:text-gray-blue-300">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold">功能</h2>
          <ul className="list-disc pl-6 text-gray-blue-600 dark:text-gray-blue-300">
            <li>支援 otpauth:// 連結、QR Code 圖片與相機掃描匯入</li>
            <li>可編輯名稱、類別與金鑰，並支援 6 / 8 位數、30 / 60 秒週期與 SHA-1、SHA-256、SHA-512 演算法</li>
            <li>依名稱或類別搜尋、篩選驗證碼</li>
            <li>亮色 / 暗色模式</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold">資料與安全</h2>
          <p className="text-gray-blue-600 dark:text-gray-blue-300">
            驗證碼金鑰儲存在本服務的雲端資料庫，資料庫權限設定為只有登入的帳戶本人能讀寫自己的資料。
            驗證碼在您的瀏覽器中計算產生。請務必另外保存各服務提供的備用碼（Recovery Codes），以免帳號無法登入時無法救回。
            詳細說明請參閱<Link href="/disclaimer" className="text-tpp underline underline-offset-4">免責聲明</Link>。
          </p>
        </section>
      </div>
    </PageContent>
  );
};

export default About;
