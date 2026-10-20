"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import PageContent from "@/components/layout/PageContent";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Loading/Spinner";
import RoleChip from "@/components/permissions/RoleChip";
import useAuth from "@/components/auth/useAuth";
import { isUuid, loadUserPublic, normalizeUsernameParam, userPageHref } from "@/lib/users/users";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { UserPublic } from "@/types/User/UserPublic";
import UserAdminActions from "./_components/UserAdminActions";
import SharedGroups from "./_components/SharedGroups";

// 名稱的第一個字（用 Array.from 才不會把 emoji 切成一半）
const firstChar = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? "?";

// 別人的個人頁面（/u/<@ID>，沒有 @ID 的用 /u/<id>）：大頭照、名稱、@ID、身分組，
// 下面是加入時間、共同群組，有權限時最後是「管理」（像 iOS 設定的分組列表）
const UserPageClient = () => {
  const params = useParams<{ id: string }>();
  // UUID 就是使用者 id，其他當 @ID
  const param = params.id;
  const router = useRouter();
  const { user, profile } = useAuth();
  const [data, setData] = useState<UserPublic>();
  const [error, setError] = useState<string>();
  // data 是用哪個網址參數讀到的（換人時舊資料還在，不能拿來換網址）
  const [loadedParam, setLoadedParam] = useState<string>();

  // 自己的 id、自己的 @ID，或查到的人就是自己
  const paramIsSelf = isUuid(param)
    ? param.toLowerCase() === user?.uid
    : !!profile?.username && normalizeUsernameParam(param) === profile.username;
  const isSelf = !!user && (paramIsSelf || data?.id === user.uid);

  // 看自己就換到自己的個人頁面
  useEffect(() => {
    if (isSelf) router.replace("/me/MyPage");
  }, [isSelf, router]);

  // 登入狀態由 AuthGate 確認過
  useEffect(() => {
    if (!user || isSelf) return;
    let cancelled = false;
    loadUserPublic(param).then((result) => {
      if (cancelled) return;
      setLoadedParam(param);
      if (result.success) {
        setData(result.data);
        setError(undefined);
      } else {
        setData(undefined);
        setError(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, param, isSelf]); // eslint-disable-line react-hooks/exhaustive-deps

  // 正式網址：有 @ID 用 /u/<username>，沒有用 /u/<id>（用 id 開、大小寫不同、改過 @ID 時換過去）
  const canonical = data && !isSelf ? (data.username ?? data.id) : undefined;
  useEffect(() => {
    if (canonical && data && loadedParam === param && param !== canonical) router.replace(userPageHref(data.id, data.username));
  }, [canonical, param, loadedParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // 操作後重新讀（用 id 讀，改過 @ID 也找得到）；失敗時保留畫面上的資料
  const dataId = data?.id;
  const reload = useCallback(async () => {
    if (!dataId) return;
    const result = await loadUserPublic(dataId);
    if (result.success) setData(result.data);
    else showError("重新載入失敗", result.message);
  }, [dataId]);

  if (error) {
    return (
      <PageContent className="max-w-2xl">
        <PageHeader title="個人頁面" />
        <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">{error}</div>
      </PageContent>
    );
  }

  if (isSelf || !data) return <Spinner block label="載入使用者…" />;

  const name = data.name || "（未命名）";

  return (
    <PageContent className="max-w-2xl">
      <PageHeader title="個人頁面" />
      <div className="flex flex-col gap-8">
        {/* 身分 */}
        <div className="flex items-center gap-4 overflow-hidden rounded-[18px] border border-line/70 bg-surface px-5 py-5">
          {data.photo_url ? (
            <img className="h-16 w-16 shrink-0 rounded-full object-cover" src={data.photo_url} referrerPolicy="no-referrer" alt="" />
          ) : (
            // 沒有大頭照時顯示名字的第一個字
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-1 text-2xl font-semibold">
              {firstChar(data.name || "?")}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[22px] font-semibold">{name}</p>
            {data.username && <p className="truncate text-[15px] text-ink-muted">@{data.username}</p>}
            {data.site_roles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.site_roles.map((role) => (
                  <RoleChip key={role.id} role={role} />
                ))}
              </div>
            )}
          </div>
        </div>

        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">帳號</h2>
          <dl className="overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            <div className="flex items-center justify-between gap-6 px-5 py-3">
              <dt className="shrink-0 text-[17px]">加入時間</dt>
              <dd className="min-w-0 text-right text-[17px] text-ink-muted">{formatDateTime(data.created_at)}</dd>
            </div>
          </dl>
        </section>

        <SharedGroups key={data.id} target={data} onChanged={reload} />

        {/* 管理：依全站權限顯示（key 換人時重新讀身分組與資料） */}
        <UserAdminActions key={data.id} target={data} onChanged={reload} />
      </div>
    </PageContent>
  );
};

export default UserPageClient;
