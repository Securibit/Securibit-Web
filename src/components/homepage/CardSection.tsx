import Card from "@/components/homepage/Card";

// 示意畫面都是產品裡真的有的 UI，不畫插圖
const ImportShot = () => (
  <div className="mx-auto max-w-xl overflow-hidden rounded-[18px] border border-line/70 bg-surface text-left">
    <div className="border-b border-line/60 px-5 py-3 text-[15px] text-ink-muted">貼上 otpauth 連結，欄位會自己填好</div>
    <div className="space-y-3 p-5">
      <div className="truncate rounded-lg bg-surface-1 px-3 py-2 text-[15px] text-ink">
        otpauth://totp/GitHub:andy@bityo.tw?secret=JBSWY3DZEBSWY3DZ&issuer=GitHub
      </div>
      <div className="grid grid-cols-2 gap-3 text-[15px]">
        <div className="rounded-lg border border-line/70 px-3 py-2"><span className="text-ink-muted">名稱</span><p>GitHub</p></div>
        <div className="rounded-lg border border-line/70 px-3 py-2"><span className="text-ink-muted">帳號</span><p>andy@bityo.tw</p></div>
      </div>
    </div>
  </div>
);

const VaultShot = () => (
  <div className="mx-auto max-w-xl overflow-hidden rounded-[18px] border border-line/70 bg-surface text-left">
    <div className="flex items-center justify-between px-5 py-4">
      <div>
        <p className="text-[17px] font-semibold">金鑰加密</p>
        <p className="text-[15px] text-ink-muted">用你自己的密碼，在瀏覽器裡加密後才上傳</p>
      </div>
      <span className="relative inline-block h-7 w-12 rounded-full bg-success">
        <span className="absolute right-0.5 top-0.5 h-6 w-6 rounded-full bg-white" />
      </span>
    </div>
    <div className="border-t border-line/60 px-5 py-3 text-[15px] text-ink-muted">
      資料庫裡看到的：<span className="text-ink">enc:v1:9b2c…f41a</span>
    </div>
  </div>
);

const GroupShot = () => (
  <div className="mx-auto max-w-xl overflow-hidden rounded-[18px] border border-line/70 bg-surface text-left">
    <div className="border-b border-line/60 px-5 py-3 text-[17px] font-semibold">幣友 BITYO 團隊帳號 · 3 位成員</div>
    {[
      ['Andy', '擁有者', '看得到金鑰'],
      ['小安', '工程師', '只看驗證碼'],
      ['Mia', '客服', '只看驗證碼'],
    ].map(([name, role, perm], i) => (
      <div key={name} className={i > 0 ? "flex items-center gap-3 border-t border-line/60 px-5 py-3 text-[15px]" : "flex items-center gap-3 px-5 py-3 text-[15px]"}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-1 text-[13px] font-semibold">{name.slice(0, 1)}</span>
        <span className="flex-1">{name}</span>
        <span className="rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px]">{role}</span>
        <span className="text-ink-muted">{perm}</span>
      </div>
    ))}
  </div>
);

const CardSection = () => {
  return (
    <>
      <Card eyebrow="相容" title="和手機上的驗證器用同一套" description="Google Authenticator 用的 TOTP 演算法（RFC 6238）。6 或 8 位數、30 或 60 秒、SHA-1 到 SHA-512 都支援，各大服務都能綁。" />
      <Card eyebrow="匯入" title="貼上連結、上傳圖片，或直接掃" description="在各服務的兩步驟驗證設定裡拿到 QR Code，三種方式隨便哪一種都行。一次要搬很多筆也可以。">
        <ImportShot />
      </Card>
      <Card eyebrow="加密" title="金鑰只有你看得到" description="設一組密碼，金鑰會在你的瀏覽器裡先加密再存。伺服器存的是密文，我們也解不開；所以密碼忘了，沒有人能幫你找回來。">
        <VaultShot />
      </Card>
      <Card eyebrow="共用" title="團隊的帳號，分給該看的人" description="把驗證碼放進群組，用身分組決定誰看得到驗證碼、誰拿得到金鑰。只能看驗證碼的人，金鑰不會送到他的瀏覽器。">
        <GroupShot />
      </Card>
    </>
  )
}

export default CardSection;
