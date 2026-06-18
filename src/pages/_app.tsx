import '@/styles/globals.css'
import { ThemeProvider } from 'next-themes';
import Layout from '@/components/Layout';
import type { AppProps } from 'next/app'
import '../config/firebase';
import { Toaster } from 'react-hot-toast';
import NextNProgress from "nextjs-progressbar";
import { HeroUIProvider } from "@heroui/react";

import { config } from '@fortawesome/fontawesome-svg-core'

import 'swiper/css';
import 'swiper/css/free-mode';
import 'swiper/css/pagination';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

config.autoAddCss = false;

const App = ({ Component, pageProps }: AppProps) => {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const router = useRouter();
  const currentPath = router.asPath;

  useEffect(() => {
    const handleRouteChangeStart = () => {
      setIsTransitioning(true);
    };

    const handleRouteChangeComplete = () => {
      setIsTransitioning(false);
    };

    router.events.on('routeChangeStart', handleRouteChangeStart);
    router.events.on('routeChangeComplete', handleRouteChangeComplete);
    router.events.on('routeChangeError', handleRouteChangeComplete);

    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeComplete', handleRouteChangeComplete);
      router.events.off('routeChangeError', handleRouteChangeComplete);
    };
  }, [router]);

  return (
    <HeroUIProvider>
      <ThemeProvider attribute="class" defaultTheme="dark">
        <div className={`transition-opacity duration-500 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}>
          <Layout>
            <NextNProgress height={2} color="#00FFFF" options={{ easing: 'ease', speed: 500 }} />
            <Toaster />
            <Component {...pageProps} />
          </Layout>
        </div>
      </ThemeProvider>
    </HeroUIProvider>
  )
}

export default App;