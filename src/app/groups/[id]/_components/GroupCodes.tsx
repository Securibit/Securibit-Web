"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Switch } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsUpDown, faCheck, faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import Spinner from "@/components/ui/Loading/Spinner";
import useAuth from "@/components/auth/useAuth";
import OverwriteEditor from "@/components/permissions/OverwriteEditor";
import BulkImportModal from "@/app/addCode/_components/BulkImportModal";
import {
  addGroupAccounts,
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
import GroupCodeCard from "./GroupCodeCard";
import GroupCodeEditModal from "./GroupCodeEditModal";
import AddGroupCodeModal from "./AddGroupCodeModal";

// 「隱藏驗證碼」偏好和個人驗證碼頁共用
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

// 群組的驗證碼分頁
const GroupCodes = ({ detail, actor }: GroupCodesProps) => {
  const gid = detail.group.id;
  // 群組層級的權限：新增、排序要群組層級的「管理驗證碼」；覆寫要「管理身分組」
  const canAdd = has(detail.permissions, GROUP.MANAGE_CODES);
  const canOverwrite = has(detail.permissions, GROUP.MANAGE_ROLES);

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
          const secretsResult = await loadGroupAccountSecrets(gid);
          if (secretsResult.success) nextSecrets = secretsResult.data;
          else showError("載入金鑰失敗", secretsResult.message);
        }
      }
      return { accounts: result.data, secrets: nextSecrets };
    },
    [gid]
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

  // 第一次載入與權限變動時：清單和金鑰一起讀
  useEffect(() => {
    let cancelled = false;
    fetchData(true).then((data) => {
      if (!cancelled) applyData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData, permissionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 沒有金鑰的（只有「查看驗證碼」）才需要伺服器產碼
  const serverIds = useMemo(
    () => (accounts ?? []).filter((account) => secrets[account.id] === undefined).map((account) => account.id).join(","),
    [accounts, secrets]
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

  // 既有類別（去重、排序），給篩選與表單建議用
  const categories = useMemo(
    () => Array.from(new Set((accounts ?? []).map((account) => account.category).filter(Boolean))).sort(),
    [accounts]
  );
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
        (!activeCategory || account.category === activeCategory) &&
        (!q || account.name.toLowerCase().includes(q) || account.category.toLowerCase().includes(q))
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

  const handleAdd = async (inputs: TotpInput[]) => {
    const result = await addGroupAccounts(gid, inputs);
    if (!result.success) {
      showError("新增驗證碼失敗", result.message);
      return false;
    }
    toast.success(
      inputs.length === 1 ? `已新增「${inputs[0].name.trim()}」！` : `已新增 ${inputs.length} 筆驗證碼！`,
      { position: "top-right" }
    );
    await fetchAccounts(true);
    return true;
  };

  const handleUpdate = async (account: GroupAccount, patch: Partial<TotpInput>) => {
    const result = await updateGroupAccount(account.id, patch);
    if (!result.success) {
      showError("儲存驗證碼失敗", result.message);
      return false;
    }
    toast.success("已儲存驗證碼！", { position: "top-right" });
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
    toast.success("已刪除驗證碼！", { position: "top-right" });
    setAccounts((list) => list?.filter((item) => item.id !== account.id));
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

  if (accounts === undefined) return <Spinner block label="載入驗證碼…" />;

  // 類別篩選用的方形標籤按鈕
  const filterClass = (active: boolean) =>
    cn(
      "tech-label border px-2 py-1 transition-colors",
      active ? "border-phos bg-phos/10 text-phos" : "border-line hover:border-line-strong hover:text-ink"
    );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="tech-label">01 // CODES</p>
          <h2 className="font-display text-lg font-bold text-ink">
            驗證碼 <span className="font-mono text-sm font-normal text-ink-dim">{accounts.length}</span>
          </h2>
        </div>
        {(canAdd || accounts.length > 1) && (
          <div className="flex flex-wrap gap-2">
            {canAdd && accounts.length > 1 && (
              <Button
                variant={sorting ? "solid" : "bordered"}
                color="primary"
                className="font-display tracking-[0.08em]"
                startContent={<FontAwesomeIcon icon={sorting ? faCheck : faArrowsUpDown} className="w-3.5" />}
                onPress={() => setSorting(!sorting)}
              >
                {sorting ? "完成排序" : "排序"}
              </Button>
            )}
            {canAdd && !sorting && (
              <Button
                color="primary"
                className="font-display tracking-[0.08em]"
                startContent={<FontAwesomeIcon icon={faPlus} className="w-3.5" />}
                onPress={() => setAddOpen(true)}
              >
                新增驗證碼
              </Button>
            )}
          </div>
        )}
      </div>

      {accounts.length === 0 ? (
        <div className="hatch border border-line p-10 text-center">
          <p className="tech-label">NO DATA</p>
          <p className="mt-2 text-ink-muted">
            {canAdd
              ? "群組還沒有驗證碼，按「新增驗證碼」加入第一筆。"
              : "目前沒有你能查看的驗證碼。如果需要，請群組管理者調整你的身分組權限。"}
          </p>
        </div>
      ) : (
        <>
          {sorting ? (
            <p className="mb-4 border-l-2 border-phos pl-3 text-sm text-ink-muted">
              用箭頭調整順序，釘選的項目固定排在最上面。順序對所有成員都一樣，調整完按「完成排序」。
            </p>
          ) : (
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <Input
                  aria-label="搜尋驗證碼"
                  placeholder="搜尋名稱或類別"
                  variant="bordered"
                  value={keyword}
                  onValueChange={setKeyword}
                  isClearable
                  onClear={() => setKeyword("")}
                  startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="w-3.5 text-ink-dim" />}
                  className="sm:max-w-sm"
                />
                <Switch size="sm" isSelected={hideCodes} onValueChange={toggleHideCodes} classNames={{ label: "text-sm text-ink-muted" }}>
                  隱藏驗證碼（點一下才顯示）
                </Switch>
              </div>
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={filterClass(!activeCategory)} onClick={() => setCategory(undefined)}>
                    全部 <span className="font-mono">{accounts.length}</span>
                  </button>
                  {categories.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={filterClass(activeCategory === name)}
                      onClick={() => setCategory(activeCategory === name ? undefined : name)}
                    >
                      {name}{" "}
                      <span className="font-mono">{accounts.filter((account) => account.category === name).length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="hatch border border-line p-10 text-center">
              <p className="tech-label">NO MATCH</p>
              <p className="mt-2 text-ink-muted">沒有符合條件的驗證碼</p>
            </div>
          ) : (
            <div className="panel px-4 sm:px-6">
              <ul role="list">
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
            </div>
          )}
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
