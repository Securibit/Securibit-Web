import type { AppRelease, PlatformDownloads, PlatformId, ReleaseFile } from '@/types/Download/Release';

// App 的安裝檔放在 GitHub Release，公開 API 不需要 token（每小時 60 次，ISR 10 分鐘一次夠用）
const LATEST_API = 'https://api.github.com/repos/Securibit/Securibit-APP/releases/latest';
export const RELEASES_URL = 'https://github.com/Securibit/Securibit-APP/releases';
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;

export const RELEASE_REVALIDATE_SECONDS = 600;

interface GitHubAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  published_at: string | null;
  assets: GitHubAsset[];
}

// 版本號是變數：securibit-1.0.0-arm64-v8a.apk、securibit_1.2.0~beta1_amd64.deb 都要比得到
const VERSION = String.raw`v?\d[\w.~+-]*?`;
const fileRule = (pattern: string) => new RegExp(`^${pattern}$`, 'i');

interface FileSpec extends Omit<ReleaseFile, 'name' | 'url' | 'size' | 'command'> {
  rule: RegExp;
  command?: (name: string) => string;
}

interface PlatformSpec extends Omit<PlatformDownloads, 'files'> {
  files: FileSpec[];
}

const PLATFORMS: PlatformSpec[] = [
  {
    id: 'macos',
    name: 'macOS',
    requirement: 'macOS 10.15 以上',
    files: [
      {
        rule: fileRule(String.raw`securibit-${VERSION}-macos\.dmg`),
        label: 'Intel 與 Apple Silicon 都能用',
        recommended: true,
      },
    ],
  },
  {
    id: 'android',
    name: 'Android',
    requirement: 'Android 7.0 以上',
    footnote: '不確定選哪個就選第一個。第一次安裝時，手機會要你允許瀏覽器「安裝不明應用程式」。',
    files: [
      {
        rule: fileRule(String.raw`securibit-${VERSION}-arm64-v8a\.apk`),
        label: '大部分手機',
        recommended: true,
      },
      {
        rule: fileRule(String.raw`securibit-${VERSION}-armeabi-v7a\.apk`),
        label: '較舊的 32 位元手機',
      },
      {
        rule: fileRule(String.raw`securibit-${VERSION}-x86_64\.apk`),
        label: 'x86_64 裝置或模擬器',
      },
    ],
  },
  {
    id: 'linux',
    name: 'Linux',
    requirement: '目前只有 x64',
    files: [
      {
        rule: fileRule(String.raw`securibit_${VERSION}_amd64\.deb`),
        label: 'Ubuntu、Debian',
        recommended: true,
        command: (name) => `sudo apt install ./${name}`,
      },
      {
        rule: fileRule(String.raw`securibit-${VERSION}-linux-x64\.tar\.gz`),
        label: '其他發行版',
        note: '需要先裝好 GTK 3、libsecret、libayatana-appindicator3。',
        command: (name) => `tar -xzf ${name} && ./securibit/securibit`,
      },
    ],
  },
];

export const PLATFORM_IDS: PlatformId[] = PLATFORMS.map((platform) => platform.id);

// 發佈日期一律用台北時間，伺服器在哪個時區都一樣
const formatDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}/${get('month')}/${get('day')}`;
};

const toRelease = (data: GitHubRelease): AppRelease => {
  const assets = Array.isArray(data.assets) ? data.assets : [];

  const platforms = PLATFORMS.map(({ files, ...platform }) => ({
    ...platform,
    files: files.flatMap(({ rule, command, ...spec }) => {
      const asset = assets.find((item) => rule.test(item.name));
      if (!asset) return [];
      return [{
        ...spec,
        name: asset.name,
        url: asset.browser_download_url,
        size: asset.size,
        command: command?.(asset.name),
      }];
    }),
  }));

  const tag = data.tag_name || '';
  return {
    version: tag.startsWith('v') ? tag : `v${tag}`,
    publishedDate: formatDate(data.published_at),
    htmlUrl: data.html_url || LATEST_RELEASE_URL,
    platforms,
  };
};

/** 伺服器端讀最新版的安裝檔；GitHub 讀不到或格式不對就回傳 null，由頁面顯示退回連結 */
export const getLatestRelease = async (): Promise<AppRelease | null> => {
  try {
    const res = await fetch(LATEST_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Securibit-Web',
      },
      next: { revalidate: RELEASE_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as GitHubRelease;
    if (!data?.tag_name) return null;

    const release = toRelease(data);
    // 一個平台都比不到，當作讀不到，直接給 GitHub 連結
    return release.platforms.some((platform) => platform.files.length > 0) ? release : null;
  } catch {
    return null;
  }
};
