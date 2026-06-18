// 從純樣式包匯入 plugin（不要從 @heroui/react，那是含 React 元件的大包，
// 在 Tailwind 的 Node plugin 載入環境會失敗導致樣式完全沒產生）
import { heroui } from '@heroui/theme'

export default heroui()
