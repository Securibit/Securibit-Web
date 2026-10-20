"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { updateAdminUser } from "@/lib/admin/admin";
import { showError } from "@/lib/errorDialog";
import { usernameProblem } from "@/lib/totp/account";
import { UserEditModalProps } from "@/types/Admin/UserEditModal";

// 去掉開頭的 @、轉小寫（資料庫也會再處理一次）
const normalizeUsername = (value: string) => value.trim().replace(/^@/, "").toLowerCase();

// 修改使用者的名稱與 @ID；只送出有變動的欄位（沒變的傳 null）
const UserEditModal = (props: UserEditModalProps) => {
  const { user } = props;
  const [name, setName] = useState(user.name ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [saving, setSaving] = useState(false);

  const nextName = name.trim();
  const nextUsername = normalizeUsername(username);
  const nameError = nextName ? undefined : "請輸入名稱";
  // 格式、UUID 樣式、保留字（同資料庫）；沒改的不檢查（舊的 @ID 可能是後來才變成保留字）
  const usernameError =
    nextUsername && nextUsername !== (user.username ?? "") ? usernameProblem(nextUsername) : undefined;

  const handleSave = async () => {
    if (nameError || usernameError) return;
    const nameChanged = nextName !== (user.name ?? "");
    const usernameChanged = nextUsername !== (user.username ?? "");
    if (!nameChanged && !usernameChanged) {
      props.onClose();
      return;
    }

    setSaving(true);
    const result = await updateAdminUser(
      user.id,
      nameChanged ? nextName : null,
      // 空字串代表清除 @ID
      usernameChanged ? nextUsername : null
    );
    setSaving(false);

    if (!result.success) {
      showError("修改使用者失敗", result.message);
      return;
    }
    toast.success("已儲存", { position: "top-right" });
    await props.onSaved();
    props.onClose();
  };

  return (
    <Modal isOpen onOpenChange={(open) => !open && props.onClose()} className="bg-surface text-ink">
      <ModalContent>
        <ModalHeader>編輯使用者</ModalHeader>
        <ModalBody>
          <form
            id="admin-user-edit-form"
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <Input
              label="名稱"
              labelPlacement="outside"
              variant="flat"
              size="lg"
              isRequired
              value={name}
              onValueChange={setName}
              isInvalid={!!nameError}
              errorMessage={nameError}
            />
            <Input
              label="@ID"
              labelPlacement="outside"
              variant="flat"
              size="lg"
              placeholder="留空代表清除"
              value={username}
              onValueChange={setUsername}
              startContent={<span className="text-ink-muted">@</span>}
              autoComplete="off"
              spellCheck="false"
              isInvalid={!!usernameError}
              errorMessage={usernameError}
              description="小寫英文、數字、底線與點，3～32 字"
            />
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={props.onClose} isDisabled={saving}>
            取消
          </Button>
          <Button color="primary" type="submit" form="admin-user-edit-form" isLoading={saving}>
            儲存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default UserEditModal;
