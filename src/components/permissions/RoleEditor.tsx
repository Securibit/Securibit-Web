"use client";

import { useState } from "react";
import { Button, Input, Switch } from "@heroui/react";
import { toast } from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faBan,
  faCheck,
  faLock,
  faPlus,
  faTrash,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
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

// 方形的上下移按鈕
const MOVE_BUTTON =
  "flex h-6 w-6 items-center justify-center border border-line text-ink-muted transition-colors hover:border-phos hover:text-phos disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink-muted";

// Discord 式身分組編輯器：左邊清單（排序、建立），右邊編輯名稱、顏色、權限；修改先存在草稿，按「儲存變更」才送出
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
    ? "你沒有「管理身分組」權限，只能查看。"
    : selected && !canManageRole(actor, selected)
      ? "這個身分組不低於你的最高身分組，無法編輯。"
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
      toast.success("已建立身分組！", { position: "top-right" });
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
    toast.success("已儲存身分組！", { position: "top-right" });
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
    toast.success("已刪除身分組！", { position: "top-right" });
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
      <li key={def.key} className="flex items-start gap-4 border-b border-line py-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-display text-sm font-semibold text-ink">
            {def.name}
            {isAdminRow && (
              <span className="tech-label border border-alarm px-1.5 py-0.5 text-alarm">最高權限</span>
            )}
          </p>
          <p className="text-xs text-ink-muted">{def.description}</p>
          {hint && (
            <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.04em] text-ink-dim">
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
          className="mt-0.5 flex-shrink-0"
        />
      </li>
    );
  };

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      {/* 左：身分組清單 */}
      <div className="flex flex-col gap-3">
        {canManage && (
          <Button
            color="primary"
            variant="bordered"
            className="font-display tracking-[0.08em]"
            startContent={<FontAwesomeIcon icon={faPlus} className="w-3.5" />}
            onPress={handleCreate}
            isLoading={creating}
            isDisabled={saving}
          >
            建立身分組
          </Button>
        )}
        <ul className="border border-line bg-surface-1">
          {list.map((role) => {
            const index = ordered.indexOf(role);
            const active = selected?.id === role.id;
            return (
              <li
                key={role.id}
                className={cn(
                  "flex items-center gap-1 border-b border-l-2 border-b-line pr-1.5 transition-colors last:border-b-0",
                  active ? "border-l-phos bg-phos/10" : "border-l-transparent hover:bg-ink/5"
                )}
              >
                <button
                  type="button"
                  onClick={() => select(role.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2.5 text-left"
                >
                  <span
                    className={cn("h-2.5 w-2.5 flex-shrink-0", !role.color && "bg-ink-dim")}
                    style={role.color ? { backgroundColor: role.color } : undefined}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-display text-sm tracking-[0.04em]",
                      active ? "text-phos" : "text-ink"
                    )}
                  >
                    {role.name}
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-1 font-mono text-[11px] text-ink-dim">
                    <FontAwesomeIcon icon={faUser} className="w-2.5" />
                    {role.member_count}
                  </span>
                </button>
                {/* @everyone 固定在最後，不能移動 */}
                {canManage && !role.is_default && (
                  <div className="flex flex-shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleMove(index, -1)}
                      disabled={!canMove(index, -1)}
                      aria-label={`把 ${role.name} 往上移`}
                      className={MOVE_BUTTON}
                    >
                      <FontAwesomeIcon icon={faArrowUp} className="w-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, 1)}
                      disabled={!canMove(index, 1)}
                      aria-label={`把 ${role.name} 往下移`}
                      className={MOVE_BUTTON}
                    >
                      <FontAwesomeIcon icon={faArrowDown} className="w-2.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* 右：編輯選取的身分組 */}
      {selected && value ? (
        <div className="flex min-w-0 flex-col gap-6">
          {readOnlyReason && (
            <p className="flex items-center gap-3 border-l-2 border-line-strong pl-3 text-sm text-ink-muted">
              <FontAwesomeIcon icon={faLock} className="w-3 flex-shrink-0" />
              {readOnlyReason}
            </p>
          )}

          <Input
            label="名稱"
            variant="bordered"
            value={value.name}
            onValueChange={(name) => patch({ name })}
            isDisabled={selected.is_default || readOnly || saving}
            description={selected.is_default ? "@everyone 是所有人都有的身分組，不能改名" : undefined}
            maxLength={50}
          />

          {/* 顏色：色票 + 自訂 + 無顏色 */}
          <div className="flex flex-col gap-2">
            <p className="tech-label">COLOR</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => patch({ color: "" })}
                disabled={readOnly || saving}
                aria-label="無顏色"
                title="無顏色"
                className={cn(
                  "flex h-7 w-7 items-center justify-center border border-dashed transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  value.color === "" ? "border-phos text-phos" : "border-line-strong text-ink-dim hover:border-ink-muted"
                )}
              >
                <FontAwesomeIcon icon={faBan} className="w-3" />
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
                    className={cn(
                      "flex h-7 w-7 items-center justify-center text-white outline-offset-2 transition-[outline-color] disabled:cursor-not-allowed disabled:opacity-50",
                      active ? "outline outline-1 outline-phos" : "outline-none"
                    )}
                    style={{ backgroundColor: color }}
                  >
                    {active && <FontAwesomeIcon icon={faCheck} className="w-3" />}
                  </button>
                );
              })}
              <label
                className={cn(
                  "flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] text-ink-muted",
                  readOnly || saving ? "opacity-50" : "cursor-pointer"
                )}
              >
                <input
                  type="color"
                  value={value.color || ROLE_FALLBACK_COLOR.toLowerCase()}
                  onChange={(e) => patch({ color: e.target.value.toLowerCase() })}
                  disabled={readOnly || saving}
                  aria-label="自訂顏色"
                  className="h-7 w-10 cursor-pointer border border-line bg-transparent disabled:cursor-not-allowed"
                />
                自訂
              </label>
            </div>
          </div>

          {/* 權限清單：ADMINISTRATOR 固定在第一列 */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between">
              <p className="tech-label">PERMISSIONS</p>
              <p className="font-mono text-xs text-ink-muted">
                已開啟 <span className="text-ink">{enabledCount}</span> / {definitions.length}
              </p>
            </div>
            <ul className="mt-2 border-t border-line">
              {adminDef && renderPermission(adminDef)}
              {otherDefs.map(renderPermission)}
            </ul>
          </div>

          {canManage && !selected.is_default && !readOnly && (
            <div className="flex flex-wrap items-center justify-between gap-4 border border-alarm p-4">
              <div>
                <p className="tech-label text-alarm">DANGER ZONE</p>
                <p className="mt-1 text-sm text-ink-muted">擁有這個身分組的人會失去它的權限，刪除後無法恢復。</p>
              </div>
              <Button
                color="danger"
                variant="bordered"
                className="font-display tracking-[0.08em]"
                startContent={<FontAwesomeIcon icon={faTrash} className="w-3.5" />}
                onPress={() => setDeleteOpen(true)}
                isDisabled={saving}
              >
                刪除身分組
              </Button>
            </div>
          )}

          {/* 未儲存變更列 */}
          {dirty && (
            <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 border border-phos bg-surface-1 p-3">
              <p className="flex flex-1 items-center gap-2 font-display text-sm tracking-[0.04em] text-ink">
                <span className="led" aria-hidden />
                有未儲存的變更
              </p>
              <Button variant="bordered" size="sm" onPress={() => setDraft(null)} isDisabled={saving}>
                重設
              </Button>
              <Button color="primary" size="sm" onPress={handleSave} isLoading={saving}>
                儲存變更
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="hatch border border-line p-10 text-center">
          <p className="tech-label">NO DATA</p>
          <p className="mt-2 text-ink-muted">還沒有任何身分組</p>
        </div>
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
        title="放棄未儲存的變更？"
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
