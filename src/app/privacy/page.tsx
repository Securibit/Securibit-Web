import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import SEO from "@/config/SEO.json";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";

export const metadata: Metadata = {
  title: SEO.Privacy.title,
  description: SEO.Privacy.description,
};

const CONTACT = 'service@bityo.tw';

// 每段是一段文字，字串陣列是條列
type Block = ReactNode | string[];

const sections: { title: string; body: Block[] }[] = [
  {
    title: '誰負責你的資料',
    body: [
      `Securibit（網站 2fa.bityo.tw 與 macOS、Windows、Linux、Android App，以下稱「本服務」）由幣友 BITYO 與靈魂之神工作室開發與營運，以下稱「我們」。這兩個團隊都是由學生組成的小型團隊，不是公司或其他法人，本服務由團隊成員共同維護並負責保護你的資料。對這份政策或你的資料有任何問題，請寫信到 ${CONTACT}。`,
      '這份政策依台灣《個人資料保護法》第 8 條，說明我們蒐集哪些資料、為什麼蒐集、怎麼使用與保存，以及你有哪些權利。',
    ],
  },
  {
    title: '蒐集目的',
    body: [
      '提供兩步驟驗證碼的儲存、同步與群組共用；管理帳戶與登入裝置；維護服務安全，例如發現異常登入；回覆你的問題。',
      '對應的法定特定目的為：〇六九 契約、類似契約或其他法律關係事務、〇九〇 消費者、客戶管理與服務、一三六 資（通）訊與資料庫管理、一三七 資通安全與管理。',
    ],
  },
  {
    title: '我們蒐集的資料',
    body: [
      [
        'Google 帳戶資料：用 Google 登入時，Google 提供的電子郵件、名稱與大頭照網址',
        '你自己設定的資料：@ID、群組名稱與說明、驗證碼的名稱、類別與參數',
        '驗證碼金鑰：見下一段「驗證碼金鑰」',
        '登入與裝置資料：登入時間、IP 位址、作業系統與瀏覽器（user agent）；App 另外會記下裝置名稱、平台與 App 版本，用來顯示「已登入的裝置」',
        '操作紀錄：群組裡新增、修改、刪除驗證碼，以及成員、身分組與權限的變更',
      ],
      '我們不蒐集位置、通訊錄、廣告識別碼，也沒有廣告或第三方追蹤、分析工具。',
    ],
  },
  {
    title: '驗證碼金鑰',
    body: [
      '開啟「金鑰加密」後，金鑰會先在你的裝置上用你設定的密碼加密才上傳，我們只存密文，看不到原本的金鑰，也不知道你的密碼。忘記密碼時我們無法幫你還原。',
      '沒有開啟加密時，金鑰會透過加密連線傳送，存放在有磁碟加密的資料庫，只有你、群組中有權限的成員，以及具有對應權限的網站管理員能讀取。但維護資料庫的人員在技術上有能力存取，所以重要的帳號建議開啟金鑰加密。',
    ],
  },
  {
    title: '只留在你裝置上的資料',
    body: [
      [
        'App 的數字密碼與生物辨識：只用來解鎖 App，存在裝置的安全儲存區，不會上傳；生物辨識由系統處理，我們拿不到指紋或臉部資料',
        '相機：只用來掃描 QR Code，影像在裝置上辨識，不會上傳或保存',
        '離線快取：App 會把驗證碼加密存在裝置上，沒有網路時也能查看，登出時清除',
        '網站的偏好設定：主題、側欄是否收合等存在瀏覽器的本機儲存空間；登入狀態存在 Cookie。我們不使用追蹤用的 Cookie',
      ],
    ],
  },
  {
    title: '誰看得到你的資料',
    body: [
      [
        '同一個群組的成員：看得到你的名稱、@ID、大頭照，以及你在群組裡的操作紀錄；群組擁有者與有「踢出成員」或「管理身分組」權限的人，也看得到你的電子郵件',
        '群組裡的驗證碼：依群組設定的權限，決定哪些成員能看到或管理',
        '網站管理員：為了維護服務與處理違規，具有對應權限的管理員可以查看帳戶資料、登入紀錄、登入裝置與驗證碼（已加密的金鑰除外）；IP 位址只有權限比你高的管理員看得到',
      ],
      '我們不會出售你的資料，也不會提供給任何人做廣告或行銷。除了下面列出的服務商，以及法律要求或為了保護你與他人的權益而必須提供的情況，我們不會把資料提供給第三方。',
    ],
  },
  {
    title: '我們使用的服務商',
    body: [
      [
        'Supabase：資料庫與登入系統，資料存放在日本東京的機房',
        'Vercel：網站主機，會處理連線到網站的 IP 位址等連線資料',
        'Google：Google 帳戶登入；Android App 使用 Google Play 服務的 ML Kit 在裝置上辨識 QR Code；從 Google Play 下載的 App 由 Google Play 安裝與更新',
        'GitHub：不是從 Google Play 下載的 App，會向 GitHub 查詢與下載新版本，GitHub 會因此收到你的 IP 位址',
      ],
      '因此你的資料會傳送到台灣以外的地區（日本與美國）處理與保存。',
    ],
  },
  {
    title: '保存期間',
    body: [
      '帳戶存在期間，我們會保存上面列出的資料。刪除帳戶時，帳戶資料、登入裝置、只有你一個人的群組與其中的驗證碼會立即刪除，無法恢復。',
      '登入紀錄（登入時間、IP 位址、裝置與當時的電子郵件）保留一年，期滿自動刪除；刪除帳戶後也會保留到期滿，用來防止重複註冊、濫用服務與調查安全事件。',
      '在其他人的群組裡留下的操作紀錄會繼續保留，讓群組保有完整的紀錄，但不再連結到你的帳戶。資料庫的備份會在保留期限屆滿後自動覆蓋。',
      '群組邀請在對方接受或拒絕後刪除；邀請連結過期後失效。',
    ],
  },
  {
    title: '刪除帳戶',
    body: [
      <>
        你可以隨時在網站或 App 刪除帳戶，詳細步驟見
        <Link href="/delete-account" className="text-accent hover:underline">「刪除帳戶」</Link>
        頁面。還擁有其他成員的群組時，需要先轉移或刪除那些群組。
      </>,
    ],
  },
  {
    title: '你的權利',
    body: [
      '依《個人資料保護法》第 3 條，你可以向我們請求：查詢或閱覽、製給複製本、補充或更正、停止蒐集、處理或利用，以及刪除你的個人資料。',
      `大部分的資料可以直接在網站或 App 的帳戶設定查看、修改或刪除；其他請求請寫信到 ${CONTACT}，我們會在法定期限內回覆。`,
      '你可以選擇不提供資料，但本服務需要 Google 帳戶的電子郵件才能建立帳戶，不提供就無法使用。',
    ],
  },
  {
    title: '安全措施',
    body: [
      '所有連線都經過 TLS 加密；資料庫使用列層級權限控管，每個人只讀得到自己有權限的資料；你可以開啟金鑰加密、App 鎖定與生物辨識，進一步保護驗證碼。',
      '但沒有任何系統能保證絕對安全。如果發生影響你資料的安全事件，我們會依法通知你。',
    ],
  },
  {
    title: '兒童',
    body: ['本服務不是為 13 歲以下的兒童設計，我們不會在知情的情況下蒐集兒童的資料。'],
  },
  {
    title: '政策修改',
    body: [
      '我們可能會修改這份政策，修改後會在本頁公告並更新下方日期；有重大變更時會在網站或 App 另外通知。',
      '生效日期：2026 年 10 月 23 日',
    ],
  },
];

// 隱私權政策：和免責聲明一樣是分組列表，每段一列，條列用小圓點
const Privacy = () => {
  return (
    <PageContent className="max-w-2xl">
      <PageHeader title="隱私權政策" subtitle="我們怎麼蒐集、使用與保護你的資料" />

      <section>
        <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
          {sections.map((section) => (
            <div key={section.title} className="px-5 py-4">
              <h2 className="text-[17px] font-semibold">{section.title}</h2>
              {section.body.map((block, index) =>
                Array.isArray(block) ? (
                  <ul key={index} className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[15px] text-ink-muted marker:text-ink-muted/60">
                    {block.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={index} className="mt-1.5 text-[15px] text-ink-muted">{block}</p>
                ),
              )}
            </div>
          ))}
        </div>
      </section>
    </PageContent>
  );
};

export default Privacy;
