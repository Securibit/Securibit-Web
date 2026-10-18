"use client";

import { useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
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
    <Modal
      isOpen={props.isOpen}
      onOpenChange={(open) => !open && props.onCancel()}
      className="dark:bg-gray-blue-800"
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-black dark:text-white">
          <FontAwesomeIcon
            icon={faTriangleExclamation}
            className={props.danger ? "w-4 text-red-500" : "w-4 text-tpp"}
          />
          {props.title}
        </ModalHeader>
        {props.description && (
          <ModalBody className="text-black dark:text-white font-normal">
            {props.description}
          </ModalBody>
        )}
        <ModalFooter>
          <Button variant="bordered" onPress={props.onCancel} isDisabled={pending}>
            {props.cancelLabel ?? "取消"}
          </Button>
          <Button
            color={props.danger ? "danger" : "primary"}
            onPress={handleConfirm}
            isLoading={pending}
          >
            {props.confirmLabel ?? "確認"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ConfirmModal;
