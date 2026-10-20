"use client";

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { dismissError, useErrorQueue } from "@/lib/errorDialog";

// 掛在 Layout，顯示 showError 排進來的錯誤，一次一個
const ErrorDialogHost = () => {
  const queue = useErrorQueue();
  const current = queue[0];

  return (
    <Modal
      isOpen={!!current}
      onOpenChange={(open) => !open && dismissError()}
      isDismissable={false}
      className="border border-line bg-surface-1 text-ink"
    >
      <ModalContent>
        {current && (
          <>
            <ModalHeader className="flex items-center gap-3 border-b border-line font-display tracking-wide">
              <span className="led led-alarm" aria-hidden />
              {current.title}
            </ModalHeader>
            {current.message && (
              <ModalBody className="whitespace-pre-line break-words py-5 font-normal text-ink-muted">
                {current.message}
              </ModalBody>
            )}
            <ModalFooter className="items-center border-t border-line">
              {queue.length > 1 && (
                <span className="mr-auto font-mono text-xs text-ink-dim">還有 {queue.length - 1} 則錯誤</span>
              )}
              <Button color="primary" onPress={dismissError} autoFocus>
                確定
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ErrorDialogHost;
