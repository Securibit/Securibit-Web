// 從純樣式包匯入 plugin（不要從 @heroui/react，那是含 React 元件的大包，
// 在 Tailwind 的 Node plugin 載入環境會失敗導致樣式完全沒產生）
import { heroui } from '@heroui/theme'

/*
 * 儀表／終端機工業風：HeroUI 元件（按鈕、輸入框、Modal、表格…）統一吃這組色票，
 * 跟 globals.css 的 --bg / --fg / --phos 一致。
 * - 主色 primary = 磷光綠（深色 #17FFAD、淺色改用深綠 #0A8C5F 才看得清楚）
 * - 強調色 danger = 警示橘紅；warning 琥珀只給倒數用
 * - secondary 保留舊的 tpp 青色，只為了相容，新的畫面不要再用
 * - 圓角一律 2～4px，邊框 1px
 */
export default heroui({
  layout: {
    radius: { small: '2px', medium: '3px', large: '4px' },
    borderWidth: { small: '1px', medium: '1px', large: '2px' },
    dividerWeight: '1px',
    disabledOpacity: '0.4',
    hoverOpacity: '0.85',
  },
  themes: {
    dark: {
      colors: {
        background: '#0B0E11',
        foreground: '#E6EDEA',
        focus: '#17FFAD',
        overlay: '#000000',
        divider: '#E6EDEA',
        content1: '#11161B',
        content2: '#171D23',
        content3: '#1E262D',
        content4: '#26303A',
        default: {
          50: '#11161B', 100: '#171D23', 200: '#1E262D', 300: '#26303A', 400: '#3A4751',
          500: '#5C6B74', 600: '#8A9BA5', 700: '#B3C0C7', 800: '#D5DDE0', 900: '#E6EDEA',
          DEFAULT: '#26303A', foreground: '#E6EDEA',
        },
        primary: {
          50: '#063D2A', 100: '#0A6B48', 200: '#0E9A68', 300: '#12CC8A', 400: '#14E69A',
          500: '#17FFAD', 600: '#5CFFC1', 700: '#8FFFD3', 800: '#C4FFE8', 900: '#E8FFF6',
          DEFAULT: '#17FFAD', foreground: '#06100C',
        },
        success: {
          50: '#063D2A', 100: '#0A6B48', 200: '#0E9A68', 300: '#12CC8A', 400: '#14E69A',
          500: '#17FFAD', 600: '#5CFFC1', 700: '#8FFFD3', 800: '#C4FFE8', 900: '#E8FFF6',
          DEFAULT: '#17FFAD', foreground: '#06100C',
        },
        danger: {
          50: '#3D0F07', 100: '#6B1A0D', 200: '#9A2612', 300: '#CC3318', 400: '#E6461F',
          500: '#FF5A36', 600: '#FF7E62', 700: '#FFA28E', 800: '#FFC7BA', 900: '#FFE9E4',
          DEFAULT: '#FF5A36', foreground: '#FFFFFF',
        },
        warning: {
          50: '#3D2A05', 100: '#6B4A0A', 200: '#9A6B0E', 300: '#CC8D14', 400: '#E69E1A',
          500: '#FFB020', 600: '#FFC24D', 700: '#FFD47A', 800: '#FFE6A8', 900: '#FFF5D9',
          DEFAULT: '#FFB020', foreground: '#1A1200',
        },
        secondary: {
          50: '#073231', 100: '#0B5553', 200: '#107877', 300: '#169B9A', 400: '#1DB2B1',
          500: '#28C8C7', 600: '#55D6D5', 700: '#82E3E2', 800: '#B0EFEE', 900: '#DDF9F9',
          DEFAULT: '#28C8C7', foreground: '#06100C',
        },
      },
    },
    light: {
      colors: {
        background: '#E8ECEA',
        foreground: '#0E1412',
        focus: '#0A8C5F',
        overlay: '#000000',
        divider: '#0E1412',
        content1: '#F4F6F5',
        content2: '#FFFFFF',
        content3: '#DEE4E1',
        content4: '#CCD4D0',
        default: {
          50: '#F4F6F5', 100: '#E8ECEA', 200: '#DEE4E1', 300: '#CCD4D0', 400: '#A9B4AE',
          500: '#7B8A84', 600: '#4F5E58', 700: '#34413C', 800: '#1E2824', 900: '#0E1412',
          DEFAULT: '#CCD4D0', foreground: '#0E1412',
        },
        primary: {
          50: '#E6F7F0', 100: '#C2EBD9', 200: '#8FD9B9', 300: '#5CC69A', 400: '#2EAB7A',
          500: '#0A8C5F', 600: '#08754F', 700: '#065C3E', 800: '#04432D', 900: '#02281B',
          DEFAULT: '#0A8C5F', foreground: '#FFFFFF',
        },
        success: {
          50: '#E6F7F0', 100: '#C2EBD9', 200: '#8FD9B9', 300: '#5CC69A', 400: '#2EAB7A',
          500: '#0A8C5F', 600: '#08754F', 700: '#065C3E', 800: '#04432D', 900: '#02281B',
          DEFAULT: '#0A8C5F', foreground: '#FFFFFF',
        },
        danger: {
          50: '#FDEBE6', 100: '#F9CDC2', 200: '#F2A08C', 300: '#EA7458', 400: '#E0532F',
          500: '#D63A1B', 600: '#B33016', 700: '#8F2611', 800: '#6B1C0D', 900: '#471208',
          DEFAULT: '#D63A1B', foreground: '#FFFFFF',
        },
        warning: {
          50: '#FFF4DC', 100: '#FFE3AD', 200: '#FFCF75', 300: '#F5B43D', 400: '#D99214',
          500: '#B87400', 600: '#965E00', 700: '#744800', 800: '#523300', 900: '#301E00',
          DEFAULT: '#B87400', foreground: '#FFFFFF',
        },
        secondary: {
          50: '#E3F6F6', 100: '#BEEAEA', 200: '#8FDAD9', 300: '#5FC7C6', 400: '#36ABAA',
          500: '#1A8F8E', 600: '#157574', 700: '#105B5A', 800: '#0B4140', 900: '#062827',
          DEFAULT: '#1A8F8E', foreground: '#FFFFFF',
        },
      },
    },
  },
})
