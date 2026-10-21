"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "nextjs-toploader/app";
import Link from "next/link";
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Switch, Textarea } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import useAuth from "@/components/auth/useAuth";
import useVault from "@/components/vault/useVault";
import VaultUnlock from "@/components/vault/VaultUnlock";
import { deleteGroup, leaveGroup, setDefaultGroup, transferGroup, updateGroup } from "@/lib/groups/groups";
import { GROUP, SITE, has } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { GroupMember } from "@/types/Group/Group";
import { GroupSettingsProps } from "@/types/Group/GroupSettings";
import DeleteGroupModal from "./DeleteGroupModal";

// 與資料庫的 check 一致
const NAME_MAX = 50;
const DESCRIPTION_MAX = 300;

const displayName = (member: GroupMember) =>
  member.name || (member.username ? `@${member.username}` : member.email || "這位成員");

// 整列紅字的動作；不能按時變灰
const dangerRowClass =
  "w-full py-3 text-center text-[17px] text-alarm hover:bg-surface-1 disabled:text-ink-muted disabled:hover:bg-transparent";

// 設定分頁：名稱與說明、群組 ID、預設群組與加密（擁有者）、轉移擁有權、離開群組、刪除群組
const GroupSettings = ({ detail, onChanged, exitHref }: GroupSettingsProps) => {
  const { user, can } = useAuth();
  const vault = useVault();
  const router = useRouter();
  const { group } = detail;
  const canEdit = has(detail.permissions, GROUP.MANAGE_GROUP);
  const isMember = detail.members.some((member) => member.id === user?.uid);
  // 刪除群組：擁有者，或全站管理員
  const canDelete = detail.is_owner || can(SITE.ADMINISTRATOR);
  // 擁有者不能刪自己的預設群組、也不能刪唯一擁有的群組（資料庫同樣檢查）
  const deleteBlocked = !detail.is_owner
    ? undefined
    : detail.is_default
      ? "這是你的預設群組，要先把其他群組設為預設才能刪除"
      : detail.owned_count <= 1
        ? "這是你唯一擁有的群組，不能刪除"
        : undefined;
  // 轉移：加密的群組只有擁有者一個成員；預設群組會自動把預設改到自己擁有的另一個群組，沒有就不能轉
  const transferBlocked = group.encrypted
    ? "加密的群組不能轉移擁有權"
    : detail.is_default && detail.owned_count <= 1
      ? "這是你唯一擁有的群組，要先建立另一個群組才能轉移"
      : undefined;

  // ---------- 預設群組與加密（只有擁有者） ----------
  const [settingDefault, setSettingDefault] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmDecrypt, setConfirmDecrypt] = useState(false);
  const hasOthers = detail.members.length > 1;
  const canToggle = vault.status === "unlocked" && (group.encrypted || !hasOthers);
  const encryptionHint =
    vault.status === "off"
      ? null
      : group.encrypted
        ? "金鑰會先在你的瀏覽器用加密密碼加密才存到伺服器，只有你看得到；加密的群組不能邀請其他人。關閉後金鑰會改回明文存放"
        : hasOthers
          ? "群組還有其他成員，要先移除成員才能開啟加密（加密的群組只有你一個人）"
          : vault.status === "locked"
            ? "先輸入加密密碼解鎖才能切換"
            : "開啟後金鑰會先在你的瀏覽器用加密密碼加密才存到伺服器，只有你看得到；加密的群組不能邀請其他人";

  const handleSetDefault = async () => {
    setSettingDefault(true);
    const result = await setDefaultGroup(group.id);
    setSettingDefault(false);
    if (!result.success) {
      showError("設為預設群組失敗", result.message);
      return;
    }
    toast.success(`已把「${group.name}」設為預設群組`, { position: "top-right" });
    await onChanged();
  };

  const toggleEncryption = async (encrypted: boolean) => {
    setToggling(true);
    const result = await vault.setGroupEncryption(group.id, encrypted);
    setToggling(false);
    if (!result.success) {
      showError(encrypted ? "開啟加密失敗" : "關閉加密失敗", result.message);
      return;
    }
    toast.success(encrypted ? "已開啟加密" : "已關閉加密", { position: "top-right" });
    await onChanged();
  };

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [nameError, setNameError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // 轉移擁有權：先選成員，再確認
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [transferring, setTransferring] = useState(false);
  const candidates = useMemo(() => detail.members.filter((member) => !member.is_owner), [detail.members]);

  const dirty = name.trim() !== group.name || description.trim() !== group.description;

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError("請輸入群組名稱");
      return;
    }
    setSaving(true);
    const result = await updateGroup(group.id, name, description);
    setSaving(false);
    if (!result.success) {
      showError("儲存群組設定失敗", result.message);
      return;
    }
    toast.success("已儲存", { position: "top-right" });
    await onChanged();
  };

  const handleLeave = async () => {
    const result = await leaveGroup(group.id);
    if (!result.success) {
      showError("離開群組失敗", result.message);
      return;
    }
    toast.success(`已離開「${group.name}」`, { position: "top-right" });
    router.replace(exitHref);
  };

  const handleDelete = async () => {
    const result = await deleteGroup(group.id);
    if (!result.success) {
      showError("刪除群組失敗", result.message);
      return;
    }
    setDeleteOpen(false);
    toast.success(`已刪除「${group.name}」`, { position: "top-right" });
    router.replace(exitHref);
  };

  const closeTransfer = () => {
    if (transferring) return;
    setTransferOpen(false);
    setTransferTo("");
  };

  const handleTransfer = async () => {
    const member = candidates.find((candidate) => candidate.id === transferTo);
    if (!member) return;
    setTransferring(true);
    const result = await transferGroup(group.id, member.id);
    setTransferring(false);
    if (!result.success) {
      showError("轉移擁有權失敗", result.message);
      return;
    }
    setTransferOpen(false);
    setTransferTo("");
    toast.success(`已將擁有權轉移給 ${displayName(member)}`, { position: "top-right" });
    await onChanged();
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(group.id);
      toast.success("已複製", { position: "top-right" });
    } catch {
      showError("無法複製", "瀏覽器不允許存取剪貼簿，請手動複製群組 ID。");
    }
  };

  const showDanger = detail.is_owner || (isMember && !detail.is_owner) || canDelete;
  const dangerNotes = [
    detail.is_owner && "擁有者不能離開群組，要先轉移擁有權或刪除群組",
    detail.is_owner && transferBlocked,
    detail.is_owner && !transferBlocked && detail.is_default && "轉移後你的預設群組會改成你擁有的另一個群組",
    canDelete && deleteBlocked,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      {/* 群組資料 */}
      <section>
        <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">群組資料</h2>
        <form
          className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface"
          onSubmit={(e) => {
            e.preventDefault();
            if (canEdit) handleSave();
          }}
        >
          <div className="px-5 py-4">
            <Input
              label="名稱"
              variant="flat"
              labelPlacement="outside"
              size="lg"
              isRequired
              isReadOnly={!canEdit}
              maxLength={NAME_MAX}
              value={name}
              onValueChange={(value) => {
                setName(value);
                setNameError(undefined);
              }}
              isInvalid={!!nameError}
              errorMessage={nameError}
            />
          </div>
          <div className="px-5 py-4">
            <Textarea
              label="說明"
              placeholder={canEdit ? "這個群組用來放哪些帳號的驗證碼" : undefined}
              variant="flat"
              labelPlacement="outside"
              size="lg"
              isReadOnly={!canEdit}
              maxLength={DESCRIPTION_MAX}
              value={description}
              onValueChange={setDescription}
              description={canEdit ? `${description.length} / ${DESCRIPTION_MAX}` : undefined}
            />
          </div>
          <div className="flex items-center justify-between gap-6 px-5 py-3">
            <span className="shrink-0 text-[17px]">群組 ID</span>
            <button type="button" onClick={copyId} title="點一下複製" className="flex min-w-0 items-center gap-2 text-ink-muted hover:opacity-60">
              <span className="truncate text-[15px]">{group.id}</span>
              <FontAwesomeIcon icon={faCopy} className="w-3.5 shrink-0" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-6 px-5 py-3">
            <span className="shrink-0 text-[17px]">建立時間</span>
            <span className="text-[17px] text-ink-muted tabular-nums">{formatDateTime(group.created_at)}</span>
          </div>
          {canEdit && (
            <button
              type="submit"
              disabled={saving || !dirty}
              className="w-full py-3 text-center text-[17px] text-accent hover:bg-surface-1 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {saving ? "儲存中…" : "儲存"}
            </button>
          )}
        </form>
        <p className="mt-2 px-5 text-[13px] text-ink-muted">
          {canEdit ? "名稱與說明會顯示給所有成員，以及收到邀請的人" : "需要「管理群組」權限才能修改名稱與說明"}
        </p>
      </section>

      {/* 預設群組與加密：只有擁有者 */}
      {detail.is_owner && (
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">預設與加密</h2>
          <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            <div className="flex items-center justify-between gap-6 px-5 py-3">
              <span className="shrink-0 text-[17px]">預設群組</span>
              {detail.is_default ? (
                <span className="text-[17px] text-ink-muted">目前的預設</span>
              ) : (
                <button
                  type="button"
                  onClick={handleSetDefault}
                  disabled={settingDefault}
                  className="text-[17px] text-accent hover:underline disabled:opacity-40"
                >
                  {settingDefault ? "設定中…" : "設為預設群組"}
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-6 px-5 py-3">
              <span className="shrink-0 text-[17px]">加密</span>
              {vault.status === "off" ? (
                <Link href="/me/update_info" className="text-[17px] text-accent hover:underline">
                  先設定加密密碼
                </Link>
              ) : (
                <Switch
                  aria-label="加密"
                  isSelected={group.encrypted}
                  isDisabled={!canToggle || toggling}
                  onValueChange={(next) => (next ? toggleEncryption(true) : setConfirmDecrypt(true))}
                />
              )}
            </div>
            {vault.status === "locked" && (group.encrypted || !hasOthers) && (
              <div className="px-5 py-4">
                <VaultUnlock compact />
              </div>
            )}
          </div>
          <p className="mt-2 px-5 text-[13px] text-ink-muted">
            預設群組排在驗證碼頁的第一個，新增驗證碼時預設放在這裡。
            {encryptionHint ?? "加密要先到「帳戶設定」設定一組只有你知道的加密密碼"}
          </p>
        </section>
      )}

      {showDanger && (
        <section>
          <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {detail.is_owner && (
              <button type="button" onClick={() => setTransferOpen(true)} disabled={!!transferBlocked} className={dangerRowClass}>
                轉移擁有權
              </button>
            )}
            {isMember && !detail.is_owner && (
              <button type="button" onClick={() => setLeaveOpen(true)} className={dangerRowClass}>
                離開群組
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={() => setDeleteOpen(true)} disabled={!!deleteBlocked} className={dangerRowClass}>
                刪除群組
              </button>
            )}
          </div>
          {dangerNotes.length > 0 && (
            <p className="mt-2 px-5 text-[13px] text-ink-muted">{dangerNotes.join("；")}</p>
          )}
        </section>
      )}

      <ConfirmModal
        isOpen={confirmDecrypt}
        danger
        title="關閉加密"
        description={`關閉後「${group.name}」的金鑰會改回明文存放在伺服器。確定要關閉嗎？`}
        confirmLabel="關閉加密"
        onCancel={() => setConfirmDecrypt(false)}
        onConfirm={async () => {
          setConfirmDecrypt(false);
          await toggleEncryption(false);
        }}
      />

      {/* 轉移擁有權：選成員 */}
      <Modal isOpen={transferOpen} onOpenChange={(open) => !open && closeTransfer()} className="bg-surface text-ink">
        <ModalContent>
          <ModalHeader>轉移擁有權</ModalHeader>
          <ModalBody className="gap-4">
            {candidates.length === 0 ? (
              <p className="text-ink-muted">群組裡還沒有其他成員，先邀請成員加入才能轉移擁有權。</p>
            ) : (
              <>
                <Select
                  label="新的擁有者"
                  placeholder="選擇成員"
                  variant="flat"
                  labelPlacement="outside"
                  size="lg"
                  selectedKeys={transferTo ? [transferTo] : []}
                  onChange={(e) => setTransferTo(e.target.value)}
                >
                  {candidates.map((member) => (
                    <SelectItem key={member.id}>{displayName(member)}</SelectItem>
                  ))}
                </Select>
                <p className="text-[13px] text-ink-muted">
                  轉移後你會變成一般成員（保留目前的身分組），不能再刪除群組或轉移擁有權，也可能失去部分權限。這個動作只有新的擁有者能再轉回來
                </p>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={closeTransfer} isDisabled={transferring}>
              取消
            </Button>
            {candidates.length > 0 && (
              <Button color="danger" onPress={handleTransfer} isDisabled={!transferTo} isLoading={transferring}>
                轉移
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmModal
        isOpen={leaveOpen}
        danger
        title="離開群組"
        description={`確定要離開「${group.name}」嗎？離開後就看不到群組的驗證碼，要重新受邀才能再加入。`}
        confirmLabel="離開"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={async () => {
          setLeaveOpen(false);
          await handleLeave();
        }}
      />

      <DeleteGroupModal
        isOpen={deleteOpen}
        groupName={group.name}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default GroupSettings;
