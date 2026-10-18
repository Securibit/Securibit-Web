"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  AutocompleteItem,
  AutocompleteSection,
  Button,
  ButtonGroup,
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
import { ROLE_FALLBACK_COLOR } from "@/components/permissions/RoleChip";
import { GROUP_OVERWRITE_PERMISSIONS } from "@/lib/permissions/bits";
import { sortRoles } from "@/lib/permissions/hierarchy";
import { loadOverwrites, setOverwrite } from "@/lib/groups/groups";
import { showError } from "@/lib/errorDialog";
import { Overwrite, OverwriteTargetType } from "@/types/Permission/Permission";
import { OverwriteEditorProps } from "@/types/Permission/OverwriteEditor";

type BitState = "deny" | "inherit" | "allow";

const targetKey = (type: OverwriteTargetType, id: string) => `${type}:${id}`;

const bitState = (overwrite: Overwrite | undefined, bit: number): BitState =>
  !overwrite ? "inherit" : (overwrite.deny & bit) !== 0 ? "deny" : (overwrite.allow & bit) !== 0 ? "allow" : "inherit";

const STATE_BUTTONS: { state: BitState; label: string; icon: typeof faCheck; color: "danger" | "default" | "success" }[] = [
  { state: "deny", label: "拒絕", icon: faXmark, color: "danger" },
  { state: "inherit", label: "繼承", icon: faSlash, color: "default" },
  { state: "allow", label: "允許", icon: faCheck, color: "success" },
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
          className="h-3 w-3 flex-shrink-0 rounded-full"
          style={{ backgroundColor: role?.color || ROLE_FALLBACK_COLOR }}
        />
        <span className="truncate text-sm font-medium">{role?.name ?? "已刪除的身分組"}</span>
      </span>
    );
  };

  const editable = current ? canEdit(current.type, current.id) : false;

  return (
    <>
      <ModalHeader className="flex flex-col gap-1 text-black dark:text-white">
        權限設定：{account.name}
        <span className="text-sm font-normal text-gray-blue-500 dark:text-gray-blue-400">
          這裡的設定只影響這一筆驗證碼，會蓋過身分組本身的權限。順序：@everyone → 身分組 → 成員，後面的優先。
        </span>
      </ModalHeader>
      <ModalBody className="text-black dark:text-white">
        {overwrites === null ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-4 md:flex-row">
            {/* 左：覆寫對象 */}
            <div className="flex flex-col gap-2 md:w-56 md:flex-shrink-0">
              <Autocomplete
                aria-label="新增身分組或成員"
                placeholder="新增身分組或成員"
                size="sm"
                selectedKey={null}
                inputValue={search}
                onInputChange={setSearch}
                onSelectionChange={(key) => handleAdd(key === null ? null : String(key))}
                disabledKeys={disabledOptions}
                isDisabled={roleOptions.length === 0 && memberOptions.length === 0}
                listboxProps={{ emptyContent: "沒有符合的對象" }}
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

              <ul className="flex flex-col gap-1">
                {targets.map((item) => {
                  const overwrite = overwrites.find(
                    (o) => o.target_type === item.type && o.target_id === item.id
                  );
                  const count = GROUP_OVERWRITE_PERMISSIONS.filter((p) => bitState(overwrite, p.bit) !== "inherit").length;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(item.key)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                          current?.key === item.key
                            ? "bg-tpp/15 dark:bg-tpp/25"
                            : "hover:bg-gray-blue-100 dark:hover:bg-gray-blue-700/50"
                        }`}
                      >
                        <span className="min-w-0 flex-1">{renderTarget(item.type, item.id)}</span>
                        {count > 0 && (
                          <span className="flex-shrink-0 text-xs text-gray-blue-500 dark:text-gray-blue-400">
                            {count}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* 右：三態按鈕 */}
            <div className="min-w-0 flex-1">
              {current ? (
                <>
                  {!editable && (
                    <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      這個對象的身分組不低於你的最高身分組，無法修改。
                    </p>
                  )}
                  <ul className="divide-y divide-gray-blue-200 dark:divide-gray-blue-700">
                    {GROUP_OVERWRITE_PERMISSIONS.map((def) => {
                      const state = bitState(currentOverwrite, def.bit);
                      return (
                        <li key={def.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-blue-900 dark:text-white">{def.name}</p>
                            <p className="text-xs text-gray-blue-500 dark:text-gray-blue-400">{def.description}</p>
                          </div>
                          <ButtonGroup size="sm" className="flex-shrink-0" isDisabled={!editable || saving}>
                            {STATE_BUTTONS.map((button) => (
                              <Button
                                key={button.state}
                                color={state === button.state ? button.color : "default"}
                                variant={state === button.state ? "solid" : "flat"}
                                startContent={<FontAwesomeIcon icon={button.icon} className="w-3" />}
                                aria-pressed={state === button.state}
                                onPress={() => handleSet(def.bit, button.state)}
                              >
                                {button.label}
                              </Button>
                            ))}
                          </ButtonGroup>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-gray-blue-500 dark:text-gray-blue-400">
                  找不到 @everyone 身分組
                </p>
              )}
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
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
    className="dark:bg-gray-blue-800"
  >
    <ModalContent>{(onClose) => <OverwriteEditorBody {...props} onClose={onClose} />}</ModalContent>
  </Modal>
);

export default OverwriteEditor;
