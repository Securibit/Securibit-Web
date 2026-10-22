"use client";

import { useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { CategoryOrderModalProps } from "@/types/Group/CategoryOrderModal";

// 上下移按鈕，同 GroupCodeCard
const moveButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-full bg-surface-1 text-ink-muted transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-muted";

// 調整類別篩選的順序：在對話框裡用箭頭排好，按儲存才送出，取消就不算數
const CategoryOrderModal = (props: CategoryOrderModalProps) => {
  const [list, setList] = useState(props.categories);
  const [saving, setSaving] = useState(false);

  const changed = list.some((name, index) => name !== props.categories[index]);

  const move = (index: number, offset: -1 | 1) => {
    const next = [...list];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setList(next);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await props.onSave(list);
    setSaving(false);
    if (ok) props.onClose();
  };

  return (
    <Modal isOpen onOpenChange={(open) => !open && !saving && props.onClose()} scrollBehavior="inside" className="bg-surface text-ink">
      <ModalContent>
        <ModalHeader>調整類別順序</ModalHeader>
        <ModalBody>
          <p className="text-[15px] text-ink-muted">用箭頭調整類別篩選的順序；順序對所有成員都一樣，之後新增的類別會照字母排在後面</p>
          <ul role="list" className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {list.map((name, index) => (
              <li key={name} className="flex items-center gap-4 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[17px]">{name}</span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || saving}
                    aria-label={`把 ${name} 往上移`}
                    className={moveButtonClass}
                  >
                    <FontAwesomeIcon icon={faChevronUp} className="w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === list.length - 1 || saving}
                    aria-label={`把 ${name} 往下移`}
                    className={moveButtonClass}
                  >
                    <FontAwesomeIcon icon={faChevronDown} className="w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={props.onClose} isDisabled={saving}>
            取消
          </Button>
          <Button color="primary" onPress={handleSave} isLoading={saving} isDisabled={!changed}>
            儲存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CategoryOrderModal;
