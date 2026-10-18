"use client";

import { useState } from "react";
import { Button, Checkbox, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { toast } from "react-hot-toast";
import { canManageRole, sortRoles } from "@/lib/permissions/hierarchy";
import { showError } from "@/lib/errorDialog";
import { ROLE_FALLBACK_COLOR } from "@/components/permissions/RoleChip";
import { RoleAssignModalProps } from "@/types/Permission/RoleAssignModal";

// 勾選清單本體：ModalContent 每次開啟才掛上，所以勾選狀態會從 selected 重新開始
const RoleAssignForm = (props: RoleAssignModalProps & { onClose: () => void }) => {
  const [checked, setChecked] = useState<string[]>(() => props.selected);
  const [saving, setSaving] = useState(false);

  // @everyone 每個人本來就有，不能指派
  const roles = sortRoles(props.roles).filter((role) => !role.is_default);

  const toggle = (id: string, on: boolean) =>
    setChecked((old) => (on ? [...old, id] : old.filter((item) => item !== id)));

  const handleSave = async () => {
    setSaving(true);
    // 管不到的身分組勾選框是鎖住的，原本有的會留在 checked 裡一起送出
    const result = await props.onSave(checked);
    setSaving(false);
    if (!result.success) {
      showError("指派身分組失敗", result.message);
      return;
    }
    toast.success("已更新身分組！", { position: "top-right" });
    props.onClose();
  };

  return (
    <>
      <ModalHeader className="text-black dark:text-white">{props.title}</ModalHeader>
      <ModalBody className="text-black dark:text-white">
        {roles.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-blue-500 dark:text-gray-blue-400">
            還沒有任何身分組
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {roles.map((role) => {
              const manageable = canManageRole(props.actor, role);
              return (
                <li key={role.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-blue-100 dark:hover:bg-gray-blue-700/50">
                  <Checkbox
                    isSelected={checked.includes(role.id)}
                    isDisabled={!manageable || saving}
                    onValueChange={(on) => toggle(role.id, on)}
                    classNames={{ base: "max-w-full", label: "min-w-0" }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: role.color || ROLE_FALLBACK_COLOR }}
                      />
                      <span className="truncate">{role.name}</span>
                    </span>
                  </Checkbox>
                  {!manageable && (
                    <span className="ml-auto flex-shrink-0 text-xs text-gray-blue-500 dark:text-gray-blue-400">
                      比你的身分組高
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="bordered" onPress={props.onClose} isDisabled={saving}>
          取消
        </Button>
        <Button color="primary" onPress={handleSave} isLoading={saving}>
          儲存
        </Button>
      </ModalFooter>
    </>
  );
};

// 指派身分組：列出 @everyone 以外的身分組（由高到低），送出完整的新清單
const RoleAssignModal = (props: RoleAssignModalProps) => (
  <Modal
    isOpen={props.isOpen}
    onOpenChange={(open) => !open && props.onClose()}
    scrollBehavior="inside"
    className="dark:bg-gray-blue-800"
  >
    <ModalContent>{(onClose) => <RoleAssignForm {...props} onClose={onClose} />}</ModalContent>
  </Modal>
);

export default RoleAssignModal;
