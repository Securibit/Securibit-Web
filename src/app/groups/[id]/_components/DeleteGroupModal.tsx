"use client";

import { useState } from "react";
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { DeleteGroupModalProps } from "@/types/Group/DeleteGroupModal";

// 刪除群組：要輸入群組名稱才能按確認
const DeleteGroupModal = (props: DeleteGroupModalProps) => {
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const matched = typed.trim() === props.groupName.trim();

  const cancel = () => {
    if (pending) return;
    setTyped("");
    props.onCancel();
  };

  const confirm = async () => {
    if (!matched) return;
    setPending(true);
    try {
      await props.onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal isOpen={props.isOpen} onOpenChange={(open) => !open && cancel()} className="dark:bg-gray-blue-800">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-black dark:text-white">
          <FontAwesomeIcon icon={faTriangleExclamation} className="w-4 text-red-500" />
          刪除群組
        </ModalHeader>
        <ModalBody className="text-black dark:text-white">
          <p>
            刪除後群組的所有驗證碼、金鑰、身分組、成員與邀請都會一併刪除，<b>無法恢復</b>。
          </p>
          <p className="text-sm">
            請輸入群組名稱 <span className="font-semibold">「{props.groupName}」</span> 確認：
          </p>
          <form
            id="delete-group-form"
            onSubmit={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            <Input aria-label="群組名稱" placeholder={props.groupName} value={typed} onValueChange={setTyped} autoComplete="off" />
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="bordered" onPress={cancel} isDisabled={pending}>
            取消
          </Button>
          <Button color="danger" type="submit" form="delete-group-form" isDisabled={!matched} isLoading={pending}>
            刪除群組
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DeleteGroupModal;
