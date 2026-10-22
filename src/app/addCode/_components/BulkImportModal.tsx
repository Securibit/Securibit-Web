"use client";

import { useMemo, useState } from "react";
import { Button, Checkbox, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { normalizeSecret } from "@/lib/totp/crud";
import { TOTP_DEFAULTS } from "@/types/Totp/Totp";
import { BulkImportModalProps } from "@/types/AddCode/BulkImportModal";
import { formatCategories, normalizeCategories } from "@/lib/totp/categories";
import CategoryInput from "@/components/totp/CategoryInput";

// 一次匯入多筆：列出解析到的驗證碼，可以取消勾選、統一指定類別（可多個）
const BulkImportModal = (props: BulkImportModalProps) => {
  const { items, errors, batch } = props.result;

  // 金鑰和群組既有的重複標「已存在」，和清單裡前面的重複標「和第 N 筆相同」，都預設不勾
  // （分開標，不然清單裡自己重複的，例如 Google Authenticator 存了兩次，看起來像群組裡已經有）
  const duplicates = useMemo(() => {
    const have = new Set(props.existing.map((item) => normalizeSecret(item.secret)));
    const first = new Map<string, number>();
    return items.map((item, index): string | null => {
      const secret = normalizeSecret(item.secret);
      if (have.has(secret)) return "已存在";
      const earlier = first.get(secret);
      if (earlier === undefined) {
        first.set(secret, index);
        return null;
      }
      return `和第 ${earlier + 1} 筆相同`;
    });
  }, [items, props.existing]);

  const [selected, setSelected] = useState(() => duplicates.map((duplicate) => duplicate === null));
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const count = selected.filter(Boolean).length;

  const handleConfirm = async () => {
    setSaving(true);
    const inputs = items
      .filter((_, index) => selected[index])
      .map((item) => ({ ...item, category: normalizeCategories(category) || item.category }));
    const ok = await props.onConfirm(inputs);
    setSaving(false);
    if (ok) props.onClose();
  };

  const describe = (index: number) => {
    const item = items[index];
    const parts = [];
    if (item.category) parts.push(formatCategories(item.category));
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
      className="bg-surface text-ink"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span>匯入 <span className="tabular-nums">{items.length}</span> 筆驗證碼</span>
          {batch && (
            <span className="text-[13px] font-normal text-ink-muted">
              這是第 <span className="tabular-nums">{batch.index} / {batch.size}</span> 張匯出 QR Code
              {batch.index < batch.size && "，匯入後請繼續掃描下一張"}
            </span>
          )}
        </ModalHeader>
        <ModalBody className="gap-5">
          <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {items.map((item, index) => (
              <li key={index} className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  isSelected={selected[index]}
                  onValueChange={(value) => setSelected(selected.map((old, i) => (i === index ? value : old)))}
                  classNames={{ base: "min-w-0 max-w-full", label: "min-w-0" }}
                >
                  <span className="block truncate text-[17px]">{item.name}</span>
                  {describe(index) && <span className="block truncate text-[13px] text-ink-muted">{describe(index)}</span>}
                </Checkbox>
                {duplicates[index] && (
                  <span className="ml-auto shrink-0 rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-alarm">{duplicates[index]}</span>
                )}
              </li>
            ))}
          </ul>

          <div>
            <CategoryInput
              value={category}
              onChange={setCategory}
              suggestions={props.categories}
              placeholder="套用到勾選的全部，可留空"
              description="可選多個，會取代各筆原本的類別"
            />
          </div>

          {errors.length > 0 && (
            <div className="text-[13px]">
              <p className="text-alarm">以下內容無法匯入</p>
              <ul className="mt-1 list-disc pl-5 text-ink-muted">
                {errors.map((error, index) => (
                  <li key={index} className="break-all">{error}</li>
                ))}
              </ul>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={props.onClose} isDisabled={saving}>
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
