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
    <Modal
      isOpen={!!current}
      onOpenChange={(open) => !open && dismissError()}
      isDismissable={false}
      className="dark:bg-gray-blue-800"
    >
      <ModalContent>
        {current && (
          <>
            <ModalHeader className="flex items-center gap-2 text-black dark:text-white">
              <FontAwesomeIcon icon={faCircleExclamation} className="w-5 text-red-500" />
              {current.title}
            </ModalHeader>
            {current.message && (
              <ModalBody className="whitespace-pre-line break-words text-black dark:text-white font-normal">
                {current.message}
              </ModalBody>
            )}
            <ModalFooter className="items-center">
              {queue.length > 1 && (
                <span className="mr-auto text-sm text-gray-blue-500">還有 {queue.length - 1} 則錯誤</span>
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
