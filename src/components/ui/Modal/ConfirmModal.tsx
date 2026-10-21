"use client";

import { useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { ConfirmModalProps } from "@/types/Modal/ConfirmModal";

// 確認對話框：由呼叫端控制開關，確認期間鎖住按鈕避免重複送出
const ConfirmModal = (props: ConfirmModalProps) => {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await props.onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal isOpen={props.isOpen} onOpenChange={(open) => !open && props.onCancel()} className="bg-surface text-ink">
      <ModalContent>
        <ModalHeader>{props.title}</ModalHeader>
        {props.description && <ModalBody className="text-ink-muted">{props.description}</ModalBody>}
        <ModalFooter>
          <Button variant="light" onPress={props.onCancel} isDisabled={pending}>
            {props.cancelLabel ?? "取消"}
          </Button>
          <Button color={props.danger ? "danger" : "primary"} onPress={handleConfirm} isLoading={pending}>
            {props.confirmLabel ?? "確認"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ConfirmModal;
