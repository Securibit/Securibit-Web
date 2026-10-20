"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "nextjs-toploader/app";
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Textarea } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import useAuth from "@/components/auth/useAuth";
import { deleteGroup, leaveGroup, transferGroup, updateGroup } from "@/lib/groups/groups";
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

// 整列紅字的動作
const dangerRowClass = "w-full py-3 text-center text-[17px] text-alarm hover:bg-surface-1";

// 設定分頁：名稱與說明、群組 ID、轉移擁有權、離開群組、刪除群組
const GroupSettings = ({ detail, onChanged }: GroupSettingsProps) => {
  const { user, can } = useAuth();
  const router = useRouter();
  const { group } = detail;
  const canEdit = has(detail.permissions, GROUP.MANAGE_GROUP);
  const isMember = detail.members.some((member) => member.id === user?.uid);
  // 刪除群組：擁有者，或全站管理員
  const canDelete = detail.is_owner || can(SITE.ADMINISTRATOR);

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
    router.replace("/groups");
  };

  const handleDelete = async () => {
    const result = await deleteGroup(group.id);
    if (!result.success) {
      showError("刪除群組失敗", result.message);
      return;
    }
    setDeleteOpen(false);
    toast.success(`已刪除「${group.name}」`, { position: "top-right" });
    router.replace("/groups");
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

      {showDanger && (
        <section>
          <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {detail.is_owner && (
              <button type="button" onClick={() => setTransferOpen(true)} className={dangerRowClass}>
                轉移擁有權
              </button>
            )}
            {isMember && !detail.is_owner && (
              <button type="button" onClick={() => setLeaveOpen(true)} className={dangerRowClass}>
                離開群組
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={() => setDeleteOpen(true)} className={dangerRowClass}>
                刪除群組
              </button>
            )}
          </div>
          {detail.is_owner && (
            <p className="mt-2 px-5 text-[13px] text-ink-muted">擁有者不能離開群組，要先轉移擁有權或刪除群組</p>
          )}
        </section>
      )}

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
