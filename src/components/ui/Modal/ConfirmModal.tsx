"use client";

import { useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { cn } from "@/lib/utils";
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
      className="border border-line bg-surface-1 text-ink"
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-3 border-b border-line font-display tracking-wide">
          <span className={cn("led", props.danger && "led-alarm")} aria-hidden />
          {props.title}
        </ModalHeader>
        {props.description && (
          <ModalBody className="py-5 font-normal text-ink-muted">
            {props.description}
          </ModalBody>
        )}
        <ModalFooter className="border-t border-line">
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
