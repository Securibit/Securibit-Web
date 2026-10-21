"use client";

import { useState } from "react";
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
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
    <Modal isOpen={props.isOpen} onOpenChange={(open) => !open && cancel()} className="bg-surface text-ink">
      <ModalContent>
        <ModalHeader>刪除群組</ModalHeader>
        <ModalBody className="gap-5">
          <p className="text-ink-muted">刪除後群組的所有驗證碼、金鑰、身分組、成員與邀請都會一併刪除，無法恢復。</p>
          <form
            id="delete-group-form"
            onSubmit={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            <Input
              label={`輸入群組名稱「${props.groupName}」確認`}
              variant="flat"
              labelPlacement="outside"
              size="lg"
              placeholder={props.groupName}
              value={typed}
              onValueChange={setTyped}
              autoComplete="off"
              autoFocus
            />
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={cancel} isDisabled={pending}>
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
