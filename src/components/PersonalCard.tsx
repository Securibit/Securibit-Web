"use client";
/* eslint-disable @next/next/no-img-element */
import { useRouter } from "nextjs-toploader/app";
import { Button } from "@heroui/react";
import { formatDateTime } from "@/lib/utils";
import { PersonalCardProps } from "@/types/Profile/PersonalCard";
import useAuth from "./auth/useAuth";

const PersonalCard = (props: PersonalCardProps) => {
  const { profile } = props;
  const router = useRouter();
  const { logout } = useAuth();

  const rows: [string, string][] = [
    ['Email', profile.email || '無'],
    ['手機號碼', profile.phoneNumber || '無'],
    ['Email 是否驗證', profile.emailVerified ? '是' : '否'],
    ['創建時間', formatDateTime(profile.metadata.creationTime)],
    ['最後登入時間', formatDateTime(profile.lastLoginAt)],
    ['最後登入 IP', profile.lastLoginIp || '無'],
    ['最後登入裝置', profile.lastLoginDevice || '無'],
    ['UID', profile.uid],
  ];

  return (
    <div className="w-full overflow-hidden bg-white border border-gray-blue-200 rounded-lg shadow dark:bg-gray-blue-800 dark:border-gray-blue-700">
      {/* 背景圖 */}
      <div className="h-32 sm:h-44 bg-gradient-to-r from-tpp/40 to-bityo/30">
        {profile.bgPhotoURL && (
          <img className="h-full w-full object-cover" src={profile.bgPhotoURL} alt="" />
        )}
      </div>

      <div className="flex flex-col items-center px-4 pb-8">
        <div className="relative -mt-12 mb-3">
          {profile.photoURL ? (
            <img
              className="w-24 h-24 rounded-full object-cover ring-4 ring-white shadow-lg dark:ring-gray-blue-800"
              src={profile.photoURL}
              referrerPolicy="no-referrer"
              alt={`${profile.name} 的大頭照`}
            />
          ) : (
            <div className="flex w-24 h-24 items-center justify-center rounded-full bg-tpp text-3xl font-bold text-white ring-4 ring-white dark:ring-gray-blue-800">
              {profile.name.slice(0, 1) || '?'}
            </div>
          )}
          <span className="right-1 bottom-1 absolute w-5 h-5 bg-green-400 border-2 border-white dark:border-gray-blue-800 rounded-full"></span>
        </div>

        <h5 className="mb-1 text-xl font-medium text-gray-blue-900 dark:text-white">{profile.name}</h5>

        <table className="text-sm my-3 w-full max-w-lg table-fixed">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td className="w-32 px-2 py-2 align-top text-gray-blue-500 font-semibold">{label}</td>
                <td className="px-2 py-2 break-all text-gray-blue-900 dark:text-white">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex mt-4 gap-3">
          <Button color="primary" onPress={() => router.push('/me/update_info')}>管理帳戶</Button>
          <Button variant="bordered" onPress={logout}>登出帳戶</Button>
        </div>
      </div>
    </div>
  );
};

export default PersonalCard;
