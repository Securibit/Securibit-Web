"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsUpDown, faEllipsis, faEye, faEyeSlash, faFileExport, faLock, faMagnifyingGlass, faPlus, faTrashCan, faXmark } from "@fortawesome/free-solid-svg-icons";
import Spinner from "@/components/ui/Loading/Spinner";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import useAuth from "@/components/auth/useAuth";
import useVault from "@/components/vault/useVault";
import VaultUnlock from "@/components/vault/VaultUnlock";
import OverwriteEditor from "@/components/permissions/OverwriteEditor";
import BulkImportModal from "@/app/addCode/_components/BulkImportModal";
import ExportModal from "@/app/code/_components/ExportModal";
import ShareToGroupModal from "@/app/code/_components/ShareToGroupModal";
import {
  addGroupAccounts,
  clearGroupAccounts,
  deleteGroupAccount,
  loadGroupAccounts,
  loadGroupAccountSecrets,
  loadGroupCodes,
  reorderGroupAccounts,
  updateGroupAccount,
} from "@/lib/groups/groups";
import { GROUP, has } from "@/lib/permissions/bits";
import { ImportTextResult } from "@/lib/totp/importText";
import { showError } from "@/lib/errorDialog";
import { cn } from "@/lib/utils";
import { GroupAccount, GroupCodes as GroupCodesResult } from "@/types/Group/Group";
import { GroupCodesProps } from "@/types/Group/GroupCodes";
import { TotpInput, TotpItem } from "@/types/Totp/Totp";
import { isValidSecret } from "@/lib/totp/crud";
import GroupCodeCard from "./GroupCodeCard";
import GroupCodeEditModal from "./GroupCodeEditModal";
import AddGroupCodeModal from "./AddGroupCodeModal";
import { collectCategories, hasCategory, parseCategories } from "@/lib/totp/categories";

// 「隱藏驗證碼」偏好所有群組共用
const HIDE_KEY = "securibit:hideCodes";
const readHidePref = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};

// 伺服器產碼依 30 秒的週期邊界重新取得（60 秒週期的邊界也一定是 30 秒的邊界）
const REFRESH_STEP = 30_000;
// 過了邊界再稍等一下才打，避免伺服器時間還沒跨過去
const REFRESH_DELAY = 500;

interface ServerState {
  // 伺服器時間 − 本機時間（ms）
  offset: number;
  at: number;
  codes: GroupCodesResult["codes"];
}

// 類別篩選：藥丸，同 CodeClient
const pillClass = (active: boolean) =>
  cn(
    "shrink-0 rounded-full px-3.5 py-1.5 text-[15px] transition-colors",
    active ? "bg-ink text-surface" : "bg-surface-1 text-ink hover:bg-line/60"
  );

// 群組的驗證碼分頁（驗證碼頁也用這個顯示選中的群組，含預設群組）
const GroupCodes = ({ detail, actor, heading }: GroupCodesProps) => {
  const gid = detail.group.id;
  // 群組層級的權限：新增、排序、清空要群組層級的「管理驗證碼」；覆寫要「管理身分組」
  const canAdd = has(detail.permissions, GROUP.MANAGE_CODES);
  const canOverwrite = has(detail.permissions, GROUP.MANAGE_ROLES);

  // 加密群組：金鑰是用擁有者的加密密碼加密的 enc:v1 密文，擁有者解鎖後在瀏覽器解密、產碼；
  // 寫入時也先加密。其他人（例如全站管理員）解不開，只顯示說明
  const encrypted = detail.group.encrypted;
  const vault = useVault();
  const key = encrypted ? vault.key : undefined;
  const locked = encrypted && (!detail.is_owner || !key);

  const [accounts, setAccounts] = useState<GroupAccount[]>();
  // 我有「查看金鑰」的金鑰 { id: secret }
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [server, setServer] = useState<ServerState>();
  // 金鑰被修改時遞增，強制重新向伺服器取碼
  const [serverNonce, setServerNonce] = useState(0);

  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<string>();
  const [hideCodes, setHideCodes] = useState(readHidePref);
  const [sorting, setSorting] = useState(false);
  const [editing, setEditing] = useState<GroupAccount>();
  const [overwriting, setOverwriting] = useState<GroupAccount>();
  const [addOpen, setAddOpen] = useState(false);
  const [bulk, setBulk] = useState<ImportTextResult>();
  const [exportOpen, setExportOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<TotpItem>();
  const reorderSeq = useRef(0);

  const toggleHideCodes = (hide: boolean) => {
    setHideCodes(hide);
    try {
      localStorage.setItem(HIDE_KEY, hide ? "1" : "0");
    } catch {
      // 存不了就只在這次有效
    }
  };

  /**
   * 讀取驗證碼清單；withSecrets 時一併重新讀取金鑰（會記一筆「查看金鑰」紀錄，所以只在需要時讀）。
   * 只負責讀，不動 state；失敗時已跳出錯誤並回傳 null。
   */
  const fetchData = useCallback(
    async (withSecrets: boolean) => {
      const result = await loadGroupAccounts(gid);
      if (!result.success) {
        showError("載入驗證碼失敗", result.message);
        return null;
      }
      let nextSecrets: Record<string, string> | undefined;
      if (withSecrets) {
        nextSecrets = {};
        if (result.data.some((account) => has(account.permissions, GROUP.VIEW_SECRETS))) {
          const secretsResult = await loadGroupAccountSecrets(gid, key);
          if (secretsResult.success) nextSecrets = secretsResult.data;
          else showError("載入金鑰失敗", secretsResult.message);
        }
      }
      return { accounts: result.data, secrets: nextSecrets };
    },
    [gid, key]
  );

  // 金鑰和清單一起換上，避免有金鑰的卡片先短暫變成「等伺服器產碼」
  const applyData = (data: Awaited<ReturnType<typeof fetchData>>) => {
    if (!data) {
      setAccounts((prev) => prev ?? []);
      return;
    }
    if (data.secrets) setSecrets(data.secrets);
    setAccounts(data.accounts);
  };

  const fetchAccounts = async (withSecrets: boolean) => applyData(await fetchData(withSecrets));

  // 我的身分組或身分組權限變了（例如在「身分組」分頁修改），單筆權限可能跟著變，要重新讀取
  const { user } = useAuth();
  const permissionKey = useMemo(() => {
    const myRoles = detail.members.find((member) => member.id === user?.uid)?.role_ids ?? [];
    return [detail.permissions, ...detail.roles.map((role) => `${role.id}:${role.permissions}`), ...myRoles].join("|");
  }, [detail.permissions, detail.roles, detail.members, user?.uid]);

  // 第一次載入、權限變動與解鎖時：清單和金鑰一起讀（加密群組鎖定中先不讀）
  useEffect(() => {
    if (locked) return;
    let cancelled = false;
    fetchData(true).then((data) => {
      if (!cancelled) applyData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData, permissionKey, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  // 沒有金鑰的（只有「查看驗證碼」）才需要伺服器產碼；加密群組伺服器不產碼
  const serverIds = useMemo(
    () =>
      encrypted
        ? ""
        : (accounts ?? []).filter((account) => secrets[account.id] === undefined).map((account) => account.id).join(","),
    [accounts, secrets, encrypted]
  );

  // 剛載入時、以及每個週期邊界向伺服器取碼；用伺服器回傳的 now 校正本機時間差
  useEffect(() => {
    if (!serverIds) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let offset = 0;
    // 連續失敗只跳一次錯誤，避免每 30 秒彈一次
    let failed = false;

    const tick = async () => {
      const sentAt = Date.now();
      const result = await loadGroupCodes(gid);
      if (cancelled) return;
      if (result.success) {
        // 取來回時間的中點估計時間差
        offset = result.data.now - (sentAt + Date.now()) / 2;
        failed = false;
        setServer({ offset, at: result.data.now, codes: result.data.codes });
      } else if (!failed) {
        failed = true;
        showError("取得驗證碼失敗", result.message);
      }
      const serverNow = Date.now() + offset;
      timer = setTimeout(tick, REFRESH_STEP - (serverNow % REFRESH_STEP) + REFRESH_DELAY);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [gid, serverIds, serverNonce]);

  // 所有驗證碼類別的聯集（排序），給篩選與表單建議用
  const categories = useMemo(() => collectCategories(accounts ?? []), [accounts]);
  const activeCategory = category && categories.includes(category) ? category : undefined;

  // 釘選的排最上面，其餘維持儲存的順序
  const ordered = useMemo(
    () => [...(accounts ?? []).filter((a) => a.pinned), ...(accounts ?? []).filter((a) => !a.pinned)],
    [accounts]
  );

  const filtered = useMemo(() => {
    if (sorting) return ordered;
    const q = keyword.trim().toLowerCase();
    return ordered.filter(
      (account) =>
        (!activeCategory || hasCategory(account.category, activeCategory)) &&
        (!q || account.name.toLowerCase().includes(q) || parseCategories(account.category).some((name) => name.toLowerCase().includes(q)))
    );
  }, [ordered, sorting, keyword, activeCategory]);

  // 整批匯入時用來標出重複的金鑰（只比得到我看得到金鑰的那些）
  const knownItems = useMemo<TotpItem[]>(
    () =>
      (accounts ?? [])
        .filter((account) => secrets[account.id] !== undefined)
        .map((account) => ({ ...account, secret: secrets[account.id] })),
    [accounts, secrets]
  );

  // ---------- 操作 ----------

  // 匯出：拿得到正確金鑰的那些（依畫面順序）
  const exportItems = useMemo<TotpItem[]>(
    () =>
      ordered
        .filter((account) => secrets[account.id] !== undefined && isValidSecret(secrets[account.id]))
        .map((account) => ({ ...account, secret: secrets[account.id] })),
    [ordered, secrets]
  );

  const handleAdd = async (inputs: TotpInput[]) => {
    const result = await addGroupAccounts(gid, inputs, key);
    if (!result.success) {
      showError("新增驗證碼失敗", result.message);
      return false;
    }
    toast.success(
      inputs.length === 1 ? `已新增「${inputs[0].name.trim()}」` : `已新增 ${inputs.length} 筆驗證碼`,
      { position: "top-right" }
    );
    await fetchAccounts(true);
    return true;
  };

  const handleUpdate = async (account: GroupAccount, patch: Partial<TotpInput>) => {
    const result = await updateGroupAccount(account.id, patch, key);
    if (!result.success) {
      showError("儲存驗證碼失敗", result.message);
      return false;
    }
    toast.success("已儲存", { position: "top-right" });
    const secretChanged = patch.secret !== undefined;
    await fetchAccounts(secretChanged && secrets[account.id] !== undefined);
    if (secretChanged) setServerNonce((n) => n + 1);
    return true;
  };

  const handleDelete = async (account: GroupAccount) => {
    const result = await deleteGroupAccount(account.id);
    if (!result.success) {
      showError("刪除驗證碼失敗", result.message);
      return;
    }
    toast.success("已刪除", { position: "top-right" });
    setAccounts((list) => list?.filter((item) => item.id !== account.id));
  };

  const handleClear = async () => {
    const result = await clearGroupAccounts(gid);
    if (!result.success) {
      showError("清空驗證碼失敗", result.message);
      return;
    }
    toast.success(`已清空 ${result.data} 筆驗證碼`, { position: "top-right" });
    await fetchAccounts(false);
  };

  const handleTogglePin = async (account: GroupAccount) => {
    const result = await updateGroupAccount(account.id, { pinned: !account.pinned });
    if (!result.success) {
      showError(account.pinned ? "取消釘選失敗" : "釘選失敗", result.message);
      return;
    }
    toast.success(account.pinned ? "已取消釘選" : "已釘選到最上面", { position: "top-right" });
    setAccounts((list) => list?.map((item) => (item.id === account.id ? { ...item, pinned: !item.pinned } : item)));
  };

  // 和相鄰項目交換位置（釘選的和未釘選的不互換），同 CodeClient
  const handleMove = async (index: number, offset: -1 | 1) => {
    if (!accounts) return;
    const next = [...ordered];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];

    const previous = accounts;
    setAccounts(next);
    const seq = ++reorderSeq.current;
    const result = await reorderGroupAccounts(gid, next.map((account) => account.id));
    if (seq !== reorderSeq.current) return;
    if (!result.success) {
      setAccounts(previous);
      showError("排序失敗", result.message);
    }
  };

  const canSwap = (index: number, offset: -1 | 1) => {
    const neighbor = ordered[index + offset];
    return !!neighbor && !!neighbor.pinned === !!ordered[index].pinned;
  };

  const serverCode = (account: GroupAccount) => {
    if (!server || secrets[account.id] !== undefined) return undefined;
    const entry = server.codes[account.id];
    return entry ? { at: server.at, code: entry.code, next: entry.next } : undefined;
  };

  const headingRow = heading ?? <h2 className="text-[22px] font-semibold">驗證碼</h2>;

  // 加密群組：擁有者還沒解鎖就先解鎖；不是擁有者看不到
  if (locked) {
    return (
      <div>
        <div className="mb-4">{headingRow}</div>
        <div className="rounded-[18px] border border-line/70 bg-surface px-5 py-5">
          <p className="mb-4 flex items-center gap-2 text-[15px] text-ink-muted">
            <FontAwesomeIcon icon={faLock} className="w-3.5 shrink-0" />
            {!detail.is_owner
              ? "這個群組已由擁有者加密，只有擁有者能查看驗證碼"
              : vault.status === "off"
                ? "這個群組已加密，但找不到你的加密設定，請重新整理"
                : "這個群組已加密，輸入加密密碼解鎖後才能查看"}
          </p>
          {detail.is_owner && vault.status === "loading" && <Spinner />}
          {detail.is_owner && vault.status === "locked" && <VaultUnlock compact />}
        </div>
      </div>
    );
  }

  if (accounts === undefined) return <Spinner block label="載入驗證碼…" />;

  // 只有自己一個人的群組（例如預設群組）用個人的說法
  const solo = detail.members.length <= 1;

  return (
    <div>
      {/* 標題列：右邊放新增與「…」 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        {headingRow}
        <div className="flex items-center gap-3">
          {sorting ? (
            <button type="button" onClick={() => setSorting(false)} className="text-[17px] font-semibold text-accent">完成</button>
          ) : (
            <>
              {canAdd && (
                <button type="button" onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 text-[17px] text-accent hover:underline">
                  <FontAwesomeIcon icon={faPlus} className="w-3.5" />
                  新增
                </button>
              )}
              {accounts.length > 0 && (
                <Dropdown placement="bottom-end" className="bg-surface text-ink">
                  <DropdownTrigger>
                    <button aria-label="更多" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-1 text-accent transition-colors hover:bg-line/60">
                      <FontAwesomeIcon icon={faEllipsis} className="w-4" />
                    </button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="列表操作"
                    disabledKeys={[
                      ...(!canAdd || accounts.length < 2 ? ["sort"] : []),
                      ...(exportItems.length === 0 ? ["export"] : []),
                    ]}
                    onAction={(action) => {
                      if (action === "hide") toggleHideCodes(!hideCodes);
                      if (action === "sort") setSorting(true);
                      if (action === "export") setExportOpen(true);
                      if (action === "clear") setClearOpen(true);
                    }}
                  >
                    <DropdownItem key="hide" startContent={<FontAwesomeIcon icon={hideCodes ? faEye : faEyeSlash} className="w-3.5" />}>
                      {hideCodes ? "顯示驗證碼" : "隱藏驗證碼"}
                    </DropdownItem>
                    <DropdownItem key="sort" startContent={<FontAwesomeIcon icon={faArrowsUpDown} className="w-3.5" />}>調整順序</DropdownItem>
                    <DropdownItem key="export" startContent={<FontAwesomeIcon icon={faFileExport} className="w-3.5" />}>匯出</DropdownItem>
                    {/* 清空要群組層級的「管理驗證碼」；沒有就不列出 */}
                    {canAdd ? (
                      <DropdownItem key="clear" className="text-danger" color="danger" startContent={<FontAwesomeIcon icon={faTrashCan} className="w-3.5" />}>
                        清空全部
                      </DropdownItem>
                    ) : null}
                  </DropdownMenu>
                </Dropdown>
              )}
            </>
          )}
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-[18px] bg-surface-1 px-6 py-16 text-center">
          <p className="text-[19px] font-semibold">還沒有驗證碼</p>
          <p className="mt-1 text-ink-muted">
            {!canAdd
              ? "目前沒有你能查看的驗證碼，需要時請群組管理者調整你的身分組權限"
              : solo
                ? "到各服務的兩步驟驗證設定拿 QR Code，掃一下就加進來"
                : "新增第一筆，群組成員就能依身分組權限看到"}
          </p>
          {canAdd && (
            <button type="button" onClick={() => setAddOpen(true)} className="link-arrow mt-4 inline-block">
              新增第一筆
            </button>
          )}
        </div>
      ) : (
        <>
          {sorting ? (
            <p className="mb-3 text-[15px] text-ink-muted">用箭頭調整順序，釘選的固定排在最上面；順序對所有成員都一樣</p>
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
                  <button type="button" onClick={() => setKeyword("")} aria-label="清除" className="hover:text-ink">
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
              {filtered.map((account, index) => {
                // 單筆的有效權限（已套用覆寫）
                const canManage = has(account.permissions, GROUP.MANAGE_CODES);
                return (
                  <GroupCodeCard
                    key={account.id}
                    account={account}
                    secret={secrets[account.id]}
                    server={serverCode(account)}
                    clockOffset={server?.offset ?? 0}
                    hidden={hideCodes}
                    onEdit={canManage ? () => setEditing(account) : undefined}
                    onDelete={canManage ? () => handleDelete(account) : undefined}
                    onTogglePin={canManage ? () => handleTogglePin(account) : undefined}
                    onPermissions={canOverwrite ? () => setOverwriting(account) : undefined}
                    onShare={setShareTarget}
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
                );
              })}
            </ul>
          )}

          <p className="mt-3 px-1 text-[13px] text-ink-muted">
            {filtered.length === accounts.length ? `共 ${accounts.length} 筆` : `顯示 ${filtered.length} 筆，共 ${accounts.length} 筆`}
            {hideCodes && "，驗證碼已隱藏，點一下才會顯示"}
          </p>
        </>
      )}

      {editing && (
        <GroupCodeEditModal
          key={editing.id}
          account={editing}
          secret={secrets[editing.id]}
          categories={categories}
          onClose={() => setEditing(undefined)}
          onSave={(patch) => handleUpdate(editing, patch)}
        />
      )}

      {addOpen && (
        <AddGroupCodeModal
          categories={categories}
          onClose={() => setAddOpen(false)}
          onAdd={handleAdd}
          onImportMany={(result) => {
            // 多筆改用整批匯入對話框（避免兩層 Modal 疊在一起）
            setAddOpen(false);
            setBulk(result);
          }}
        />
      )}

      {bulk && (
        <BulkImportModal
          result={bulk}
          existing={knownItems}
          categories={categories}
          onClose={() => setBulk(undefined)}
          onConfirm={handleAdd}
        />
      )}

      {exportOpen && <ExportModal items={exportItems} onClose={() => setExportOpen(false)} />}

      {shareTarget && (
        <ShareToGroupModal key={shareTarget.id} item={shareTarget} excludeGroupId={gid} onClose={() => setShareTarget(undefined)} />
      )}

      <ConfirmModal
        isOpen={clearOpen}
        danger
        title="清空所有驗證碼"
        description={
          solo
            ? `確定要清空「${detail.group.name}」的所有驗證碼嗎？刪除後無法恢復，所有金鑰都會遺失。`
            : `確定要清空「${detail.group.name}」裡你能管理的驗證碼嗎？所有成員都會看不到，刪除後無法恢復。`
        }
        confirmLabel="全部清空"
        onCancel={() => setClearOpen(false)}
        onConfirm={async () => {
          setClearOpen(false);
          await handleClear();
        }}
      />

      {overwriting && (
        <OverwriteEditor
          isOpen
          onClose={() => setOverwriting(undefined)}
          account={overwriting}
          roles={detail.roles}
          members={detail.members}
          actor={actor}
          // 覆寫可能改變我能不能看金鑰，金鑰也一起重讀
          onChanged={() => fetchAccounts(true)}
        />
      )}
    </div>
  );
};

export default GroupCodes;
