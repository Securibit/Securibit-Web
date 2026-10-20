import '@/styles/globals.css'
import type { Metadata } from 'next'
import { Chakra_Petch, IBM_Plex_Mono, LXGW_WenKai_TC, Noto_Sans_TC } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import SEO from '@/config/SEO.json'
import { cn } from '@/lib/utils'
import { Providers } from './providers'

// 標題（拉丁）：方正的儀表字
const chakra = Chakra_Petch({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-chakra', display: 'swap' })
// 讀數、ID、時間
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-mono', display: 'swap' })
// 內文（中文）
const wenKai = LXGW_WenKai_TC({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-wenkai', display: 'swap' })
// 標題（中文）：Chakra Petch 沒有漢字，落到這個粗黑體
const notoTc = Noto_Sans_TC({ subsets: ['latin'], weight: ['700', '900'], variable: '--font-noto-tc', display: 'swap' })

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
    <html
      lang="zh-Hant"
      suppressHydrationWarning
      className={cn(chakra.variable, plexMono.variable, wenKai.variable, notoTc.variable)}
    >
      <body className="min-h-full font-body antialiased">
        {/* 換頁時頂部的進度條，顏色取主色磷光綠 */}
        <NextTopLoader color="#17FFAD" height={2} showSpinner={false} shadow="0 0 10px #17FFAD" />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

export default RootLayout
