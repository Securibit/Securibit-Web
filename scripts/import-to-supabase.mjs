// 把 legacy-users.json 匯入 Supabase 的 legacy_import 暫存表（以 email 為鍵）
// 之後每位使用者第一次用 Google 登入時，handle_new_user 觸發器會依 email 自動接回資料
// 用法（Node 20+ 可用 --env-file 載入環境變數）：
//   node --env-file=.env.local scripts/import-to-supabase.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('❌ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 環境變數')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
const rows = JSON.parse(readFileSync('./legacy-users.json', 'utf8'))

if (!rows.length) {
  console.log('沒有資料可匯入。')
  process.exit(0)
}

// 分批上傳（20 人其實一批就夠，這裡仍保留分批保險）
const chunkSize = 500
for (let i = 0; i < rows.length; i += chunkSize) {
  const chunk = rows.slice(i, i + chunkSize)
  const { error } = await supabase.from('legacy_import').upsert(chunk, { onConflict: 'email' })
  if (error) {
    console.error('❌ 匯入失敗：', error.message)
    process.exit(1)
  }
}

console.log(`✅ 已匯入 ${rows.length} 筆 → legacy_import`)
process.exit(0)
