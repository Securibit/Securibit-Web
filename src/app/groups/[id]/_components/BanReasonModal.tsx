"use client";

import { useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Textarea } from "@heroui/react";
import { BAN_REASON_MAX } from "@/lib/groups/groups";
import { showError } from "@/lib/errorDialog";
import { BanReasonModalProps } from "@/types/Group/BanReasonModal";

// 封鎖原因（選填）：封鎖成員、修改封鎖原因共用。由呼叫端用 key 重新掛載來重設內容
const BanReasonModal = (props: BanReasonModalProps) => {
  const [reason, setReason] = useState(props.initialReason ?? "");
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (!saving) props.onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await props.onSave(reason);
    setSaving(false);
    if (!result.success) {
      showError(`${props.confirmLabel}失敗`, result.message);
      return;
    }
    props.onClose();
  };

  return (
    <Modal isOpen={props.isOpen} onOpenChange={(open) => !open && close()} className="bg-surface text-ink">
      <ModalContent>
        <ModalHeader>{props.title}</ModalHeader>
        <ModalBody>
          {props.description && <div className="text-[15px] text-ink-muted">{props.description}</div>}
          <form
            id="ban-reason-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <Textarea
              label="原因"
              placeholder="只有能管理封鎖名單的人看得到"
              variant="flat"
              labelPlacement="outside"
              size="lg"
              autoFocus
              maxLength={BAN_REASON_MAX}
              value={reason}
              onValueChange={setReason}
              description={`選填，${reason.length} / ${BAN_REASON_MAX}`}
            />
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={close} isDisabled={saving}>
            取消
          </Button>
          <Button color={props.danger ? "danger" : "primary"} type="submit" form="ban-reason-form" isLoading={saving}>
            {props.confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default BanReasonModal;
