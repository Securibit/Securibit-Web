"use client";

import { useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import TotpForm from "@/components/totp/TotpForm";
import { normalizeSecret } from "@/lib/totp/crud";
import { TotpErrors, validateTotpInput } from "@/lib/totp/validate";
import { TOTP_DEFAULTS, TotpInput } from "@/types/Totp/Totp";
import { TotpEditModalProps } from "@/types/Code/TotpEditModal";

// 編輯一筆驗證碼；由父層在要編輯時才掛上（key 為 item.id），表單初始值取自該筆
const TotpEditModal = (props: TotpEditModalProps) => {
  const { item } = props;
  const [form, setForm] = useState<TotpInput>(() => ({
    name: item.name,
    secret: item.secret,
    category: item.category,
    digits: item.digits ?? TOTP_DEFAULTS.digits,
    period: item.period ?? TOTP_DEFAULTS.period,
    algorithm: item.algorithm ?? TOTP_DEFAULTS.algorithm,
  }));
  const [errors, setErrors] = useState<TotpErrors>({});
  const [saving, setSaving] = useState(false);

  const secretChanged = normalizeSecret(form.secret) !== normalizeSecret(item.secret);
  const advancedChanged =
    (item.digits ?? TOTP_DEFAULTS.digits) !== TOTP_DEFAULTS.digits ||
    (item.period ?? TOTP_DEFAULTS.period) !== TOTP_DEFAULTS.period ||
    (item.algorithm ?? TOTP_DEFAULTS.algorithm) !== TOTP_DEFAULTS.algorithm;

  const handleSave = async () => {
    const nextErrors = validateTotpInput(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    const ok = await props.onSave(form);
    setSaving(false);
    if (ok) props.onClose();
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
        <ModalHeader className="text-black dark:text-white">編輯驗證碼</ModalHeader>
        <ModalBody>
          <form
            id="totp-edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <TotpForm
              value={form}
              onChange={(value) => {
                setForm(value);
                // 修改欄位後清掉該欄的錯誤訊息
                setErrors({});
              }}
              categories={props.categories}
              errors={errors}
              advancedOpen={advancedChanged}
            />
          </form>
          {secretChanged && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 w-4" />
              <p>更換金鑰後會產生完全不同的驗證碼，請確認新金鑰來自該服務重新綁定的設定。</p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="bordered" onPress={props.onClose} isDisabled={saving}>
            取消
          </Button>
          <Button color="primary" type="submit" form="totp-edit-form" isLoading={saving}>
            儲存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default TotpEditModal;
