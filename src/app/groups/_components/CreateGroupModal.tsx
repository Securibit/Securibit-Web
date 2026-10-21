"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Textarea } from "@heroui/react";
import { createGroup } from "@/lib/groups/groups";
import { showError } from "@/lib/errorDialog";
import { CreateGroupModalProps } from "@/types/Group/CreateGroupModal";

// 與資料庫的 check 一致
const NAME_MAX = 50;
const DESCRIPTION_MAX = 300;

// 建立群組：填名稱與說明，成功後交給父層導到群組頁
const CreateGroupModal = (props: CreateGroupModalProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (saving) return;
    setName("");
    setDescription("");
    setNameError(undefined);
    props.onClose();
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setNameError("請輸入群組名稱");
      return;
    }
    setSaving(true);
    const result = await createGroup(name, description);
    setSaving(false);
    if (!result.success) {
      showError("建立群組失敗", result.message);
      return;
    }
    toast.success("已建立群組", { position: "top-right" });
    props.onCreated(result.data);
  };

  return (
    <Modal isOpen={props.isOpen} onOpenChange={(open) => !open && close()} className="bg-surface text-ink">
      <ModalContent>
        <ModalHeader>建立群組</ModalHeader>
        <ModalBody>
          <form
            id="create-group-form"
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <Input
              label="名稱"
              placeholder="例如：工程部共用帳號"
              variant="flat"
              labelPlacement="outside"
              size="lg"
              isRequired
              autoFocus
              maxLength={NAME_MAX}
              value={name}
              onValueChange={(value) => {
                setName(value);
                setNameError(undefined);
              }}
              isInvalid={!!nameError}
              errorMessage={nameError}
            />
            <Textarea
              label="說明"
              placeholder="這個群組用來放哪些帳號的驗證碼"
              variant="flat"
              labelPlacement="outside"
              size="lg"
              maxLength={DESCRIPTION_MAX}
              value={description}
              onValueChange={setDescription}
              description={`選填，${description.length} / ${DESCRIPTION_MAX}`}
            />
          </form>
          <p className="text-[13px] text-ink-muted">建立後你就是擁有者，可以邀請成員、設定身分組，決定誰能看到哪些驗證碼</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={close} isDisabled={saving}>
            取消
          </Button>
          <Button color="primary" type="submit" form="create-group-form" isLoading={saving}>
            建立
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CreateGroupModal;
