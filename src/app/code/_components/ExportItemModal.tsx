"use client";

import { useMemo } from "react";
import toast from "react-hot-toast";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import QrCode from "@/components/ui/QrCode/QrCode";
import { buildOtpauthUri } from "@/lib/totp/otpauth";
import { showError } from "@/lib/errorDialog";
import { ExportItemModalProps } from "@/types/Code/ExportItemModal";
import ExportWarning from "./ExportWarning";

// 單筆匯出：顯示 otpauth QR Code，給手機上的驗證器 App 掃描
const ExportItemModal = (props: ExportItemModalProps) => {
  const uri = useMemo(() => buildOtpauthUri(props.item), [props.item]);

  const copyUri = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      toast.success("已複製連結", { position: "top-right" });
    } catch {
      showError("無法複製", "瀏覽器不允許存取剪貼簿。");
    }
  };

  return (
    <Modal isOpen onOpenChange={(open) => !open && props.onClose()} className="bg-surface text-ink">
      <ModalContent>
        <ModalHeader className="truncate">匯出「{props.item.name}」</ModalHeader>
        <ModalBody className="items-center gap-4">
          <QrCode value={uri} alt={`${props.item.name} 的 QR Code`} />
          <p className="text-center text-[15px] text-ink-muted">
            用 Google Authenticator、Microsoft Authenticator 等 App 掃描，就能加到手機上
          </p>
          <ExportWarning />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={copyUri}>
            複製連結
          </Button>
          <Button color="primary" onPress={props.onClose}>
            完成
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ExportItemModal;
