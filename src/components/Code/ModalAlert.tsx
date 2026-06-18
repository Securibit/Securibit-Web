import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/react";
import { ModalProps } from "@/types/Code/ModalAlert";

const DialogDefault = (props: ModalProps) => {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  return (
    <>
      <button onClick={onOpen}>
        {props.children}
      </button>
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        className="dark:bg-gray-blue-800"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-black dark:text-white">
                刪除警告！
              </ModalHeader>
              <ModalBody className="text-black dark:text-white font-normal">
                請問您要刪除嗎？一經刪除就不可恢復，並且會遺失金鑰。
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="bordered"
                  color="danger"
                  onPress={onClose}
                  className="mr-1"
                >
                  取消
                </Button>
                <Button
                  color="success"
                  onPress={() => {
                    props.deleteTOTP();
                    onClose();
                  }}
                >
                  刪除！
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

export default DialogDefault;
