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
  Tab,
  Tabs,
} from "@heroui/react";
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

// 三段切換：允許 / 繼承 / 拒絕
const STATES: { state: BitState; label: string }[] = [
  { state: "allow", label: "允許" },
  { state: "inherit", label: "繼承" },
  { state: "deny", label: "拒絕" },
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
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", !role?.color && "bg-ink-muted")}
          style={role?.color ? { backgroundColor: role.color } : undefined}
          aria-hidden
        />
        <span className="truncate text-[15px]">{role?.name ?? "已刪除的身分組"}</span>
      </span>
    );
  };

  const editable = current ? canEdit(current.type, current.id) : false;

  return (
    <>
      <ModalHeader>權限設定</ModalHeader>
      <ModalBody>
        <p className="text-[13px] text-ink-muted">
          只影響「{account.name}」這一筆驗證碼，會蓋過身分組本身的權限。順序：@everyone → 身分組 → 成員，後面的優先
        </p>
        {overwrites === null ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-6 md:flex-row">
            {/* 左：覆寫對象 */}
            <div className="flex flex-col gap-2 md:w-56 md:shrink-0">
              <Autocomplete
                aria-label="新增身分組或成員"
                placeholder="新增身分組或成員"
                variant="flat"
                selectedKey={null}
                inputValue={search}
                onInputChange={setSearch}
                onSelectionChange={(key) => handleAdd(key === null ? null : String(key))}
                disabledKeys={disabledOptions}
                isDisabled={roleOptions.length === 0 && memberOptions.length === 0}
                listboxProps={{ emptyContent: "沒有符合的對象" }}
                popoverProps={{ classNames: { content: "bg-surface text-ink" } }}
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

              <ul className="flex flex-col gap-0.5">
                {targets.map((item) => {
                  const overwrite = overwrites.find(
                    (o) => o.target_type === item.type && o.target_id === item.id
                  );
                  const count = GROUP_OVERWRITE_PERMISSIONS.filter((p) => bitState(overwrite, p.bit) !== "inherit").length;
                  const active = current?.key === item.key;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(item.key)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left",
                          active ? "bg-surface-1" : "hover:bg-surface-1/60"
                        )}
                      >
                        <span className="min-w-0 flex-1">{renderTarget(item.type, item.id)}</span>
                        {count > 0 && <span className="shrink-0 text-[13px] tabular-nums text-ink-muted">{count}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* 右：每個權限一列，右邊三段切換 */}
            <div className="min-w-0 flex-1">
              {current ? (
                <>
                  {!editable && (
                    <p className="mb-2 px-5 text-[13px] text-ink-muted">這個對象的身分組不低於你的最高身分組，無法修改</p>
                  )}
                  <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
                    {GROUP_OVERWRITE_PERMISSIONS.map((def) => {
                      const state = bitState(currentOverwrite, def.bit);
                      // 自己在這筆驗證碼沒有的權限不能變更（允許、拒絕都一樣；擁有者 / 全站管理例外）
                      const owned = actor.unrestricted || (account.permissions & def.bit) !== 0;
                      const disabled = !editable || !owned || saving;
                      return (
                        <div key={def.key} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                          <div className="min-w-0">
                            <p className="text-[17px]">{def.name}</p>
                            <p className="text-[13px] text-ink-muted">{def.description}</p>
                            {editable && !owned && (
                              <p className="text-[13px] text-ink-muted">你在這筆驗證碼沒有這個權限，無法變更</p>
                            )}
                          </div>
                          <Tabs
                            aria-label={def.name}
                            variant="light"
                            radius="full"
                            size="sm"
                            selectedKey={state}
                            isDisabled={disabled}
                            onSelectionChange={(key) => handleSet(def.bit, key as BitState)}
                            classNames={{ base: "shrink-0 self-start sm:self-auto", tabList: "bg-surface-1 p-0.5", cursor: "bg-surface" }}
                          >
                            {STATES.map((item) => (
                              <Tab key={item.state} title={item.label} />
                            ))}
                          </Tabs>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">找不到 @everyone 身分組</div>
              )}
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="primary" onPress={props.onClose}>
          完成
        </Button>
      </ModalFooter>
    </>
  );
};

// 單筆驗證碼的權限覆寫：每次點擊直接寫入，沒有「儲存」按鈕
const OverwriteEditor = (props: OverwriteEditorProps) => (
  <Modal
    isOpen={props.isOpen}
    onOpenChange={(open) => !open && props.onClose()}
    size="2xl"
    scrollBehavior="inside"
    className="bg-surface text-ink"
  >
    <ModalContent>{(onClose) => <OverwriteEditorBody {...props} onClose={onClose} />}</ModalContent>
  </Modal>
);

export default OverwriteEditor;
