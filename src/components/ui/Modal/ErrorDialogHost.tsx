"use client";

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import { dismissError, useErrorQueue } from "@/lib/errorDialog";

// 掛在 Layout，顯示 showError 排進來的錯誤，一次一個
const ErrorDialogHost = () => {
  const queue = useErrorQueue();
  const current = queue[0];

  return (
    <Modal isOpen={!!current} onOpenChange={(open) => !open && dismissError()} isDismissable={false} className="bg-surface text-ink">
      <ModalContent>
        {current && (
          <>
            <ModalHeader className="flex items-center gap-2">
              <FontAwesomeIcon icon={faCircleExclamation} className="w-4 text-alarm" />
              {current.title}
            </ModalHeader>
            {current.message && (
              <ModalBody className="whitespace-pre-line break-words text-ink-muted">{current.message}</ModalBody>
            )}
            <ModalFooter className="items-center">
              {queue.length > 1 && <span className="mr-auto text-[13px] text-ink-muted">還有 {queue.length - 1} 則</span>}
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
