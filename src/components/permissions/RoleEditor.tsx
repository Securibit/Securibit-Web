"use client";

import { useState } from "react";
import { Button, Input, Switch } from "@heroui/react";
import { toast } from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faCheck, faChevronDown, faChevronUp, faLock, faPlus } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import { ROLE_FALLBACK_COLOR } from "@/components/permissions/RoleChip";
import { countBits } from "@/lib/permissions/bits";
import { canManageRole, sortRoles } from "@/lib/permissions/hierarchy";
import { showError } from "@/lib/errorDialog";
import { cn } from "@/lib/utils";
import { Role, RoleInput } from "@/types/Permission/Permission";
import { RoleEditorProps } from "@/types/Permission/RoleEditor";

// ADMINISTRATOR 在全站與群組都是 1
const ADMIN_BIT = 1;

// 預設色票（存小寫 #rrggbb）
const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#28c8c7",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
];

const toInput = (role: Role): RoleInput => ({ name: role.name, color: role.color, permissions: role.permissions });

const sameInput = (a: RoleInput, b: RoleInput) =>
  a.name === b.name && a.color.toLowerCase() === b.color.toLowerCase() && a.permissions === b.permissions;

// 排序中先用新的順序顯示（重新載入完才換回外層傳進來的資料）
const applyOrder = (roles: Role[], order: string[] | null) => {
  if (!order) return roles;
  const index = (role: Role) => {
    const i = order.indexOf(role.id);
    return i === -1 ? order.length : i;
  };
  return [...roles].sort((a, b) => index(a) - index(b));
};

// 上下移的小圓鈕
const MOVE_BUTTON =
  "flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-line/60 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-muted";

// 圓形色點（選中的外圈一圈藍）
const COLOR_DOT =
  "flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50";

// 身分組編輯器：左邊清單（排序、新增），右邊編輯名稱、顏色、權限；修改先存在草稿，按「儲存」才送出
const RoleEditor = (props: RoleEditorProps) => {
  const { actor, definitions, actorPermissions, canManage } = props;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 草稿綁定身分組 id，外層重新載入後不會被蓋掉
  const [draft, setDraft] = useState<{ roleId: string; input: RoleInput } | null>(null);
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // 有未儲存變更時，切換身分組 / 建立前要先確認
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const sorted = sortRoles(props.roles);
  const everyone = sorted.find((role) => role.is_default) ?? null;
  const ordered = applyOrder(
    sorted.filter((role) => !role.is_default),
    orderOverride
  );
  const list = everyone ? [...ordered, everyone] : ordered;

  const selected = list.find((role) => role.id === selectedId) ?? list[0] ?? null;
  const base = selected ? toInput(selected) : null;
  const value = selected && draft?.roleId === selected.id ? draft.input : base;
  const dirty = !!(base && value && !sameInput(base, value));

  const readOnly = !selected || !canManage || !canManageRole(actor, selected);
  const readOnlyReason = !canManage
    ? "你沒有「管理身分組」權限，只能查看"
    : selected && !canManageRole(actor, selected)
      ? "這個身分組不低於你的最高身分組，無法編輯"
      : null;

  const actorIsAdmin = (actorPermissions & ADMIN_BIT) !== 0;
  const actorHas = (bit: number) => actorIsAdmin || (actorPermissions & bit) !== 0;

  const patch = (change: Partial<RoleInput>) => {
    if (!selected || !value || readOnly) return;
    setDraft({ roleId: selected.id, input: { ...value, ...change } });
  };

  // 有未儲存變更就先問，否則直接執行
  const guard = (action: () => void) => {
    if (dirty) setPendingAction(() => action);
    else action();
  };

  const select = (id: string) => {
    if (id === selected?.id) return;
    guard(() => {
      setDraft(null);
      setSelectedId(id);
    });
  };

  const handleCreate = () =>
    guard(async () => {
      setDraft(null);
      setCreating(true);
      const result = await props.onCreate({ name: "新身分組", color: "", permissions: 0 });
      if (!result.success) {
        setCreating(false);
        showError("建立身分組失敗", result.message);
        return;
      }
      await props.onChanged();
      setCreating(false);
      setSelectedId(result.data);
      toast.success("已建立身分組", { position: "top-right" });
    });

  const handleSave = async () => {
    if (!selected || !value) return;
    const name = value.name.trim();
    if (!name) {
      showError("無法儲存", "身分組名稱不能是空的。");
      return;
    }
    setSaving(true);
    const result = await props.onUpdate(selected.id, { ...value, name });
    if (!result.success) {
      setSaving(false);
      showError("儲存身分組失敗", result.message);
      return;
    }
    // 等外層重新載入完再清掉草稿，畫面才不會先閃回舊的值
    await props.onChanged();
    setSaving(false);
    setDraft(null);
    toast.success("已儲存", { position: "top-right" });
  };

  const handleDelete = async () => {
    if (!selected) return;
    const result = await props.onDelete(selected.id);
    setDeleteOpen(false);
    if (!result.success) {
      showError("刪除身分組失敗", result.message);
      return;
    }
    setDraft(null);
    setSelectedId(null);
    toast.success("已刪除身分組", { position: "top-right" });
    await props.onChanged();
  };

  // 只能移動管得到的身分組，而且不能越過管不到的（相鄰的也要管得到）
  const canMove = (index: number, offset: -1 | 1) => {
    const role = ordered[index];
    const neighbor = ordered[index + offset];
    return (
      canManage &&
      !orderOverride &&
      !!neighbor &&
      canManageRole(actor, role) &&
      canManageRole(actor, neighbor)
    );
  };

  const handleMove = async (index: number, offset: -1 | 1) => {
    if (!canMove(index, offset)) return;
    const next = ordered.map((role) => role.id);
    [next[index], next[index + offset]] = [next[index + offset], next[index]];

    // 先換畫面，失敗再重新載入還原
    setOrderOverride(next);
    const result = await props.onReorder(next);
    if (!result.success) showError("調整順序失敗", result.message);
    await props.onChanged();
    setOrderOverride(null);
  };

  const adminDef = definitions.find((def) => def.bit === ADMIN_BIT);
  const otherDefs = definitions.filter((def) => def.bit !== ADMIN_BIT);
  const adminOn = !!value && (value.permissions & ADMIN_BIT) !== 0;
  const enabledCount = !value ? 0 : adminOn ? definitions.length : countBits(value.permissions, definitions);

  const renderPermission = (def: (typeof definitions)[number]) => {
    if (!value) return null;
    const isAdminRow = def.bit === ADMIN_BIT;
    // ADMINISTRATOR 開啟時其他列顯示為開啟並鎖住，但草稿保留原本的勾選值
    const lockedByAdmin = !isAdminRow && adminOn;
    const isSelected = lockedByAdmin || (value.permissions & def.bit) !== 0;
    const missing = !actorHas(def.bit);
    // 唯讀時不用提示（本來就不能改）
    const hint = readOnly
      ? null
      : missing
        ? "你沒有這個權限，無法給別人"
        : lockedByAdmin
          ? `已包含在「${adminDef?.name ?? "管理員"}」裡`
          : null;

    return (
      <div key={def.key} className="flex items-center justify-between gap-6 px-5 py-3">
        <div className="min-w-0">
          <p className="text-[17px]">
            {def.name}
            {isAdminRow && <span className="ml-2 text-[13px] text-alarm">最高權限</span>}
          </p>
          <p className="text-[13px] text-ink-muted">{def.description}</p>
          {hint && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-muted">
              <FontAwesomeIcon icon={faLock} className="w-2.5" />
              {hint}
            </p>
          )}
        </div>
        <Switch
          aria-label={def.name}
          size="sm"
          isSelected={isSelected}
          isDisabled={readOnly || saving || missing || lockedByAdmin}
          onValueChange={(on) =>
            value && patch({ permissions: on ? value.permissions | def.bit : value.permissions & ~def.bit })
          }
          className="shrink-0"
        />
      </div>
    );
  };

  return (
    <div className="grid gap-8 md:grid-cols-[15rem_1fr]">
      {/* 左：身分組清單 */}
      <div className="flex flex-col gap-1 md:sticky md:top-24 md:self-start">
        <ul className="flex flex-col gap-0.5">
          {list.map((role) => {
            const index = ordered.indexOf(role);
            const active = selected?.id === role.id;
            return (
              <li
                key={role.id}
                className={cn("flex items-center gap-1 rounded-[10px] pr-1.5", active ? "bg-surface-1" : "hover:bg-surface-1/60")}
              >
                <button
                  type="button"
                  onClick={() => select(role.id)}
                  aria-current={active ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left"
                >
                  <span
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", !role.color && "bg-ink-muted")}
                    style={role.color ? { backgroundColor: role.color } : undefined}
                    aria-hidden
                  />
                  <span className={cn("min-w-0 flex-1 truncate text-[15px]", active && "font-semibold")}>{role.name}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-ink-muted">{role.member_count}</span>
                </button>
                {/* @everyone 固定在最後，不能移動 */}
                {canManage && !role.is_default && (
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => handleMove(index, -1)}
                      disabled={!canMove(index, -1)}
                      aria-label={`把 ${role.name} 往上移`}
                      className={MOVE_BUTTON}
                    >
                      <FontAwesomeIcon icon={faChevronUp} className="w-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, 1)}
                      disabled={!canMove(index, 1)}
                      aria-label={`把 ${role.name} 往下移`}
                      className={MOVE_BUTTON}
                    >
                      <FontAwesomeIcon icon={faChevronDown} className="w-2.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {canManage && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || saving}
            className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[15px] text-accent hover:bg-surface-1/60 disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faPlus} className="w-3" />
            {creating ? "建立中…" : "新增身分組"}
          </button>
        )}
      </div>

      {/* 右：編輯選取的身分組 */}
      {selected && value ? (
        <div className="flex min-w-0 flex-col gap-8">
          {readOnlyReason && (
            <p className="flex items-center gap-2 px-5 text-[13px] text-ink-muted">
              <FontAwesomeIcon icon={faLock} className="w-3 shrink-0" />
              {readOnlyReason}
            </p>
          )}

          <Input
            label="名稱"
            labelPlacement="outside"
            variant="flat"
            size="lg"
            value={value.name}
            onValueChange={(name) => patch({ name })}
            isDisabled={selected.is_default || readOnly || saving}
            description={selected.is_default ? "@everyone 是所有人都有的身分組，不能改名" : undefined}
            maxLength={50}
          />

          {/* 顏色：無顏色 + 色票 + 自訂 */}
          <section>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">顏色</h2>
            <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-line/70 bg-surface px-5 py-4">
              <button
                type="button"
                onClick={() => patch({ color: "" })}
                disabled={readOnly || saving}
                aria-label="無顏色"
                title="無顏色"
                className={cn(COLOR_DOT, "border border-line text-ink-muted", value.color === "" && "ring-2 ring-accent")}
              >
                <FontAwesomeIcon icon={faBan} className="w-3.5" />
              </button>
              {PRESET_COLORS.map((color) => {
                const active = value.color.toLowerCase() === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => patch({ color })}
                    disabled={readOnly || saving}
                    aria-label={`顏色 ${color}`}
                    title={color}
                    className={cn(COLOR_DOT, "text-white", active && "ring-2 ring-accent")}
                    style={{ backgroundColor: color }}
                  >
                    {active && <FontAwesomeIcon icon={faCheck} className="w-3.5" />}
                  </button>
                );
              })}
              <label
                title="自訂顏色"
                className={cn(
                  "relative h-8 w-8 overflow-hidden rounded-full border border-line bg-[conic-gradient(#ef4444,#eab308,#22c55e,#3b82f6,#a855f7,#ef4444)]",
                  readOnly || saving ? "opacity-50" : "cursor-pointer",
                  value.color !== "" && !PRESET_COLORS.includes(value.color.toLowerCase()) && "ring-2 ring-accent ring-offset-2 ring-offset-surface"
                )}
              >
                <input
                  type="color"
                  value={value.color || ROLE_FALLBACK_COLOR.toLowerCase()}
                  onChange={(e) => patch({ color: e.target.value.toLowerCase() })}
                  disabled={readOnly || saving}
                  aria-label="自訂顏色"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
              </label>
            </div>
          </section>

          {/* 權限清單：ADMINISTRATOR 固定在第一列 */}
          <section>
            <div className="mb-2 flex items-center justify-between px-5">
              <h2 className="text-[13px] font-normal text-ink-muted">權限</h2>
              <p className="text-[13px] tabular-nums text-ink-muted">
                已開啟 {enabledCount} / {definitions.length}
              </p>
            </div>
            <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
              {adminDef && renderPermission(adminDef)}
              {otherDefs.map(renderPermission)}
            </div>
          </section>

          {canManage && !selected.is_default && !readOnly && (
            <section>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                disabled={saving}
                className="w-full rounded-[18px] border border-line/70 bg-surface py-3 text-center text-[17px] text-alarm hover:bg-surface-1 disabled:opacity-50"
              >
                刪除身分組
              </button>
              <p className="mt-2 px-5 text-[13px] text-ink-muted">擁有這個身分組的人會失去它的權限，刪除後無法恢復</p>
            </section>
          )}

          {/* 未儲存變更列 */}
          {dirty && (
            <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-[18px] border border-line/70 bg-surface px-5 py-3">
              <p className="flex-1 text-[15px]">有未儲存的變更</p>
              <Button variant="light" radius="full" onPress={() => setDraft(null)} isDisabled={saving}>
                重設
              </Button>
              <Button color="primary" radius="full" onPress={handleSave} isLoading={saving}>
                儲存
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">還沒有任何身分組</div>
      )}

      <ConfirmModal
        isOpen={deleteOpen}
        danger
        title="刪除身分組"
        description={`確定要刪除「${selected?.name ?? ""}」嗎？擁有這個身分組的人會失去它的權限，刪除後無法恢復。`}
        confirmLabel="刪除"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />

      <ConfirmModal
        isOpen={pendingAction !== null}
        danger
        title="放棄未儲存的變更"
        description="這個身分組還有沒儲存的變更，離開後會遺失。"
        confirmLabel="放棄變更"
        cancelLabel="繼續編輯"
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          action?.();
        }}
      />
    </div>
  );
};

export default RoleEditor;
