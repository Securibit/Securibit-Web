'use client'

import { ThemeProvider } from 'next-themes'
import { HeroUIProvider } from '@heroui/react'
import Layout from '@/components/Layout'
import { config } from '@fortawesome/fontawesome-svg-core'

config.autoAddCss = false

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <HeroUIProvider>
      <ThemeProvider attribute="class" defaultTheme="dark">
        <Layout>{children}</Layout>
      </ThemeProvider>
    </HeroUIProvider>
  )
}
