"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { deleteAdminUser } from "@/lib/admin/admin";
import { showError } from "@/lib/errorDialog";
import { DeleteUserModalProps } from "@/types/Admin/DeleteUserModal";

// 刪除使用者：外觀同 ConfirmModal，但要先輸入對方的 email 才能按確認（避免刪錯人）
const DeleteUserModal = (props: DeleteUserModalProps) => {
  const { user } = props;
  // 沒有 email 的帳號改成輸入使用者 ID
  const expected = user.email || user.id;
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const matched = typed.trim().toLowerCase() === expected.toLowerCase();

  const handleConfirm = async () => {
    if (!matched) return;
    setPending(true);
    const result = await deleteAdminUser(user.id);
    setPending(false);
    if (!result.success) {
      showError("刪除使用者失敗", result.message);
      return;
    }
    toast.success("已刪除使用者！", { position: "top-right" });
    props.onDeleted();
  };

  return (
    <Modal isOpen onOpenChange={(open) => !open && !pending && props.onClose()} className="dark:bg-gray-blue-800">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-black dark:text-white">
          <FontAwesomeIcon icon={faTriangleExclamation} className="w-4 text-red-500" />
          刪除使用者
        </ModalHeader>
        <ModalBody className="font-normal text-black dark:text-white">
          <p>
            確定要刪除「{user.name || user.email}」嗎？他的帳號、所有驗證碼與群組成員資格都會刪除，無法恢復。
            擁有群組的使用者要先轉移或刪除群組。
          </p>
          <form
            id="admin-user-delete-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            <Input
              label={user.email ? "輸入對方的 Email 以確認" : "輸入使用者 ID 以確認"}
              placeholder={expected}
              value={typed}
              onValueChange={setTyped}
              autoComplete="off"
              spellCheck="false"
            />
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="bordered" onPress={props.onClose} isDisabled={pending}>
            取消
          </Button>
          <Button color="danger" type="submit" form="admin-user-delete-form" isDisabled={!matched} isLoading={pending}>
            刪除使用者
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DeleteUserModal;
