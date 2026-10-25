import type { Metadata } from "next";
import Link from "next/link";
import SEO from "@/config/SEO.json";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";

export const metadata: Metadata = {
  title: SEO.DeleteAccount.title,
  description: SEO.DeleteAccount.description,
};

const CONTACT = 'service@bityo.tw';

const deleted = [
  '帳戶資料：電子郵件、名稱、大頭照、@ID，以及你上傳的大頭照與背景圖',
  '只有你一個人的群組（包含預設群組）與其中所有的驗證碼金鑰',
  '已登入的裝置，以及 App 用來接收推播的推播 token',
  '所有通知與通知設定',
  '還沒處理的群組邀請，你建立的邀請連結也會失效',
];

const kept = [
  '登入紀錄（登入時間、IP 位址、裝置與當時的電子郵件）會保留到登入後滿一年才刪除，用來防止濫用',
  '在其他人的群組裡留下的操作紀錄會繼續保留，但不再連結到你的帳戶',
  '有設定金鑰加密的話，加密密碼的備援密文會保留一年才刪除，用來處理法律要求；驗證碼已經刪除，它解不出任何驗證碼',
  '資料庫的備份會在保留期限屆滿後自動覆蓋',
];

// 刪除帳戶的說明：給沒有裝 App、或想先知道會刪掉什麼的人（Google Play 要求的刪除帳戶網址）
const DeleteAccount = () => {
  return (
    <PageContent className="max-w-2xl">
      <PageHeader title="刪除帳戶" subtitle="刪除 Securibit 帳戶與所有資料的方法" />

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">刪除之前</h2>
          <div className="overflow-hidden rounded-[18px] border border-line/70 bg-surface px-5 py-4">
            <p className="text-[15px] text-ink-muted">
              驗證碼金鑰刪除後無法恢復。請先到各服務關閉兩步驟驗證或改用其他驗證器，否則可能無法再登入那些服務。
              還擁有其他成員的群組時，需要先把群組轉移給別人或刪除。
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">在網站刪除</h2>
          <ol className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {[
              <>登入 <Link href="/" className="text-accent hover:underline">2fa.bityo.tw</Link></>,
              <>點右上角的頭像，選「<Link href="/me/update_info" className="text-accent hover:underline">帳戶設定</Link>」</>,
              <>按最下面的「刪除帳戶」，再確認一次</>,
            ].map((step, index) => (
              <li key={index} className="flex items-start gap-4 px-5 py-3.5 text-[17px]">
                <span className="w-4 shrink-0 text-ink-muted tabular-nums">{index + 1}</span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">在 App 刪除</h2>
          <ol className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {['打開「設定」（群組列表下方的齒輪）', '按最下面的「刪除帳戶」，再確認一次'].map((step, index) => (
              <li key={step} className="flex items-start gap-4 px-5 py-3.5 text-[17px]">
                <span className="w-4 shrink-0 text-ink-muted tabular-nums">{index + 1}</span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">沒辦法登入時</h2>
          <div className="overflow-hidden rounded-[18px] border border-line/70 bg-surface px-5 py-4">
            <p className="text-[15px] text-ink-muted">
              請用帳戶的電子郵件寫信到{' '}
              <a href={`mailto:${CONTACT}?subject=${encodeURIComponent('刪除 Securibit 帳戶')}`} className="text-accent hover:underline">{CONTACT}</a>
              ，主旨寫「刪除 Securibit 帳戶」。確認是本人後，我們會在 30 天內刪除並回信通知你。
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">只是不想收到通知</h2>
          <div className="overflow-hidden rounded-[18px] border border-line/70 bg-surface px-5 py-4">
            <p className="text-[15px] text-ink-muted">
              不用刪除帳戶。到
              <Link href="/me/update_info?tab=notifications" className="text-accent hover:underline">帳戶設定的「通知」分頁</Link>
              ，每一種通知都可以關閉，包括公告與推廣通知；只有「重要公告」無法關閉。關閉後不會再跳出提醒，通知列表裡還是看得到，通知保留一年後自動刪除。
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">會立即刪除的資料</h2>
          <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {deleted.map((item) => (
              <li key={item} className="px-5 py-3.5 text-[17px]">{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">會保留的資料</h2>
          <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {kept.map((item) => (
              <li key={item} className="px-5 py-3.5 text-[17px]">{item}</li>
            ))}
          </ul>
          <p className="mt-2 px-5 text-[13px] text-ink-muted">
            更多說明見<Link href="/privacy" className="text-accent hover:underline">隱私權政策</Link>
          </p>
        </section>
      </div>
    </PageContent>
  );
};

export default DeleteAccount;
