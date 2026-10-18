import '@/styles/globals.css'
import 'swiper/css'
import 'swiper/css/free-mode'
import 'swiper/css/pagination'
import type { Metadata } from 'next'
import NextTopLoader from 'nextjs-toploader'
import SEO from '@/config/SEO.json'
import { Providers } from './providers'

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
    <html lang="zh-Hant" suppressHydrationWarning>
      <body className="h-full text-black bg-white dark:bg-gray-blue-900 dark:text-white transition duration-300 ease-in-out">
        {/* 換頁時頂部的進度條，顏色取品牌色 tpp */}
        <NextTopLoader color="#28C8C7" height={3} showSpinner={false} shadow="0 0 10px #28C8C7,0 0 5px #28C8C7" />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

export default RootLayout
