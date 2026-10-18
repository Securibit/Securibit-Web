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

const Disclaimer = () => {
  return (
    <PageContent className="max-w-3xl">
      <PageHeader title="免責聲明" subtitle={SEO.Disclaimer.description} />
      <div className="flex flex-col gap-6 leading-relaxed">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="mb-2 text-lg font-semibold">{section.title}</h2>
            <p className="text-gray-blue-600 dark:text-gray-blue-300">{section.text}</p>
          </section>
        ))}
      </div>
    </PageContent>
  );
};

export default Disclaimer;
