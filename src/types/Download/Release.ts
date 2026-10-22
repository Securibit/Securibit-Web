// 下載頁：GitHub Release 整理成各平台的安裝檔

export type PlatformId = 'macos' | 'windows' | 'android' | 'linux';

// 訪客目前用的裝置；ios 目前沒有安裝檔
export type DevicePlatform = PlatformId | 'ios' | 'windows' | 'other';

export interface ReleaseFile {
  name: string;
  url: string;
  size: number;
  // 這個檔案給誰用，例如「大部分手機」
  label: string;
  // 額外說明（需要的套件等）
  note?: string;
  // 安裝指令（Linux）
  command?: string;
  // 同平台裡最推薦的那個
  recommended?: boolean;
}

export interface PlatformDownloads {
  id: PlatformId;
  name: string;
  // 系統需求
  requirement: string;
  // 列表下方的補充說明
  footnote?: string;
  // 這一版沒有檔案時整個平台不顯示（較晚才支援的平台，舊版本本來就沒有）
  hideWhenEmpty?: boolean;
  files: ReleaseFile[];
}

export interface AppRelease {
  // 顯示用版本號，例如 v1.0.0
  version: string;
  // 伺服器端先排好的發佈日期（台北時間 YYYY/MM/DD），避免 hydration 不一致
  publishedDate: string | null;
  htmlUrl: string;
  platforms: PlatformDownloads[];
}

export interface DownloadClientProps {
  // 讀不到 GitHub 時是 null，頁面改顯示退回連結
  release: AppRelease | null;
}
