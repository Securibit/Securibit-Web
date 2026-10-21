import type { User as SupabaseUser } from '@supabase/supabase-js'

// 對齊原 Firebase User 的常用欄位，讓元件改動最小
export interface AppUser {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
  emailVerified: boolean
  phoneNumber: string | null
  metadata: {
    creationTime: string
    lastSignInTime: string
  }
}

// 將 Supabase 使用者轉成 App 內部使用的正規化格式
export const toAppUser = (user: SupabaseUser): AppUser => {
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>
  return {
    uid: user.id,
    displayName: meta.full_name ?? meta.name ?? null,
    email: user.email ?? null,
    photoURL: meta.avatar_url ?? meta.picture ?? null,
    emailVerified: Boolean(user.email_confirmed_at) || meta.email_verified === 'true',
    phoneNumber: user.phone || null,
    metadata: {
      creationTime: user.created_at ?? '',
      lastSignInTime: user.last_sign_in_at ?? '',
    },
  }
}
