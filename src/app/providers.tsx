'use client'

import { ThemeProvider } from 'next-themes'
import { HeroUIProvider } from '@heroui/react'
import { AppProgressBar as ProgressBar } from 'next-nprogress-bar'
import Layout from '@/components/Layout'
import { config } from '@fortawesome/fontawesome-svg-core'

config.autoAddCss = false

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <HeroUIProvider>
      <ThemeProvider attribute="class" defaultTheme="dark">
        <ProgressBar height="2px" color="#00FFFF" options={{ showSpinner: false }} shallowRouting />
        <Layout>{children}</Layout>
      </ThemeProvider>
    </HeroUIProvider>
  )
}
