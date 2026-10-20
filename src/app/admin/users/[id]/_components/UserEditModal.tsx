"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { updateAdminUser } from "@/lib/admin/admin";
import { showError } from "@/lib/errorDialog";
import { UserEditModalProps } from "@/types/Admin/UserEditModal";

// 與資料庫 profiles_username_format 相同（存小寫）
const USERNAME_PATTERN = /^[a-z0-9_.]{3,32}$/;

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
  const usernameError =
    nextUsername && !USERNAME_PATTERN.test(nextUsername) ? "只能用小寫英文、數字、底線與點，長度 3～32 字" : undefined;

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
    toast.success("已更新使用者資料！", { position: "top-right" });
    await props.onSaved();
    props.onClose();
  };

  return (
    <Modal isOpen onOpenChange={(open) => !open && props.onClose()} className="border border-line bg-surface-1 text-ink">
      <ModalContent>
        <ModalHeader className="border-b border-line font-display tracking-wide">修改使用者資料</ModalHeader>
        <ModalBody className="py-5">
          <form
            id="admin-user-edit-form"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <Input
              label="名稱"
              variant="bordered"
              isRequired
              value={name}
              onValueChange={setName}
              isInvalid={!!nameError}
              errorMessage={nameError}
            />
            <Input
              label="@ID"
              variant="bordered"
              placeholder="留空代表清除"
              value={username}
              onValueChange={setUsername}
              startContent={<span className="font-mono text-sm text-ink-dim">@</span>}
              autoComplete="off"
              spellCheck="false"
              isInvalid={!!usernameError}
              errorMessage={usernameError}
              description="小寫英文、數字、底線與點，3～32 字"
              classNames={{ input: "font-mono" }}
            />
          </form>
        </ModalBody>
        <ModalFooter className="border-t border-line">
          <Button variant="bordered" onPress={props.onClose} isDisabled={saving}>
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
