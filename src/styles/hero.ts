// 從純樣式包匯入 plugin（不要從 @heroui/react，那是含 React 元件的大包，
// 在 Tailwind 的 Node plugin 載入環境會失敗導致樣式完全沒產生）
import { heroui } from '@heroui/theme'

/*
 * HeroUI 元件（按鈕、輸入框、Modal、表格…）的色票，跟 globals.css 的 Apple 配方一致：
 * primary = 幣友綠 #17FFAC（按鈕上的字用深綠 #04261A）；灰階用 Apple 的 #F5F5F7 / #D2D2D7 / #86868B / #1D1D1F；圓角 12 / 18 / 22。
 */
export default heroui({
  layout: {
    radius: { small: '12px', medium: '18px', large: '22px' },
    borderWidth: { small: '1px', medium: '1px', large: '2px' },
    dividerWeight: '1px',
    disabledOpacity: '0.4',
    boxShadow: {
      small: '0 1px 2px rgba(0,0,0,0.04)',
      medium: '0 1px 2px rgba(0,0,0,0.04)',
      large: '0 8px 24px rgba(0,0,0,0.08)',
    },
  },
  themes: {
    light: {
      colors: {
        background: '#FFFFFF',
        foreground: '#1D1D1F',
        focus: '#0B9F6B',
        divider: '#1D1D1F',
        content1: '#FFFFFF',
        content2: '#F5F5F7',
        content3: '#E8E8ED',
        content4: '#D2D2D7',
        default: {
          50: '#F5F5F7', 100: '#E8E8ED', 200: '#D2D2D7', 300: '#C7C7CC', 400: '#AEAEB2',
          500: '#86868B', 600: '#6E6E73', 700: '#515154', 800: '#3A3A3C', 900: '#1D1D1F',
          DEFAULT: '#E8E8ED', foreground: '#1D1D1F',
        },
        primary: {
          50: '#E6FFF6', 100: '#C2FFE9', 200: '#8FFFD6', 300: '#5CFFC3', 400: '#33FFB6',
          500: '#17FFAC', 600: '#0BCF89', 700: '#0B9F6B', 800: '#08704C', 900: '#04402B',
          DEFAULT: '#17FFAC', foreground: '#04261A',
        },
        success: {
          50: '#E9F9EE', 100: '#C8F0D5', 200: '#95E2AE', 300: '#62D389', 400: '#3DCB6E',
          500: '#34C759', 600: '#2AA148', 700: '#1F7B37', 800: '#155527', 900: '#0B3016',
          DEFAULT: '#34C759', foreground: '#FFFFFF',
        },
        danger: {
          50: '#FDECEC', 100: '#FAD0D0', 200: '#F5A1A1', 300: '#EF7272', 400: '#E94343',
          500: '#E30000', 600: '#B80000', 700: '#8E0000', 800: '#640000', 900: '#3A0000',
          DEFAULT: '#E30000', foreground: '#FFFFFF',
        },
        warning: {
          50: '#FFF5E5', 100: '#FFE6BF', 200: '#FFCF80', 300: '#FFB840', 400: '#FFA20D',
          500: '#FF9500', 600: '#CC7700', 700: '#995A00', 800: '#663C00', 900: '#331E00',
          DEFAULT: '#FF9500', foreground: '#1D1D1F',
        },
        secondary: {
          50: '#F5F5F7', 100: '#E8E8ED', 200: '#D2D2D7', 300: '#AEAEB2', 400: '#86868B',
          500: '#6E6E73', 600: '#515154', 700: '#3A3A3C', 800: '#2C2C2E', 900: '#1D1D1F',
          DEFAULT: '#1D1D1F', foreground: '#FFFFFF',
        },
      },
    },
    dark: {
      colors: {
        background: '#1C1C1E',
        foreground: '#F5F5F7',
        focus: '#17FFAC',
        divider: '#F5F5F7',
        content1: '#2A2A2D',
        content2: '#323235',
        content3: '#3A3A3E',
        content4: '#424246',
        default: {
          50: '#1D1D1F', 100: '#2C2C2E', 200: '#3A3A3C', 300: '#424245', 400: '#515154',
          500: '#86868B', 600: '#AEAEB2', 700: '#C7C7CC', 800: '#E8E8ED', 900: '#F5F5F7',
          DEFAULT: '#3A3A3C', foreground: '#F5F5F7',
        },
        primary: {
          50: '#E6FFF6', 100: '#C2FFE9', 200: '#8FFFD6', 300: '#5CFFC3', 400: '#33FFB6',
          500: '#17FFAC', 600: '#0BCF89', 700: '#0B9F6B', 800: '#08704C', 900: '#04402B',
          DEFAULT: '#17FFAC', foreground: '#04261A',
        },
        success: {
          50: '#0B3016', 100: '#155527', 200: '#1F7B37', 300: '#2AA148', 400: '#30D158',
          500: '#30D158', 600: '#62DC80', 700: '#95E7A8', 800: '#C8F3D3', 900: '#E9FAEE',
          DEFAULT: '#30D158', foreground: '#000000',
        },
        danger: {
          50: '#3A0000', 100: '#640000', 200: '#8E0000', 300: '#B80000', 400: '#E30000',
          500: '#FF453A', 600: '#FF7A72', 700: '#FFA8A3', 800: '#FFD3D0', 900: '#FFECEB',
          DEFAULT: '#FF453A', foreground: '#FFFFFF',
        },
        warning: {
          50: '#331E00', 100: '#663C00', 200: '#995A00', 300: '#CC7700', 400: '#FF9500',
          500: '#FF9F0A', 600: '#FFB740', 700: '#FFCF80', 800: '#FFE6BF', 900: '#FFF5E5',
          DEFAULT: '#FF9F0A', foreground: '#000000',
        },
        secondary: {
          50: '#2C2C2E', 100: '#3A3A3C', 200: '#515154', 300: '#6E6E73', 400: '#86868B',
          500: '#AEAEB2', 600: '#C7C7CC', 700: '#D2D2D7', 800: '#E8E8ED', 900: '#F5F5F7',
          DEFAULT: '#F5F5F7', foreground: '#000000',
        },
      },
    },
  },
})
