import '@/styles/globals.css'
import type { Metadata } from 'next'
import { Inter_Tight, Noto_Sans_TC } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import SEO from '@/config/SEO.json'
import { cn } from '@/lib/utils'
import { Providers } from './providers'

// Apple 裝置用系統的 SF Pro + 蘋方；其他平台落到這兩個自架字體
const interTight = Inter_Tight({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter-tight', display: 'swap' })
const notoTc = Noto_Sans_TC({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-noto-tc', display: 'swap' })

export const metadata: Metadata = {
  title: {
    default: SEO.Index.title,
    template: '%s - TOTP 2FA',
  },
  description: SEO.Index.description,
  icons: { icon: '/favicon.ico' },
}

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="zh-Hant" suppressHydrationWarning className={cn(interTight.variable, notoTc.variable)}>
      <body className="min-h-full font-sans">
        {/* 換頁時頂部的進度條 */}
        <NextTopLoader color="#17FFAC" height={2} showSpinner={false} shadow={false} />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

export default RootLayout
