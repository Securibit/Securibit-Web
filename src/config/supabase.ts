import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

// 瀏覽器端 Supabase client，OAuth 轉向回來後會自動用網址上的 ?code= 換 session
// PKCE：登入時把 code verifier 存在 localStorage，只有發起登入的瀏覽器能換到 session，
// 別人塞來的 #access_token= 或 ?code= 不會被接受（防登入 CSRF）。彈窗與原分頁同源，共用同一份 verifier
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
