"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { LATEST_RELEASE_URL, PLATFORM_IDS, RELEASES_URL } from "@/lib/release";
import type { DevicePlatform, DownloadClientProps, PlatformDownloads, ReleaseFile } from "@/types/Download/Release";

// 只在瀏覽器判斷平台；伺服器端回 null，照預設順序排，不偵測也完整可用
const detectPlatform = (): DevicePlatform => {
  const ua = navigator.userAgent;
  // iPadOS 的 Safari 預設回報成 Mac，用觸控點分辨
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/CrOS/i.test(ua)) return 'other';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'other';
};

const subscribe = () => () => {};
const useDevicePlatform = () => useSyncExternalStore<DevicePlatform | null>(subscribe, detectPlatform, () => null);

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("已複製指令");
  } catch {
    toast.error("沒辦法複製，請手動選取");
  }
};

const YourDevice = () => (
  <span className="rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] font-semibold tracking-normal text-accent">
    你的裝置
  </span>
);

// 平台標題：平台名稱大字，系統需求灰字
const PlatformHeading = (props: { name: string; requirement: string; mine: boolean }) => (
  <div className="px-1">
    <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[28px] font-bold tracking-tight sm:text-[32px]">
      {props.name}
      {props.mine && <YourDevice />}
    </h2>
    <p className="mt-1 text-[17px] text-ink-muted">{props.requirement}</p>
  </div>
);

// 一列一個安裝檔，像 App Store 的「取得」按鈕；推薦的那個用品牌綠底
const FileRow = ({ file }: { file: ReleaseFile }) => (
  <li className="px-5 py-4 sm:px-6">
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[19px] font-semibold">{file.label}</p>
        <p className="mt-0.5 break-all text-[15px] text-ink-muted">
          {file.name}
          <span className="whitespace-nowrap tabular-nums"> · {formatSize(file.size)}</span>
        </p>
      </div>
      <a
        href={file.url}
        aria-label={`下載 ${file.name}`}
        className={cn(
          "shrink-0 rounded-full px-5 py-2 text-[16px] font-semibold transition-opacity hover:opacity-80",
          file.recommended ? "bg-brand text-accent-ink" : "bg-surface-1 text-accent"
        )}
      >
        下載
      </a>
    </div>
    {file.note && <p className="mt-2 text-[15px] text-ink-muted">{file.note}</p>}
    {file.command && (
      <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-surface-1 py-1.5 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-1 font-mono text-[14px] text-ink">
          {file.command}
        </code>
        <button
          type="button"
          onClick={() => copy(file.command as string)}
          className="shrink-0 rounded-[10px] px-3 py-1 text-[15px] font-semibold text-accent hover:bg-surface"
        >
          複製
        </button>
      </div>
    )}
  </li>
);

const PlatformBlock = ({ platform, mine }: { platform: PlatformDownloads; mine: boolean }) => (
  <div>
    <PlatformHeading name={platform.name} requirement={platform.requirement} mine={mine} />
    {platform.files.length > 0 ? (
      <ul className="mt-4 divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
        {platform.files.map((file) => (
          <FileRow key={file.name} file={file} />
        ))}
      </ul>
    ) : (
      <div className="mt-4 rounded-[18px] border border-line/70 bg-surface px-5 py-4 text-[17px] text-ink-muted sm:px-6">
        這一版沒有 {platform.name} 的安裝檔。
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="link-arrow ml-1">
          看看其他版本
        </a>
      </div>
    )}
    {platform.footnote && platform.files.length > 0 && (
      <p className="mt-3 px-1 text-[15px] text-ink-muted">{platform.footnote}</p>
    )}
  </div>
);

// iOS 還沒上架：照實說，給網頁版當替代
const IosBlock = ({ mine }: { mine: boolean }) => (
  <div>
    <PlatformHeading name="iPhone 與 iPad" requirement="還沒有上架 App Store" mine={mine} />
    <div className="mt-4 rounded-[18px] border border-line/70 bg-surface px-5 py-4 sm:px-6">
      <p className="text-[17px] text-ink-muted">上架之前，可以直接用 Safari 打開這個網站，網頁版的功能都一樣能用。</p>
      <Link href="/" className="link-arrow mt-2 inline-block text-[17px]">
        打開網頁版
      </Link>
    </div>
  </div>
);

// 偵測到的平台：主視覺放一顆大按鈕直接下載最推薦的檔案
const Recommended = ({ device, platforms }: { device: DevicePlatform; platforms: PlatformDownloads[] }) => {
  if (device === 'ios') {
    return <p className="mx-auto mt-8 max-w-xl text-[17px] text-ink-muted">iPhone 版還在準備上架，現在可以先用網頁版。</p>;
  }
  // Linux 有兩種安裝方式，讓使用者自己在下面挑
  if (device !== 'macos' && device !== 'android' && device !== 'windows') return null;

  const platform = platforms.find((item) => item.id === device);
  const file = platform?.files.find((item) => item.recommended) ?? platform?.files[0];
  if (!platform || !file) {
    // 這一版還沒有 Windows 版（Windows 區塊也不會顯示）
    if (device === 'windows') {
      return <p className="mx-auto mt-8 max-w-xl text-[17px] text-ink-muted">這一版還沒有 Windows 版，現在可以先用網頁版。</p>;
    }
    return null;
  }

  return (
    <div className="mt-8 flex flex-col items-center gap-2">
      <Button
        as="a"
        href={file.url}
        color="primary"
        radius="full"
        size="lg"
        startContent={<ArrowDownTrayIcon className="h-5 w-5" strokeWidth={2} />}
        className="h-14 px-8 text-[19px] font-semibold"
      >
        下載 {platform.name} 版
      </Button>
      <p className="text-[15px] text-ink-muted">
        {file.label} · <span className="tabular-nums">{formatSize(file.size)}</span>
      </p>
    </div>
  );
};

// 下載頁：置中的大標題，下面一個平台一組列表（像 iOS 設定），訪客的平台排最前面
const DownloadClient = ({ release }: DownloadClientProps) => {
  const device = useDevicePlatform();

  const platforms = release?.platforms ?? [];
  // 預設照 macOS、Windows、Android、Linux、iOS；偵測到的平台排到最前面
  const order: DevicePlatform[] = [...PLATFORM_IDS, 'ios'];
  const sorted = device && order.includes(device) ? [device, ...order.filter((id) => id !== device)] : order;

  return (
    <>
      <section className="px-5 pt-20 pb-16 text-center sm:pt-28 sm:pb-20">
        <p className="text-[17px] font-semibold text-ink-muted">下載</p>
        <h1 className="mx-auto mt-2 max-w-3xl text-[40px] font-bold tracking-tight sm:text-[56px]">
          Securibit App
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[19px] text-ink-muted sm:text-[21px]">
          和網頁版用同一個帳號，登入後驗證碼和群組都會同步過來，在網站新增的驗證碼 App 馬上看得到。
        </p>

        {release && device && <Recommended device={device} platforms={platforms} />}

        {release ? (
          <div className="mt-8 flex flex-col items-center gap-2 text-[17px]">
            <p className="text-ink-muted">
              最新版本 <span className="font-semibold text-ink">{release.version}</span>
              {release.publishedDate && (
                <>
                  {" · "}
                  <span className="tabular-nums">{release.publishedDate}</span> 發佈
                </>
              )}
            </p>
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="link-arrow">
              所有版本與更新內容
            </a>
          </div>
        ) : (
          <div className="mx-auto mt-10 max-w-md rounded-[18px] border border-line/70 bg-surface px-5 py-6">
            <p className="text-[19px] font-semibold">暫時讀不到下載清單</p>
            <p className="mt-1 text-[16px] text-ink-muted">可以直接到 GitHub 的發佈頁，下載 macOS、Windows、Android、Linux 的安裝檔。</p>
            <Button
              as="a"
              href={LATEST_RELEASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              color="primary"
              radius="full"
              size="lg"
              className="mt-5 h-12 px-7 text-[17px] font-semibold"
            >
              到 GitHub 下載
            </Button>
          </div>
        )}
      </section>

      <section className="border-t border-line/70 px-4 py-14 sm:px-5 sm:py-20">
        <div className="mx-auto flex max-w-2xl flex-col gap-12">
          {sorted.map((id) => {
            if (id === 'ios') return <IosBlock key={id} mine={device === 'ios'} />;
            const platform = platforms.find((item) => item.id === id);
            // 讀不到 GitHub 時只剩上面的退回連結，不列空的平台；這一版沒有 Windows 版時也不列
            if (!platform) return null;
            return <PlatformBlock key={id} platform={platform} mine={device === id} />;
          })}
        </div>
      </section>
    </>
  );
};

export default DownloadClient;
