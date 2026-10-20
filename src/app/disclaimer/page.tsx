import type { Metadata } from "next";
import SEO from "@/config/SEO.json";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";

export const metadata: Metadata = {
  title: SEO.Disclaimer.title,
  description: SEO.Disclaimer.description,
};

const sections = [
  {
    title: '服務性質',
    text: '本網站提供的兩步驟驗證器依現況提供，不保證服務不中斷、無錯誤，或適用於任何特定用途。',
  },
  {
    title: '金鑰與備用碼',
    text: '請自行妥善保存各服務提供的金鑰與備用碼（Recovery Codes）。若因刪除驗證碼、刪除帳戶、遺失 Google 帳號存取權或服務中斷而無法取得驗證碼，導致無法登入其他服務，本網站不負任何責任。',
  },
  {
    title: '帳戶安全',
    text: '任何能登入您 Google 帳號的人都能看到您的驗證碼，請為 Google 帳號啟用強密碼與其自身的兩步驟驗證，並避免在公用電腦上保持登入。',
  },
  {
    title: '資料儲存',
    text: '您新增的驗證碼金鑰與帳戶基本資料會儲存在本服務使用的雲端資料庫（Supabase），僅用於提供本服務。刪除帳戶時會一併刪除這些資料，刪除後無法恢復。',
  },
  {
    title: '條款修改',
    text: '本網站得隨時修改本聲明內容，修改後於本頁公告即生效。繼續使用本網站即表示您同意修改後的內容。',
  },
];

// 條款：左邊標題欄，右邊一條一條的規格列，編號用方形等寬標籤
const Disclaimer = () => {
  return (
    <PageContent className="max-w-4xl">
      <PageHeader index="LEGAL // DISCLAIMER" title="免責聲明" subtitle={SEO.Disclaimer.description} />

      <section className="boot grid grid-cols-12 gap-6">
        <div className="col-span-12 md:col-span-4">
          <p className="tech-label">01 // TERMS</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-ink">使用本服務前</h2>
          <p className="mt-3 max-w-xs text-sm text-ink-muted">
            繼續使用本網站，即表示您已閱讀並同意以下各條。
          </p>
        </div>

        <ol className="col-span-12 border-t border-line md:col-span-8">
          {sections.map((section, index) => (
            <li
              key={section.title}
              className="grid grid-cols-[3rem_1fr] gap-x-4 gap-y-2 border-b border-line py-5"
            >
              <span className="inline-flex h-7 min-w-7 items-center justify-center justify-self-start self-start border border-line-strong px-1.5 font-mono text-xs tracking-[0.08em] text-ink">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="font-display text-lg font-semibold text-ink">{section.title}</h3>
              <p className="col-start-2 leading-relaxed text-ink-muted">{section.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </PageContent>
  );
};

export default Disclaimer;
