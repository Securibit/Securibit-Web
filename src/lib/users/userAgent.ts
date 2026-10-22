// 從 user-agent 粗略解析出系統、瀏覽器與裝置種類。
// 登入紀錄（/api/record-login）與已登入的裝置共用；App 的 lib/features/profile/session_models.dart 照同樣的規則
export interface UserAgentInfo {
  os: string;
  browser: string;
  // 裝置種類：iPhone、iPad、Mac、Android 裝置、Windows 電腦、Linux 電腦
  device: string;
}

// Securibit App：呼叫網站 API 時是 SecuribitApp (…)，直接打 Supabase 時是 Dart 預設的 Dart/3.x (dart:io)
const APP = /SecuribitApp|^Dart\//i;

export const parseUserAgent = (ua: string): UserAgentInfo => {
  let os = '未知系統';
  let device = '未知裝置';
  if (/iPad/i.test(ua)) [os, device] = ['iOS', 'iPad'];
  else if (/iPhone|iPod/i.test(ua)) [os, device] = ['iOS', 'iPhone'];
  else if (/Android/i.test(ua)) [os, device] = ['Android', 'Android 裝置'];
  else if (/Mac OS X|Macintosh/i.test(ua)) [os, device] = ['macOS', 'Mac'];
  else if (/Windows/i.test(ua)) [os, device] = ['Windows', 'Windows 電腦'];
  else if (/Linux/i.test(ua)) [os, device] = ['Linux', 'Linux 電腦'];

  let browser = '未知瀏覽器';
  if (APP.test(ua)) browser = 'Securibit App';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\/|CriOS\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\/|FxiOS\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return { os, browser, device };
};

// 登入紀錄的「OS · 瀏覽器」
export const deviceText = (ua: string): string => {
  if (!ua) return '未知裝置';
  const { os, browser } = parseUserAgent(ua);
  return `${os} · ${browser}`;
};
