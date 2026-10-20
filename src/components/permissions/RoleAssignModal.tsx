"use client";

import { useState } from "react";
import { Button, Checkbox, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { toast } from "react-hot-toast";
import { canManageRole, sortRoles } from "@/lib/permissions/hierarchy";
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
    toast.success("已更新身分組！", { position: "top-right" });
    props.onClose();
  };

  return (
    <>
      <ModalHeader className="border-b border-line font-display tracking-wide">{props.title}</ModalHeader>
      <ModalBody className="py-4">
        {roles.length === 0 ? (
          <div className="hatch border border-line p-8 text-center">
            <p className="tech-label">NO DATA</p>
            <p className="mt-2 text-sm text-ink-muted">還沒有任何身分組</p>
          </div>
        ) : (
          <ul className="border-t border-line">
            {roles.map((role) => {
              const manageable = canManageRole(props.actor, role);
              return (
                <li
                  key={role.id}
                  className="flex items-center gap-2 border-b border-line px-1 py-2 transition-colors hover:bg-ink/5"
                >
                  <Checkbox
                    isSelected={checked.includes(role.id)}
                    isDisabled={!manageable || saving}
                    onValueChange={(on) => toggle(role.id, on)}
                    classNames={{ base: "max-w-full", label: "min-w-0" }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn("h-2.5 w-2.5 flex-shrink-0", !role.color && "bg-ink-dim")}
                        style={role.color ? { backgroundColor: role.color } : undefined}
                        aria-hidden
                      />
                      <span className="truncate font-display text-sm">{role.name}</span>
                    </span>
                  </Checkbox>
                  {!manageable && (
                    <span className="ml-auto flex-shrink-0 font-mono text-[11px] tracking-[0.08em] text-ink-dim">
                      比你的身分組高
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ModalBody>
      <ModalFooter className="border-t border-line">
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
    className="border border-line bg-surface-1 text-ink"
  >
    <ModalContent>{(onClose) => <RoleAssignForm {...props} onClose={onClose} />}</ModalContent>
  </Modal>
);

export default RoleAssignModal;
