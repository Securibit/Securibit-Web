'use client'

import { ThemeProvider } from 'next-themes'
import { HeroUIProvider } from '@heroui/react'
import Layout from '@/components/Layout'
import { config } from '@fortawesome/fontawesome-svg-core'

config.autoAddCss = false

// nonce：CSP 用，next-themes 在畫面出來前套用亮暗色的 inline script 要帶上
export const Providers = ({ children, nonce }: { children: React.ReactNode; nonce?: string }) => {
  return (
    <HeroUIProvider>
      {/* 跟著系統的亮暗設定，使用者可以在導覽列手動切 */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
        <Layout>{children}</Layout>
      </ThemeProvider>
    </HeroUIProvider>
  )
}
