# TOTP 2FA 驗證器（重構版）

<p align="center">
    <img src="public/imgs/bityo.png" width="120"></img>
</p>
<p align="center">
    <a href="https://2fa.bityo.tw">2fa.bityo.tw</a> ·
    <a href="https://github.com/Securibit/Securibit-Web">GitHub</a> ·
    <a href="#授權">CC BY-NC 4.0</a>
</p>

<p align="center">
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
    <img alt="React" src="https://img.shields.io/badge/React-19-149eca?logo=react" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript" />
    <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss&logoColor=white" />
    <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3fcf8e?logo=supabase&logoColor=white" />
    <img alt="HeroUI" src="https://img.shields.io/badge/HeroUI-2-9353d3" />
    <img alt="License" src="https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey" />
</p>


支援 OTP / TOTP / HOTP 一次性密碼演算法的二步驟驗證器。原本後端使用 **Firebase（Auth + Firestore）**，本團隊於 2026/06/18 決議將後端重構為 **Supabase（PostgreSQL + Auth + RLS）**，前端同步升級至 **Next.js 16 + React 19 + Tailwind CSS 4**。

## Skills
| Items | Content |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 |
| Lang | TypeScript |
| CSS | Tailwind CSS 4 |
| UI | HeroUI, react-hot-toast, Framer Motion, Swiper |
| DB / Auth | Supabase (PostgreSQL + Auth + RLS) |
| 2FA | totp-generator |
| Package Manager | pnpm |
| Deploy | Vercel |


## Installation
### env
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<proj_name>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_public_key>
# 僅後端使用（刪除帳號 / 記錄登入 API、資料匯入腳本），切勿外洩
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
```

### start
```bash
pnpm i
pnpm dev
pnpm build && pnpm start
```

> Firebase → Supabase 的資料搬移步驟另見 [`MIGRATION.md`](./MIGRATION.md)。

## 開發者
由幣友 BITYO 與靈魂之神工作室共同開發。

- 夏特稀 — <https://github.com/mmm25002500>
- 糖豆魚 — <https://github.com/PTDTW>

## 貢獻
有問題就開 issue。要改東西的話 fork 出去開分支發 PR，commit 訊息寫清楚、確認 `pnpm build` 過得了再丟。
動樣式請用 Tailwind，沿用 `tailwind.config.ts` 既有的設計 token，別改到原本的版面。

## 授權
採用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh-Hant)，完整條款見 [`LICENSE`](./LICENSE)。
可自由使用、改作、學習，但**不能商用**，且**要標明來源**（TershiXia／幣友 BITYO／靈魂之神工作室）。

© 2026 TershiXia · 幣友 BITYO 🤝 靈魂之神工作室
