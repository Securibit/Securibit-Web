"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "nextjs-toploader/app";
import { Button, Input, Textarea } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faRightFromBracket, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import useAuth from "@/components/auth/useAuth";
import { deleteGroup, leaveGroup, updateGroup } from "@/lib/groups/groups";
import { GROUP, SITE, has } from "@/lib/permissions/bits";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { GroupSettingsProps } from "@/types/Group/GroupSettings";
import DeleteGroupModal from "./DeleteGroupModal";

// 與資料庫的 check 一致
const NAME_MAX = 50;
const DESCRIPTION_MAX = 300;

// 設定分頁：名稱與說明、離開群組、刪除群組
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
    toast.success("已儲存群組設定！", { position: "top-right" });
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

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(group.id);
      toast.success("已複製群組 ID！", { position: "top-right" });
    } catch {
      showError("無法複製", "瀏覽器不允許存取剪貼簿。");
    }
  };

  const sectionClass =
    "rounded-lg border border-gray-blue-200 bg-white p-4 shadow sm:p-6 dark:border-gray-blue-700 dark:bg-gray-blue-800";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className={sectionClass}>
        <h2 className="mb-4 font-semibold">群組資料</h2>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canEdit) handleSave();
          }}
        >
          <Input
            label="群組名稱"
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
          <Textarea
            label="說明"
            isReadOnly={!canEdit}
            maxLength={DESCRIPTION_MAX}
            value={description}
            onValueChange={setDescription}
            description={canEdit ? `${description.length} / ${DESCRIPTION_MAX}` : undefined}
          />
          {canEdit ? (
            <div>
              <Button type="submit" color="primary" isLoading={saving} isDisabled={!dirty}>
                儲存
              </Button>
            </div>
          ) : (
            <p className="text-sm text-gray-blue-500 dark:text-gray-blue-400">需要「管理群組」權限才能修改。</p>
          )}
        </form>
        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-blue-500 dark:text-gray-blue-400">群組 ID</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono">{group.id}</span>
            <button onClick={copyId} aria-label="複製群組 ID" className="text-gray-blue-400 hover:text-tpp">
              <FontAwesomeIcon icon={faCopy} className="w-3.5" />
            </button>
          </dd>
          <dt className="text-gray-blue-500 dark:text-gray-blue-400">建立時間</dt>
          <dd>{formatDateTime(group.created_at)}</dd>
        </dl>
      </section>

      {detail.is_owner && (
        <section className={sectionClass}>
          <h2 className="mb-1 font-semibold">轉移擁有權</h2>
          <p className="text-sm text-gray-blue-500 dark:text-gray-blue-400">
            到「成員」分頁，在要接手的成員旁按「轉移擁有權」。擁有者不能離開群組，要先轉移或刪除群組。
          </p>
        </section>
      )}

      {(isMember && !detail.is_owner) || canDelete ? (
        <section className="rounded-lg border border-red-300 bg-white p-4 shadow sm:p-6 dark:border-red-800 dark:bg-gray-blue-800">
          <h2 className="mb-4 font-semibold text-red-600 dark:text-red-400">危險區域</h2>
          <div className="flex flex-col gap-4">
            {isMember && !detail.is_owner && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p className="font-medium">離開群組</p>
                  <p className="text-sm text-gray-blue-500 dark:text-gray-blue-400">離開後就看不到群組的驗證碼，要重新受邀才能再加入。</p>
                </div>
                <Button
                  color="danger"
                  variant="bordered"
                  startContent={<FontAwesomeIcon icon={faRightFromBracket} className="w-3.5" />}
                  onPress={() => setLeaveOpen(true)}
                >
                  離開群組
                </Button>
              </div>
            )}
            {canDelete && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p className="font-medium">刪除群組</p>
                  <p className="text-sm text-gray-blue-500 dark:text-gray-blue-400">所有驗證碼與金鑰都會一併刪除，無法恢復。</p>
                </div>
                <Button
                  color="danger"
                  startContent={<FontAwesomeIcon icon={faTrashCan} className="w-3.5" />}
                  onPress={() => setDeleteOpen(true)}
                >
                  刪除群組
                </Button>
              </div>
            )}
          </div>
        </section>
      ) : null}

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
