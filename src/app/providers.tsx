'use client'

import { ThemeProvider } from 'next-themes'
import { HeroUIProvider } from '@heroui/react'
import Layout from '@/components/Layout'
import { config } from '@fortawesome/fontawesome-svg-core'

config.autoAddCss = false

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <HeroUIProvider>
      {/* 跟著系統的亮暗設定，使用者可以在導覽列手動切 */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Layout>{children}</Layout>
      </ThemeProvider>
    </HeroUIProvider>
  )
}
