// 從 Firebase 匯出舊資料 → legacy-users.json
//
// 重點：Firestore 的 `user` 文件可能只有 uid / totp，不一定有 email。
// 所以這支腳本會：
//   (1) 從 Firebase Authentication 取得 uid → email 對照（Google 登入一定有 email）
//   (2) 讀 Firestore `user` collection 的 uid / totp / 個人欄位
//   (3) 用 uid join，產出以 email 為鍵的 legacy-users.json
//
// 用法：
//   1. Firebase 後台 → ⚙️設定 → 專案設定 → 服務帳戶 → 產生新的私密金鑰
//      下載 JSON 存成專案根目錄的 ./serviceAccount.json
//   2. node scripts/export-firestore.mjs
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { readFileSync, writeFileSync } from 'node:fs'

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || './serviceAccount.json'
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))

const app = initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore(app)
const auth = getAuth(app)

// (1) Auth：建立 uid → 使用者資訊 對照
const uidToAuth = new Map()
let nextPageToken
do {
  const page = await auth.listUsers(1000, nextPageToken)
  for (const u of page.users) {
    uidToAuth.set(u.uid, {
      email: u.email ?? null,
      displayName: u.displayName ?? null,
      photoURL: u.photoURL ?? null,
    })
  }
  nextPageToken = page.pageToken
} while (nextPageToken)

// (2)+(3) Firestore：讀 user 文件並用 uid join Auth 的 email
const snap = await db.collection('user').get()
const rows = []
let skipped = 0

snap.forEach((doc) => {
  const d = doc.data()
  const uid = d.uid ?? doc.id
  const authInfo = uidToAuth.get(uid)

  // email 是搬到 Supabase 後唯一穩定的對應鍵；優先用 Auth 的 email，其次用文件裡的
  const email = authInfo?.email ?? d.email ?? null
  if (!email) {
    console.warn(`⚠️  跳過找不到 email 的使用者（uid=${uid}）`)
    skipped += 1
    return
  }

  rows.push({
    email,
    name: d.name ?? authInfo?.displayName ?? null,
    photo_url: d.photoURL ?? authInfo?.photoURL ?? null,
    bg_photo_url: d.bgPhotoURL ?? null,
    phone_number: d.phoneNumber ?? '',
    totp: d.totp ?? [],
  })
})

writeFileSync('./legacy-users.json', JSON.stringify(rows, null, 2))
console.log(`✅ 匯出 ${rows.length} 筆 → legacy-users.json${skipped ? `（略過 ${skipped} 筆找不到 email）` : ''}`)
process.exit(0)
