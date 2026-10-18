"use client";

import { useMemo, useState } from "react";
import { Autocomplete, AutocompleteItem, Button, Checkbox, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { normalizeSecret } from "@/lib/totp/crud";
import { TOTP_DEFAULTS } from "@/types/Totp/Totp";
import { BulkImportModalProps } from "@/types/AddCode/BulkImportModal";

// 一次匯入多筆：列出解析到的驗證碼，可以取消勾選、統一指定類別
const BulkImportModal = (props: BulkImportModalProps) => {
  const { items, errors, batch } = props.result;

  // 金鑰和既有的、或和清單裡前面的重複，預設不勾
  const duplicates = useMemo(() => {
    const seen = new Set(props.existing.map((item) => normalizeSecret(item.secret)));
    return items.map((item) => {
      const secret = normalizeSecret(item.secret);
      const duplicate = seen.has(secret);
      seen.add(secret);
      return duplicate;
    });
  }, [items, props.existing]);

  const [selected, setSelected] = useState(() => duplicates.map((duplicate) => !duplicate));
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const count = selected.filter(Boolean).length;

  const handleConfirm = async () => {
    setSaving(true);
    const inputs = items
      .filter((_, index) => selected[index])
      .map((item) => ({ ...item, category: category.trim() || item.category }));
    const ok = await props.onConfirm(inputs);
    setSaving(false);
    if (ok) props.onClose();
  };

  const describe = (index: number) => {
    const item = items[index];
    const parts = [];
    if (item.category) parts.push(item.category);
    if (item.digits !== TOTP_DEFAULTS.digits) parts.push(`${item.digits} 位數`);
    if (item.period !== TOTP_DEFAULTS.period) parts.push(`${item.period} 秒`);
    if (item.algorithm !== TOTP_DEFAULTS.algorithm) parts.push(item.algorithm);
    return parts.join(" · ");
  };

  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && props.onClose()}
      size="lg"
      scrollBehavior="inside"
      className="dark:bg-gray-blue-800"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 text-black dark:text-white">
          匯入 {items.length} 筆驗證碼
          {batch && (
            <span className="text-sm font-normal text-gray-blue-500 dark:text-gray-blue-400">
              這是第 {batch.index} / {batch.size} 張匯出 QR Code
              {batch.index < batch.size && "，匯入後請繼續掃描下一張"}
            </span>
          )}
        </ModalHeader>
        <ModalBody className="text-black dark:text-white">
          <ul className="flex flex-col gap-2">
            {items.map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                <Checkbox
                  isSelected={selected[index]}
                  onValueChange={(value) => setSelected(selected.map((old, i) => (i === index ? value : old)))}
                  classNames={{ label: "min-w-0" }}
                >
                  <span className="block truncate">{item.name}</span>
                  {describe(index) && (
                    <span className="block text-xs text-gray-blue-500 dark:text-gray-blue-400">{describe(index)}</span>
                  )}
                </Checkbox>
                {duplicates[index] && (
                  <Chip size="sm" variant="flat" color="warning" className="ml-auto flex-shrink-0">
                    已存在
                  </Chip>
                )}
              </li>
            ))}
          </ul>

          <Autocomplete
            label="類別（套用到勾選的全部，可留空）"
            allowsCustomValue
            inputValue={category}
            onInputChange={setCategory}
            defaultItems={props.categories.map((name) => ({ key: name }))}
          >
            {(option) => <AutocompleteItem key={option.key}>{option.key}</AutocompleteItem>}
          </Autocomplete>

          {errors.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <p className="font-semibold">以下內容無法匯入：</p>
              <ul className="list-disc pl-5">
                {errors.map((error, index) => (
                  <li key={index} className="break-all">{error}</li>
                ))}
              </ul>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="bordered" onPress={props.onClose} isDisabled={saving}>
            取消
          </Button>
          <Button color="primary" onPress={handleConfirm} isLoading={saving} isDisabled={count === 0}>
            匯入 {count} 筆
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default BulkImportModal;
