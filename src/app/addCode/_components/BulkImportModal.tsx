"use client";

import { useMemo, useState } from "react";
import { Autocomplete, AutocompleteItem, Button, Checkbox, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
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
      className="border border-line bg-surface-1 text-ink"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 border-b border-line font-display tracking-wide">
          <span className="tech-label">IMPORT // BATCH</span>
          <span>
            匯入 <span className="font-mono">{items.length}</span> 筆驗證碼
          </span>
          {batch && (
            <span className="text-sm font-normal tracking-normal text-ink-muted">
              這是第 <span className="font-mono">{batch.index} / {batch.size}</span> 張匯出 QR Code
              {batch.index < batch.size && "，匯入後請繼續掃描下一張"}
            </span>
          )}
        </ModalHeader>
        <ModalBody className="py-5">
          <ul className="border-t border-line">
            {items.map((item, index) => (
              <li key={index} className="flex items-center gap-2 border-b border-line py-2 transition-colors hover:bg-ink/5">
                <Checkbox
                  isSelected={selected[index]}
                  onValueChange={(value) => setSelected(selected.map((old, i) => (i === index ? value : old)))}
                  classNames={{ label: "min-w-0" }}
                >
                  <span className="block truncate font-display font-medium">{item.name}</span>
                  {describe(index) && (
                    <span className="block font-mono text-[11px] tracking-[0.08em] text-ink-dim">{describe(index)}</span>
                  )}
                </Checkbox>
                {duplicates[index] && (
                  <span className="tech-label ml-auto flex-shrink-0 border border-alarm/60 px-1.5 py-0.5 text-alarm">
                    已存在
                  </span>
                )}
              </li>
            ))}
          </ul>

          <Autocomplete
            label="類別（套用到勾選的全部，可留空）"
            variant="bordered"
            allowsCustomValue
            inputValue={category}
            onInputChange={setCategory}
            defaultItems={props.categories.map((name) => ({ key: name }))}
          >
            {(option) => <AutocompleteItem key={option.key}>{option.key}</AutocompleteItem>}
          </Autocomplete>

          {errors.length > 0 && (
            <div className="border border-alarm/50 bg-alarm/10 p-3 text-sm text-ink">
              <p className="flex items-center gap-2 font-display font-semibold">
                <span className="led led-alarm" aria-hidden />
                以下內容無法匯入：
              </p>
              <ul className="mt-1 list-disc pl-5 font-mono text-xs text-ink-muted">
                {errors.map((error, index) => (
                  <li key={index} className="break-all">{error}</li>
                ))}
              </ul>
            </div>
          )}
        </ModalBody>
        <ModalFooter className="border-t border-line">
          <Button variant="bordered" onPress={props.onClose} isDisabled={saving}>
            取消
          </Button>
          <Button color="primary" onPress={handleConfirm} isLoading={saving} isDisabled={count === 0}>
            匯入 <span className="font-mono">{count}</span> 筆
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default BulkImportModal;
