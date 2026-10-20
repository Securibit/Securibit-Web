"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsUpDown, faEllipsis, faEye, faEyeSlash, faFileExport, faMagnifyingGlass, faPlus, faTrashCan, faXmark } from '@fortawesome/free-solid-svg-icons';
import CodeCard from './_components/CodeCard';
import ScopePicker from './_components/ScopePicker';
import TotpEditModal from './_components/TotpEditModal';
import ExportModal from './_components/ExportModal';
import ShareToGroupModal from './_components/ShareToGroupModal';
import GroupCodes from '@/app/groups/[id]/_components/GroupCodes';
import CreateGroupModal from '@/app/groups/_components/CreateGroupModal';
import ConfirmModal from '@/components/ui/Modal/ConfirmModal';
import Spinner from '@/components/ui/Loading/Spinner';
import PageContent from '@/components/layout/PageContent';
import PageHeader from '@/components/layout/PageHeader';
import useAuth from '@/components/auth/useAuth';
import useVault from '@/components/vault/useVault';
import { cn } from '@/lib/utils';
import { readCodeScope, writeCodeScope } from '@/lib/codeScope';
import { loadGroupDetail, loadMyGroups } from '@/lib/groups/groups';
import { GROUP, SITE, hasAny } from '@/lib/permissions/bits';
import { Actor } from '@/lib/permissions/hierarchy';
import { TotpResult, clearTotp, deleteTotp, isValidSecret, loadTotp, reorderTotp, updateTotp } from '@/lib/totp/crud';
import { GroupDetail, GroupSummary } from '@/types/Group/Group';
import { TotpInput, TotpItem } from '@/types/Totp/Totp';
import { showError } from "@/lib/errorDialog";
import { collectCategories, hasCategory, parseCategories } from '@/lib/totp/categories';

// 「隱藏驗證碼」偏好記在這個瀏覽器（私密視窗等讀寫失敗時就當沒設定）
const HIDE_KEY = 'securibit:hideCodes';
const readHidePref = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
};

// 類別篩選：藥丸
const pillClass = (active: boolean) =>
  cn(
    "shrink-0 rounded-full px-3.5 py-1.5 text-[15px] transition-colors",
    active ? "bg-ink text-surface" : "bg-surface-1 text-ink hover:bg-line/60"
  );

const CodeClient = () => {
  const { user, can } = useAuth();
  // 有啟用加密時的金鑰（VaultGate 確認解鎖後才會掛上這個元件）
  const { key } = useVault();
  const [items, setItems] = useState<TotpItem[]>();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [editing, setEditing] = useState<TotpItem>();
  // 要分享到群組的項目
  const [shareTarget, setShareTarget] = useState<TotpItem>();
  const [keyword, setKeyword] = useState('');
  // 目前篩選的類別，undefined 代表全部
  const [category, setCategory] = useState<string>();
  // AuthGate 確認登入後才掛上這個元件，不會在伺服器端執行，可以直接讀 localStorage
  const [hideCodes, setHideCodes] = useState(readHidePref);

  // 看的是「我的」（空字串）還是哪個群組
  const [scope, setScope] = useState(readCodeScope);
  const [groups, setGroups] = useState<GroupSummary[]>();
  const [createOpen, setCreateOpen] = useState(false);
  // 群組模式用的資料
  const [loaded, setLoaded] = useState<{ gid: string; data: GroupDetail }>();

  const selectScope = (gid: string) => {
    setScope(gid);
    writeCodeScope(gid);
  };

  const toggleHideCodes = (hide: boolean) => {
    setHideCodes(hide);
    try {
      localStorage.setItem(HIDE_KEY, hide ? '1' : '0');
    } catch {
      // 存不了就只在這次有效
    }
  };

  // 所有驗證碼類別的聯集（排序），給篩選與編輯表單當建議選項
  const categories = useMemo(() => collectCategories(items ?? []), [items]);

  // 篩選中的類別被刪光或改名時，自動回到全部
  const activeCategory = category && categories.includes(category) ? category : undefined;

  // 排序模式：顯示全部項目與上下移動按鈕（篩選中的列表無法正確換位置，所以先停用搜尋）
  const [sorting, setSorting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // 連按排序時只採用最後一次請求的結果，避免較早的回應蓋掉較新的順序
  const reorderSeq = useRef(0);

  // 釘選的排最上面，其餘維持儲存的順序
  const ordered = useMemo(
    () => [...(items ?? []).filter((item) => item.pinned), ...(items ?? []).filter((item) => !item.pinned)],
    [items]
  );

  // 名稱或任一類別包含關鍵字（不分大小寫），再篩出含有所選類別的
  const filtered = useMemo(() => {
    if (sorting) return ordered;
    const q = keyword.trim().toLowerCase();
    return ordered.filter((item) =>
      (!activeCategory || hasCategory(item.category, activeCategory)) &&
      (!q || item.name.toLowerCase().includes(q) || parseCategories(item.category).some((name) => name.toLowerCase().includes(q)))
    );
  }, [ordered, sorting, keyword, activeCategory]);

  // 登入狀態由 AuthGate 確認過，這裡只負責載入驗證碼
  useEffect(() => {
    if (!user) return;
    loadTotp(user.uid, key).then((result) => {
      if (result.success) {
        setItems(result.data);
      } else {
        setItems([]);
        showError('載入驗證碼失敗', result.message);
      }
    });
  }, [user?.uid, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // 我的群組（切換列用）；群組還沒跑 0009 migration 時就當沒有群組。
  // 記住的群組已經不在（退出、被刪）就回到我的
  const reloadGroups = async () => {
    const result = await loadMyGroups();
    const list = result.success ? result.data : [];
    setGroups(list);
    if (scope && !list.some((group) => group.id === scope)) selectScope('');
    return list;
  };
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadMyGroups().then((result) => {
      if (cancelled) return;
      const list = result.success ? result.data : [];
      setGroups(list);
      if (scope && !list.some((group) => group.id === scope)) selectScope('');
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 群組模式：載入群組詳情（記著是哪個群組的，切換時舊的就不算數）
  const detail = loaded?.gid === scope ? loaded.data : undefined;
  const applyDetail = (gid: string, result: Awaited<ReturnType<typeof loadGroupDetail>>) => {
    if (result.success && result.data) {
      setLoaded({ gid, data: result.data });
    } else {
      showError('無法開啟群組', result.success ? '找不到這個群組。' : result.message);
      selectScope('');
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

  // 資料層回傳最新陣列，成功就直接換掉畫面上的資料
  const applyResult = (result: TotpResult, successText: string, failText: string) => {
    if (result.success) {
      setItems(result.data);
      toast.success(successText, { position: 'top-right' });
    } else {
      showError(failText, result.message);
    }
    return result.success;
  };

  const handleUpdate = async (id: string, input: TotpInput) => {
    if (!user) return false;
    return applyResult(await updateTotp(user.uid, id, input, key), '已儲存', '儲存驗證碼失敗');
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    applyResult(await deleteTotp(user.uid, id, key), '已刪除', '刪除驗證碼失敗');
  };

  const handleTogglePin = async (item: TotpItem) => {
    if (!user) return;
    applyResult(
      await updateTotp(user.uid, item.id, { pinned: !item.pinned }, key),
      item.pinned ? '已取消釘選' : '已釘選到最上面',
      item.pinned ? '取消釘選失敗' : '釘選失敗'
    );
  };

  // 和相鄰項目交換位置（只在同一組裡移動：釘選的和未釘選的不互換）
  const handleMove = async (index: number, offset: -1 | 1) => {
    if (!user || !items) return;
    const target = index + offset;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];

    // 先換畫面，失敗再換回來
    const previous = items;
    setItems(next);
    const seq = ++reorderSeq.current;
    const result = await reorderTotp(user.uid, next.map((item) => item.id), key);
    if (seq !== reorderSeq.current) return;
    if (result.success) {
      setItems(result.data);
    } else {
      setItems(previous);
      showError('排序失敗', result.message);
    }
  };

  const canSwap = (index: number, offset: -1 | 1) => {
    const neighbor = ordered[index + offset];
    return !!neighbor && !!neighbor.pinned === !!ordered[index].pinned;
  };

  const handleClear = async () => {
    if (!user) return;
    applyResult(await clearTotp(user.uid), '已清空', '清空驗證碼失敗');
  };

  const selectedGroup = groups?.find((group) => group.id === scope);
  const canShare = !!detail && hasAny(detail.permissions, [GROUP.CREATE_INVITE, GROUP.MANAGE_GROUP]);

  // 群組模式的標題列：群組名、成員數、分享／管理
  const groupHeading = selectedGroup && (
    <div className="min-w-0">
      <p className="truncate text-[22px] font-semibold">{selectedGroup.name}</p>
      <p className="flex flex-wrap items-center gap-x-3 text-[15px] text-ink-muted">
        <span>{selectedGroup.member_count} 位成員</span>
        {canShare && (
          <Link href={`/groups/${scope}?tab=invites`} className="text-accent hover:underline">分享給其他人</Link>
        )}
        <Link href={`/groups/${scope}`} className="text-accent hover:underline">管理</Link>
      </p>
    </div>
  );

  return (
    <PageContent className="max-w-3xl">
      <PageHeader
        title="驗證碼"
        right={
          scope ? undefined : sorting ? (
            <button onClick={() => setSorting(false)} className="text-[17px] font-semibold text-accent">完成</button>
          ) : (
            <>
              <Link href="/addCode" className="flex items-center gap-1.5 text-[17px] text-accent hover:underline">
                <FontAwesomeIcon icon={faPlus} className="w-3.5" />
                新增
              </Link>
              {items && items.length > 0 && (
                <Dropdown placement="bottom-end" className="bg-surface text-ink">
                  <DropdownTrigger>
                    <button aria-label="更多" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-1 text-accent transition-colors hover:bg-line/60">
                      <FontAwesomeIcon icon={faEllipsis} className="w-4" />
                    </button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="列表操作"
                    disabledKeys={items.length < 2 ? ['sort'] : []}
                    onAction={(key) => {
                      if (key === 'hide') toggleHideCodes(!hideCodes);
                      if (key === 'sort') setSorting(true);
                      if (key === 'export') setExportOpen(true);
                      if (key === 'clear') setConfirmClearOpen(true);
                    }}
                  >
                    <DropdownItem key="hide" startContent={<FontAwesomeIcon icon={hideCodes ? faEye : faEyeSlash} className="w-3.5" />}>
                      {hideCodes ? '顯示驗證碼' : '隱藏驗證碼'}
                    </DropdownItem>
                    <DropdownItem key="sort" startContent={<FontAwesomeIcon icon={faArrowsUpDown} className="w-3.5" />}>調整順序</DropdownItem>
                    <DropdownItem key="export" startContent={<FontAwesomeIcon icon={faFileExport} className="w-3.5" />}>匯出</DropdownItem>
                    <DropdownItem key="clear" className="text-danger" color="danger" startContent={<FontAwesomeIcon icon={faTrashCan} className="w-3.5" />}>
                      清空全部
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              )}
            </>
          )
        }
      />

      {/* 我的 / 群組切換；有群組或能建群組才顯示 */}
      {groups && (groups.length > 0 || can(SITE.CREATE_GROUPS)) && !sorting && (
        <div className="mb-5">
          <ScopePicker
            groups={groups}
            selected={scope}
            onSelect={selectScope}
            onCreate={can(SITE.CREATE_GROUPS) ? () => setCreateOpen(true) : undefined}
          />
        </div>
      )}

      {scope ? (
        detail ? (
          <GroupCodes key={scope} detail={detail} actor={actor} onChanged={reloadDetail} heading={groupHeading} />
        ) : (
          <Spinner block label="載入群組…" />
        )
      ) : items === undefined ? (
        <Spinner block label="載入驗證碼…" />
      ) : items.length === 0 ? (
        <div className="rounded-[18px] bg-surface-1 px-6 py-16 text-center">
          <p className="text-[19px] font-semibold">還沒有驗證碼</p>
          <p className="mt-1 text-ink-muted">到各服務的兩步驟驗證設定拿 QR Code，掃一下就加進來</p>
          <Link href="/addCode" className="link-arrow mt-4 inline-block">新增第一筆</Link>
        </div>
      ) : (
        <>
          {sorting ? (
            <p className="mb-3 text-[15px] text-ink-muted">用箭頭調整順序，釘選的固定排在最上面</p>
          ) : (
            <div className="mb-3 flex flex-col gap-3">
              {/* 搜尋 */}
              <label className="flex items-center gap-2 rounded-[12px] bg-surface-1 px-3.5 py-2 text-[17px] text-ink-muted focus-within:ring-2 focus-within:ring-accent/40">
                <FontAwesomeIcon icon={faMagnifyingGlass} className="w-4 shrink-0" />
                <input
                  type="search"
                  aria-label="搜尋驗證碼"
                  placeholder="搜尋"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted"
                />
                {keyword && (
                  <button type="button" onClick={() => setKeyword('')} aria-label="清除" className="hover:text-ink">
                    <FontAwesomeIcon icon={faXmark} className="w-3.5" />
                  </button>
                )}
              </label>

              {/* 類別 */}
              {categories.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                  <button type="button" aria-pressed={!activeCategory} className={pillClass(!activeCategory)} onClick={() => setCategory(undefined)}>
                    全部
                  </button>
                  {categories.map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={activeCategory === name}
                      className={pillClass(activeCategory === name)}
                      onClick={() => setCategory(activeCategory === name ? undefined : name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">沒有符合的驗證碼</div>
          ) : (
            <ul role="list" className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
              {filtered.map((item, index) => (
                <CodeCard
                  key={item.id}
                  item={item}
                  onEdit={() => setEditing(item)}
                  onDelete={() => handleDelete(item.id)}
                  onTogglePin={() => handleTogglePin(item)}
                  onShare={() => setShareTarget(item)}
                  hidden={hideCodes}
                  sort={
                    sorting
                      ? {
                          canUp: canSwap(index, -1),
                          canDown: canSwap(index, 1),
                          onUp: () => handleMove(index, -1),
                          onDown: () => handleMove(index, 1),
                        }
                      : undefined
                  }
                />
              ))}
            </ul>
          )}

          <p className="mt-3 px-1 text-[13px] text-ink-muted">
            {filtered.length === items.length ? `共 ${items.length} 筆` : `顯示 ${filtered.length} 筆，共 ${items.length} 筆`}
            {hideCodes && '，驗證碼已隱藏，點一下才會顯示'}
          </p>
        </>
      )}

      {editing && (
        <TotpEditModal
          key={editing.id}
          item={editing}
          categories={categories}
          onClose={() => setEditing(undefined)}
          onSave={(input) => handleUpdate(editing.id, input)}
        />
      )}

      {shareTarget && <ShareToGroupModal key={shareTarget.id} item={shareTarget} onClose={() => setShareTarget(undefined)} />}

      {/* 解不開的金鑰（顯示「金鑰錯誤」的項目）不匯出 */}
      {exportOpen && (
        <ExportModal items={ordered.filter((item) => isValidSecret(item.secret))} onClose={() => setExportOpen(false)} />
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

      <ConfirmModal
        isOpen={confirmClearOpen}
        danger
        title="清空所有驗證碼"
        description="確定要清空所有驗證碼嗎？刪除後無法恢復，所有金鑰都會遺失。"
        confirmLabel="全部清空"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={async () => {
          setConfirmClearOpen(false);
          await handleClear();
        }}
      />
    </PageContent>
  );
};

export default CodeClient;
