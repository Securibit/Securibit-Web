"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ScopePicker from './_components/ScopePicker';
import GroupCodes from '@/app/groups/[id]/_components/GroupCodes';
import CreateGroupModal from '@/app/groups/_components/CreateGroupModal';
import Spinner from '@/components/ui/Loading/Spinner';
import PageContent from '@/components/layout/PageContent';
import PageHeader from '@/components/layout/PageHeader';
import useAuth from '@/components/auth/useAuth';
import { readCodeScope, writeCodeScope } from '@/lib/codeScope';
import { loadGroupDetail, loadMyGroups } from '@/lib/groups/groups';
import { GROUP, SITE, hasAny } from '@/lib/permissions/bits';
import { Actor } from '@/lib/permissions/hierarchy';
import { GroupDetail, GroupSummary } from '@/types/Group/Group';
import { showError } from "@/lib/errorDialog";

// 記住的群組還在就用它，否則用預設群組（沒有就第一個）
const pickScope = (remembered: string, list: GroupSummary[]) =>
  list.some((group) => group.id === remembered)
    ? remembered
    : (list.find((group) => group.is_default) ?? list[0])?.id ?? '';

/*
 * 驗證碼頁：「我的驗證碼」就是預設群組，和其他群組一樣用 GroupCodes 顯示。
 * 最上面的切換列出所有群組（預設群組排第一），選擇記在這個瀏覽器。
 */
const CodeClient = () => {
  const { user, can } = useAuth();
  // 記住的群組 id；實際顯示哪個由 pickScope 決定
  const [remembered, setRemembered] = useState(readCodeScope);
  const [groups, setGroups] = useState<GroupSummary[]>();
  const [createOpen, setCreateOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ gid: string; data: GroupDetail }>();

  const scope = groups ? pickScope(remembered, groups) : '';

  const selectScope = (gid: string) => {
    setRemembered(gid);
    writeCodeScope(gid);
  };

  // 我的群組（切換列用）
  const reloadGroups = async () => {
    const result = await loadMyGroups();
    if (!result.success) showError('載入群組失敗', result.message);
    const list = result.success ? result.data : [];
    setGroups(list);
    return list;
  };
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadMyGroups().then((result) => {
      if (cancelled) return;
      if (!result.success) showError('載入群組失敗', result.message);
      setGroups(result.success ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 載入群組詳情（記著是哪個群組的，切換時舊的就不算數）
  const detail = loaded?.gid === scope ? loaded.data : undefined;
  const applyDetail = (gid: string, result: Awaited<ReturnType<typeof loadGroupDetail>>) => {
    if (result.success && result.data) {
      setLoaded({ gid, data: result.data });
    } else {
      showError('無法開啟群組', result.success ? '找不到這個群組。' : result.message);
      // 打不開（例如剛被移出群組）就回到預設群組
      selectScope('');
      reloadGroups();
    }
  };
  const reloadDetail = async () => {
    if (scope) applyDetail(scope, await loadGroupDetail(scope));
  };
  useEffect(() => {
    if (!user || !scope) return;
    let cancelled = false;
    loadGroupDetail(scope).then((result) => {
      if (!cancelled) applyDetail(scope, result);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // 擁有者、全站管理員 / 管理所有群組：不受階層限制
  const actor = useMemo<Actor>(
    () => ({
      unrestricted: !!detail?.is_owner || can(SITE.ADMINISTRATOR) || can(SITE.MANAGE_GROUPS),
      topPosition: detail?.top_position ?? 0,
    }),
    [detail?.is_owner, detail?.top_position, can]
  );

  const selectedGroup = groups?.find((group) => group.id === scope);
  // 加密的群組不能邀請
  const canShare = !!detail && !detail.group.encrypted && hasAny(detail.permissions, [GROUP.CREATE_INVITE, GROUP.MANAGE_GROUP]);

  // 標題列：群組名、成員數、分享／管理（只有自己一個人的群組不顯示成員數）
  const groupHeading = selectedGroup && (
    <div className="min-w-0">
      <p className="truncate text-[22px] font-semibold">{selectedGroup.name}</p>
      <p className="flex flex-wrap items-center gap-x-3 text-[15px] text-ink-muted">
        {selectedGroup.member_count > 1 && <span>{selectedGroup.member_count} 位成員</span>}
        {selectedGroup.is_default && <span>預設群組</span>}
        {canShare && (
          <Link href={`/groups/${scope}?tab=invites`} className="text-accent hover:underline">分享給其他人</Link>
        )}
        <Link href={`/groups/${scope}`} className="text-accent hover:underline">管理</Link>
      </p>
    </div>
  );

  return (
    <PageContent className="max-w-3xl">
      <PageHeader title="驗證碼" />

      {groups && groups.length > 0 && (
        <div className="mb-5">
          <ScopePicker
            groups={groups}
            selected={scope}
            onSelect={selectScope}
            onCreate={can(SITE.CREATE_GROUPS) ? () => setCreateOpen(true) : undefined}
          />
        </div>
      )}

      {!groups ? (
        <Spinner block label="載入驗證碼…" />
      ) : groups.length === 0 ? (
        <div className="rounded-[18px] bg-surface-1 px-6 py-16 text-center">
          <p className="text-[19px] font-semibold">找不到你的驗證碼</p>
          <p className="mt-1 text-ink-muted">重新整理頁面試試看；登入時會自動建立「我的」</p>
        </div>
      ) : detail ? (
        <GroupCodes key={scope} detail={detail} actor={actor} onChanged={reloadDetail} heading={groupHeading} />
      ) : (
        <Spinner block label="載入驗證碼…" />
      )}

      <CreateGroupModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async (gid) => {
          setCreateOpen(false);
          await reloadGroups();
          selectScope(gid);
        }}
      />
    </PageContent>
  );
};

export default CodeClient;
