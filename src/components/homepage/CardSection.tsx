import Card from "@/components/homepage/Card";

const rows = [
  {
    title: '匯入',
    description: '貼 otpauth:// 連結、上傳 QR Code 圖片，或直接開相機掃；也可以一次貼多筆。',
  },
  {
    title: '相容',
    description: '和 Google Authenticator 同一套演算法（RFC 6238）。6 / 8 位數、30 / 60 秒、SHA-1 / 256 / 512 都能調。',
  },
  {
    title: '加密',
    description: '可以設一組密碼，金鑰在瀏覽器裡加密後才上雲端。伺服器只看得到密文，忘記密碼沒有人能幫你解。',
  },
  {
    title: '共用',
    description: '把驗證碼放進群組，用 Discord 式的身分組與權限控制：看得到驗證碼的人，不一定拿得到金鑰。',
  },
  {
    title: '不漏拍',
    description: '快到期時先顯示下一組，點一下就複製；釘選、搜尋、分類篩選，上百筆也找得到。',
  },
];

// 規格表：左邊標題欄，右邊一列一列的規格，故意不對齊成卡片牆
const CardSection = () => {
  return (
    <section className="boot container mx-auto grid grid-cols-12 gap-x-6 gap-y-8 px-5 py-16">
      <div className="col-span-12 lg:col-span-4">
        <p className="tech-label">02 // SPEC SHEET</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-ink">規格表</h2>
        <p className="mt-3 max-w-xs text-ink-muted">沒有形容詞，只列它做得到的事。</p>
      </div>
      <ol className="col-span-12 border-t border-line lg:col-span-8 lg:col-start-5">
        {rows.map((row, i) => (
          <Card key={row.title} index={String(i + 1).padStart(2, '0')} {...row} />
        ))}
      </ol>
    </section>
  )
}

export default CardSection;
