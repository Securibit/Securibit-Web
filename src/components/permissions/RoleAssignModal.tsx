"use client";

import { useState } from "react";
import { Button, Checkbox, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { toast } from "react-hot-toast";
import { canGrantRole, canManageRole, sortRoles } from "@/lib/permissions/hierarchy";
import { showError } from "@/lib/errorDialog";
import { cn } from "@/lib/utils";
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
    toast.success("已更新身分組", { position: "top-right" });
    props.onClose();
  };

  return (
    <>
      <ModalHeader>{props.title}</ModalHeader>
      <ModalBody>
        {roles.length === 0 ? (
          <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">還沒有任何身分組</div>
        ) : (
          <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {roles.map((role) => {
              const manageable = canManageRole(props.actor, role);
              // 還沒有的身分組：權限超過自己的不能加（原本就有的可以照常移除）
              const tooStrong = !props.selected.includes(role.id) && !canGrantRole(props.actorPermissions, role);
              const disabled = !manageable || tooStrong;
              return (
                <li key={role.id} className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <Checkbox
                    isSelected={checked.includes(role.id)}
                    isDisabled={disabled || saving}
                    onValueChange={(on) => toggle(role.id, on)}
                    classNames={{ base: "max-w-full", label: "min-w-0" }}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-[17px]">
                      <span
                        className={cn("h-2.5 w-2.5 shrink-0 rounded-full", !role.color && "bg-ink-muted")}
                        style={role.color ? { backgroundColor: role.color } : undefined}
                        aria-hidden
                      />
                      <span className="truncate">{role.name}</span>
                    </span>
                  </Checkbox>
                  {!manageable ? (
                    <span className="shrink-0 text-[13px] text-ink-muted">比你的身分組高</span>
                  ) : (
                    tooStrong && <span className="shrink-0 text-[13px] text-ink-muted">權限超過你</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="light" onPress={props.onClose} isDisabled={saving}>
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
  <Modal isOpen={props.isOpen} onOpenChange={(open) => !open && props.onClose()} scrollBehavior="inside" className="bg-surface text-ink">
    <ModalContent>{(onClose) => <RoleAssignForm {...props} onClose={onClose} />}</ModalContent>
  </Modal>
);

export default RoleAssignModal;
