"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  AutocompleteItem,
  AutocompleteSection,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faSlash, faXmark } from "@fortawesome/free-solid-svg-icons";
import Spinner from "@/components/ui/Loading/Spinner";
import UserChip from "@/components/permissions/UserChip";
import { GROUP_OVERWRITE_PERMISSIONS } from "@/lib/permissions/bits";
import { sortRoles } from "@/lib/permissions/hierarchy";
import { loadOverwrites, setOverwrite } from "@/lib/groups/groups";
import { showError } from "@/lib/errorDialog";
import { cn } from "@/lib/utils";
import { Overwrite, OverwriteTargetType } from "@/types/Permission/Permission";
import { OverwriteEditorProps } from "@/types/Permission/OverwriteEditor";

type BitState = "deny" | "inherit" | "allow";

const targetKey = (type: OverwriteTargetType, id: string) => `${type}:${id}`;

const bitState = (overwrite: Overwrite | undefined, bit: number): BitState =>
  !overwrite ? "inherit" : (overwrite.deny & bit) !== 0 ? "deny" : (overwrite.allow & bit) !== 0 ? "allow" : "inherit";

// 三段切換：拒絕 / 繼承 / 允許（選中的樣式）
const STATE_BUTTONS: { state: BitState; label: string; icon: typeof faCheck; active: string }[] = [
  { state: "deny", label: "拒絕", icon: faXmark, active: "bg-alarm text-white" },
  { state: "inherit", label: "繼承", icon: faSlash, active: "bg-line text-ink" },
  { state: "allow", label: "允許", icon: faCheck, active: "bg-phos text-phos-ink" },
];

// 編輯器本體：ModalContent 每次開啟才掛上，掛上時載入這筆驗證碼的覆寫
const OverwriteEditorBody = (props: OverwriteEditorProps & { onClose: () => void }) => {
  const { account, actor } = props;
  const [overwrites, setOverwrites] = useState<Overwrite[] | null>(null);
  // 剛從選單加進來、還沒設定任何權限的對象（第一次點按鈕後才會寫進資料庫）
  const [added, setAdded] = useState<{ type: OverwriteTargetType; id: string }[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const everyone = props.roles.find((role) => role.is_default) ?? null;
  const roles = useMemo(() => sortRoles(props.roles).filter((role) => !role.is_default), [props.roles]);

  const applyLoaded = (result: Awaited<ReturnType<typeof loadOverwrites>>) => {
    if (result.success) {
      setOverwrites(result.data);
    } else {
      setOverwrites((old) => old ?? []);
      showError("載入權限設定失敗", result.message);
    }
  };

  const reload = async () => applyLoaded(await loadOverwrites(account.id));

  useEffect(() => {
    let cancelled = false;
    loadOverwrites(account.id).then((result) => {
      if (!cancelled) applyLoaded(result);
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 左邊的對象：@everyone → 身分組（由高到低）→ 成員
  const targets = useMemo(() => {
    const keys = new Set([
      ...(overwrites ?? []).map((item) => targetKey(item.target_type, item.target_id)),
      ...added.map((item) => targetKey(item.type, item.id)),
    ]);
    const list: { key: string; type: OverwriteTargetType; id: string }[] = [];
    if (everyone) list.push({ key: targetKey("role", everyone.id), type: "role", id: everyone.id });
    roles.forEach((role) => {
      const key = targetKey("role", role.id);
      if (keys.has(key)) list.push({ key, type: "role", id: role.id });
    });
    props.members.forEach((member) => {
      const key = targetKey("member", member.id);
      if (keys.has(key)) list.push({ key, type: "member", id: member.id });
    });
    return list;
  }, [overwrites, added, everyone, roles, props.members]);

  const current = targets.find((item) => item.key === selectedKey) ?? targets[0] ?? null;
  const currentOverwrite = current
    ? overwrites?.find((item) => item.target_type === current.type && item.target_id === current.id)
    : undefined;

  // 管得到才能改：@everyone 一律可以；身分組 / 成員要比自己低
  const canEdit = (type: OverwriteTargetType, id: string) => {
    if (actor.unrestricted) return true;
    if (type === "role") {
      const role = props.roles.find((item) => item.id === id);
      return !!role && (role.is_default || role.position < actor.topPosition);
    }
    const member = props.members.find((item) => item.id === id);
    return !!member && member.top_position < actor.topPosition;
  };

  // 還沒設定的身分組與成員（擁有者不受覆寫影響，不列出）
  const shownKeys = new Set(targets.map((item) => item.key));
  const roleOptions = roles.filter((role) => !shownKeys.has(targetKey("role", role.id)));
  const memberOptions = props.members.filter(
    (member) => !member.is_owner && !shownKeys.has(targetKey("member", member.id))
  );
  const disabledOptions = [
    ...roleOptions.filter((role) => !canEdit("role", role.id)).map((role) => targetKey("role", role.id)),
    ...memberOptions.filter((member) => !canEdit("member", member.id)).map((member) => targetKey("member", member.id)),
  ];

  const handleAdd = (key: string | null) => {
    if (!key) return;
    const [type, id] = key.split(":") as [OverwriteTargetType, string];
    setAdded((old) => [...old, { type, id }]);
    setSelectedKey(key);
    setSearch("");
  };

  const handleSet = async (bit: number, state: BitState) => {
    if (!current || !overwrites) return;
    const old = currentOverwrite ?? { target_type: current.type, target_id: current.id, allow: 0, deny: 0 };
    const allow = state === "allow" ? old.allow | bit : old.allow & ~bit;
    const deny = state === "deny" ? old.deny | bit : old.deny & ~bit;
    if (allow === old.allow && deny === old.deny) return;

    // 先換畫面，失敗再重新載入
    const others = overwrites.filter((item) => !(item.target_type === current.type && item.target_id === current.id));
    setOverwrites(allow === 0 && deny === 0 ? others : [...others, { ...old, allow, deny }]);
    // 全部改回繼承時資料庫會刪掉這筆，但左邊清單先保留，方便繼續設定
    if (!added.some((item) => item.type === current.type && item.id === current.id)) {
      setAdded((list) => [...list, { type: current.type, id: current.id }]);
    }

    setSaving(true);
    const result = await setOverwrite(account.id, current.type, current.id, allow, deny);
    setSaving(false);
    if (!result.success) {
      showError("變更權限失敗", result.message);
      await reload();
      return;
    }
    await props.onChanged();
  };

  const renderTarget = (type: OverwriteTargetType, id: string) => {
    if (type === "member") {
      const member = props.members.find((item) => item.id === id) ?? null;
      return <UserChip user={member} size="sm" />;
    }
    const role = props.roles.find((item) => item.id === id);
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn("h-2.5 w-2.5 flex-shrink-0", !role?.color && "bg-ink-dim")}
          style={role?.color ? { backgroundColor: role.color } : undefined}
          aria-hidden
        />
        <span className="truncate font-display text-sm">{role?.name ?? "已刪除的身分組"}</span>
      </span>
    );
  };

  const editable = current ? canEdit(current.type, current.id) : false;

  return (
    <>
      <ModalHeader className="flex flex-col gap-1 border-b border-line font-display tracking-wide">
        權限設定：{account.name}
        <span className="font-body text-sm font-normal tracking-normal text-ink-muted">
          這裡的設定只影響這一筆驗證碼，會蓋過身分組本身的權限。順序：@everyone → 身分組 → 成員，後面的優先。
        </span>
      </ModalHeader>
      <ModalBody className="py-4">
        {overwrites === null ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-4 md:flex-row md:gap-6">
            {/* 左：覆寫對象 */}
            <div className="flex flex-col gap-2 md:w-56 md:flex-shrink-0">
              <Autocomplete
                aria-label="新增身分組或成員"
                placeholder="新增身分組或成員"
                variant="bordered"
                size="sm"
                selectedKey={null}
                inputValue={search}
                onInputChange={setSearch}
                onSelectionChange={(key) => handleAdd(key === null ? null : String(key))}
                disabledKeys={disabledOptions}
                isDisabled={roleOptions.length === 0 && memberOptions.length === 0}
                listboxProps={{ emptyContent: "沒有符合的對象" }}
                popoverProps={{ classNames: { content: "border border-line bg-surface-1" } }}
              >
                <AutocompleteSection title="身分組" key="roles" className={roleOptions.length === 0 ? "hidden" : ""}>
                  {roleOptions.map((role) => (
                    <AutocompleteItem key={targetKey("role", role.id)} textValue={role.name}>
                      {renderTarget("role", role.id)}
                    </AutocompleteItem>
                  ))}
                </AutocompleteSection>
                <AutocompleteSection title="成員" key="members" className={memberOptions.length === 0 ? "hidden" : ""}>
                  {memberOptions.map((member) => (
                    <AutocompleteItem
                      key={targetKey("member", member.id)}
                      textValue={`${member.name} ${member.username ?? ""} ${member.email ?? ""}`}
                    >
                      {renderTarget("member", member.id)}
                    </AutocompleteItem>
                  ))}
                </AutocompleteSection>
              </Autocomplete>

              <ul className="border border-line bg-surface-1">
                {targets.map((item) => {
                  const overwrite = overwrites.find(
                    (o) => o.target_type === item.type && o.target_id === item.id
                  );
                  const count = GROUP_OVERWRITE_PERMISSIONS.filter((p) => bitState(overwrite, p.bit) !== "inherit").length;
                  const active = current?.key === item.key;
                  return (
                    <li key={item.key} className="border-b border-line last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setSelectedKey(item.key)}
                        className={cn(
                          "flex w-full items-center gap-2 border-l-2 px-2.5 py-2 text-left transition-colors",
                          active ? "border-phos bg-phos/10 text-phos" : "border-transparent text-ink hover:bg-ink/5"
                        )}
                      >
                        <span className="min-w-0 flex-1">{renderTarget(item.type, item.id)}</span>
                        {count > 0 && (
                          <span className="flex-shrink-0 font-mono text-[11px] text-ink-dim">{count}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* 右：三段切換 */}
            <div className="min-w-0 flex-1">
              {current ? (
                <>
                  {!editable && (
                    <p className="mb-3 border-l-2 border-line-strong pl-3 text-sm text-ink-muted">
                      這個對象的身分組不低於你的最高身分組，無法修改。
                    </p>
                  )}
                  <ul className="border-t border-line">
                    {GROUP_OVERWRITE_PERMISSIONS.map((def) => {
                      const state = bitState(currentOverwrite, def.bit);
                      const disabled = !editable || saving;
                      return (
                        <li key={def.key} className="flex flex-col gap-2 border-b border-line py-3 sm:flex-row sm:items-center sm:gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-display text-sm font-semibold text-ink">{def.name}</p>
                            <p className="text-xs text-ink-muted">{def.description}</p>
                          </div>
                          <div
                            role="group"
                            aria-label={def.name}
                            className={cn("flex flex-shrink-0 self-start border border-line sm:self-auto", disabled && "opacity-50")}
                          >
                            {STATE_BUTTONS.map((button) => {
                              const on = state === button.state;
                              return (
                                <button
                                  key={button.state}
                                  type="button"
                                  disabled={disabled}
                                  aria-pressed={on}
                                  onClick={() => handleSet(def.bit, button.state)}
                                  className={cn(
                                    "flex h-8 items-center gap-1.5 border-r border-line px-3 font-display text-xs tracking-[0.08em] transition-colors last:border-r-0 disabled:cursor-not-allowed",
                                    on ? button.active : "text-ink-muted hover:bg-ink/5 hover:text-ink"
                                  )}
                                >
                                  <FontAwesomeIcon icon={button.icon} className="w-3" />
                                  {button.label}
                                </button>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <div className="hatch border border-line p-8 text-center">
                  <p className="tech-label">NO DATA</p>
                  <p className="mt-2 text-sm text-ink-muted">找不到 @everyone 身分組</p>
                </div>
              )}
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter className="border-t border-line">
        <Button variant="bordered" onPress={props.onClose}>
          完成
        </Button>
      </ModalFooter>
    </>
  );
};

// 單筆驗證碼的權限覆寫（Discord 頻道權限）：每次點擊直接寫入，沒有「儲存」按鈕
const OverwriteEditor = (props: OverwriteEditorProps) => (
  <Modal
    isOpen={props.isOpen}
    onOpenChange={(open) => !open && props.onClose()}
    size="2xl"
    scrollBehavior="inside"
    className="border border-line bg-surface-1 text-ink"
  >
    <ModalContent>{(onClose) => <OverwriteEditorBody {...props} onClose={onClose} />}</ModalContent>
  </Modal>
);

export default OverwriteEditor;
