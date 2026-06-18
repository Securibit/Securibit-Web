'use client'

import { ThemeProvider } from 'next-themes'
import { HeroUIProvider } from '@heroui/react'
import { Toaster, toast } from 'react-hot-toast'
import { AppProgressBar as ProgressBar } from 'next-nprogress-bar'
import Layout from '@/components/Layout'
import { config } from '@fortawesome/fontawesome-svg-core'
import { useEffect } from 'react'
import { supabase } from '@/config/supabase'
import { notifyMigrationOnce, recordLogin } from '@/lib/totp/account'

config.autoAddCss = false

export const Providers = ({ children }: { children: React.ReactNode }) => {
  // 登入成功提示（轉向回來、session 真的建立後才顯示一次）＋ 遷移提示 ＋ 記錄登入
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        if (event === 'SIGNED_IN' && typeof window !== 'undefined' && sessionStorage.getItem('pendingLogin')) {
          sessionStorage.removeItem('pendingLogin')
          toast.success('登入成功！', { position: 'top-right' })
        }
        if (event === 'SIGNED_IN') {
          recordLogin()
        }
        const shouldNotify = await notifyMigrationOnce(session.user.id)
        if (shouldNotify) {
          toast.success('已將您的資料遷移至新資料庫！', { position: 'top-right', duration: 6000 })
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <HeroUIProvider>
      <ThemeProvider attribute="class" defaultTheme="dark">
        <ProgressBar height="2px" color="#00FFFF" options={{ showSpinner: false }} shallowRouting />
        <Layout>
          <Toaster />
          {children}
        </Layout>
      </ThemeProvider>
    </HeroUIProvider>
  )
}
