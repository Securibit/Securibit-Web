"use client";
/* eslint-disable @next/next/no-img-element */
import { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { formatDateTime } from "@/lib/utils";
import { showError } from "@/lib/errorDialog";
import { PersonalCardProps } from "@/types/Profile/PersonalCard";
import useAuth from "./auth/useAuth";

// 資料庫給每個人預設的背景圖；等於「沒有設定」，不顯示
const DEFAULT_BG_PHOTO = 'https://img.freepik.com/free-photo/abstract-luxury-plain-blur-grey-black-gradient-used-as-background-studio-wall-display-your-products_1258-63747.jpg?w=2000';

// 像 iOS 設定的分組列表：上面是身分，下面一組一組的欄位
const PersonalCard = (props: PersonalCardProps) => {
  const { profile } = props;
  const router = useRouter();
  const { logout } = useAuth();
  const siteRoles = props.siteRoles ?? [];
  const bgPhoto = profile.bgPhotoURL && profile.bgPhotoURL !== DEFAULT_BG_PHOTO ? profile.bgPhotoURL : '';

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(profile.uid);
      toast.success("已複製", { position: "top-right" });
    } catch {
      showError("無法複製", "瀏覽器不允許存取剪貼簿，請手動複製使用者 ID。");
    }
  };

  const groups: { title: string; rows: [string, ReactNode][] }[] = [
    {
      title: '帳號',
      rows: [
        ['@ID', profile.username ? `@${profile.username}` : <Link key="set" href="/me/update_info" className="text-accent">設定</Link>],
        [
          '使用者 ID',
          <button key="uid" type="button" onClick={copyUid} title="點一下複製" className="flex max-w-full items-center gap-2 text-ink hover:opacity-60">
            <span className="truncate text-[15px] tabular-nums">{profile.uid}</span>
            <FontAwesomeIcon icon={faCopy} className="w-3.5 shrink-0 text-ink-muted" />
          </button>,
        ],
        ['電子郵件', profile.email || '無'],
        ['驗證狀態', profile.emailVerified ? '已驗證' : '未驗證'],
        ['電話', profile.phoneNumber || '無'],
        ...(siteRoles.length > 0
          ? [['身分組', <span key="roles" className="flex flex-wrap justify-end gap-1.5">
              {siteRoles.map((role) => (
                <span key={role.id} className="rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px]">{role.name}</span>
              ))}
            </span>] as [string, ReactNode]]
          : []),
      ],
    },
    {
      title: '登入資訊',
      rows: [
        ['建立時間', formatDateTime(profile.metadata.creationTime)],
        ['最後登入', formatDateTime(profile.lastLoginAt)],
        ['IP', profile.lastLoginIp || '無'],
        ['裝置', profile.lastLoginDevice || '無'],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* 身分 */}
      <div className="overflow-hidden rounded-[18px] border border-line/70 bg-surface">
        {bgPhoto && <img className="h-32 w-full object-cover" src={bgPhoto} alt="" />}
        <div className="flex items-center gap-4 px-5 py-5">
          {profile.photoURL ? (
            <img className="h-16 w-16 shrink-0 rounded-full object-cover" src={profile.photoURL} referrerPolicy="no-referrer" alt="" />
          ) : (
            // 沒有大頭照時顯示名字的第一個字
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-1 text-2xl font-semibold">
              {profile.name.slice(0, 1) || '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[22px] font-semibold">{profile.name}</p>
            <p className="truncate text-[15px] text-ink-muted">{profile.email}</p>
          </div>
          <button onClick={() => router.push('/me/update_info')} className="shrink-0 text-[17px] text-accent hover:underline">
            編輯
          </button>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.title}>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">{group.title}</h2>
          <dl className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {group.rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-6 px-5 py-3">
                <dt className="shrink-0 text-[17px]">{label}</dt>
                <dd className="min-w-0 text-right text-[17px] text-ink-muted">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {props.children}

      <button onClick={logout} className="rounded-[18px] border border-line/70 bg-surface py-3 text-center text-[17px] text-alarm hover:bg-surface-1">
        登出
      </button>
    </div>
  );
};

export default PersonalCard;
