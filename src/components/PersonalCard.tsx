"use client";
/* eslint-disable @next/next/no-img-element */
import { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { cn, formatDateTime } from "@/lib/utils";
import { showError } from "@/lib/errorDialog";
import { PersonalCardProps } from "@/types/Profile/PersonalCard";
import useAuth from "./auth/useAuth";

// 身分證／儀表卡：上方是身分（大頭照、名稱、@ID、使用者 ID、身分組），下方是一列一列的規格
const PersonalCard = (props: PersonalCardProps) => {
  const { profile } = props;
  const router = useRouter();
  const { logout } = useAuth();
  const siteRoles = props.siteRoles ?? [];

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(profile.uid);
      toast.success("已複製使用者 ID！", { position: "top-right" });
    } catch {
      showError("無法複製", "瀏覽器不允許存取剪貼簿，請手動複製使用者 ID。");
    }
  };

  // 規格列：欄位名用 tech-label，值一律等寬
  const rows: [string, ReactNode][] = [
    ['EMAIL', profile.email || '無'],
    [
      'VERIFIED',
      <span key="verified" className="inline-flex items-center gap-2">
        <span className={cn("led", !profile.emailVerified && "led-off")} aria-hidden />
        {profile.emailVerified ? '已驗證' : '未驗證'}
      </span>,
    ],
    ['PHONE', profile.phoneNumber || '無'],
    ['CREATED', formatDateTime(profile.metadata.creationTime)],
    ['LAST LOGIN', formatDateTime(profile.lastLoginAt)],
    ['LAST IP', profile.lastLoginIp || '無'],
    ['LAST DEVICE', profile.lastLoginDevice || '無'],
  ];

  return (
    <section className="panel boot">
      {/* 卡片頂列：卡別與登入狀態 */}
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="tech-label">ID CARD // SECURIBIT</p>
        <p className="tech-label flex items-center gap-2">
          <span className="led" aria-hidden />
          SIGNED IN
        </p>
      </div>

      {/* 背景圖：有設定才顯示，當成卡片上的一條帶子 */}
      {profile.bgPhotoURL && (
        <div className="h-24 border-b border-line sm:h-32">
          <img className="h-full w-full object-cover" src={profile.bgPhotoURL} alt="" />
        </div>
      )}

      {/* 身分區 */}
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
        {profile.photoURL ? (
          <img
            className="h-24 w-24 shrink-0 border border-line-strong object-cover"
            src={profile.photoURL}
            referrerPolicy="no-referrer"
            alt={`${profile.name} 的大頭照`}
          />
        ) : (
          // 沒有大頭照時顯示名字的第一個字
          <div className="flex h-24 w-24 shrink-0 items-center justify-center border border-line-strong bg-phos font-display text-4xl font-bold text-phos-ink">
            {profile.name.slice(0, 1) || '?'}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="break-words font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {profile.name}
          </h2>

          {profile.username ? (
            <p className="mt-1 font-mono text-sm text-phos">@{profile.username}</p>
          ) : (
            <Link
              href="/me/update_info"
              className="mt-1 inline-block font-mono text-sm text-ink-muted underline underline-offset-4 transition-colors hover:text-phos"
            >
              尚未設定 @ID
            </Link>
          )}

          {/* 使用者 ID：點一下複製 */}
          <button
            type="button"
            onClick={copyUid}
            title="點擊複製"
            className="mt-2 inline-flex max-w-full items-start gap-1.5 text-left font-mono text-xs break-all text-ink-dim transition-colors hover:text-phos"
          >
            <span className="shrink-0">UID</span>
            <span>{profile.uid}</span>
            <FontAwesomeIcon icon={faCopy} className="mt-0.5 w-3 shrink-0" />
          </button>

          {/* 全站身分組：方形小標籤 + 身分組顏色的方點 */}
          {siteRoles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {siteRoles.map((role) => (
                <span
                  key={role.id}
                  className="tech-label inline-flex max-w-full items-center gap-1.5 border border-line px-1.5 py-0.5 text-ink"
                >
                  <span
                    className={cn("h-2 w-2 shrink-0", !role.color && "bg-ink-dim")}
                    style={role.color ? { backgroundColor: role.color } : undefined}
                    aria-hidden
                  />
                  <span className="truncate">{role.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 規格列 */}
      <dl className="border-t border-line">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[7rem_1fr] gap-x-4 border-b border-line px-5 py-2.5 transition-colors hover:bg-ink/5 sm:grid-cols-[9rem_1fr] sm:px-6"
          >
            <dt className="tech-label pt-0.5">{label}</dt>
            <dd className="min-w-0 break-all font-mono text-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {/* 操作 */}
      <div className="flex flex-wrap gap-2 p-5 sm:p-6">
        <Button color="primary" className="font-display tracking-[0.08em]" onPress={() => router.push('/me/update_info')}>
          管理帳戶
        </Button>
        <Button variant="bordered" className="font-display tracking-[0.08em]" onPress={logout}>
          登出帳戶
        </Button>
      </div>
    </section>
  );
};

export default PersonalCard;
