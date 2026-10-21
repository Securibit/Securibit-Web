"use client";

import { useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import TotpForm from "@/components/totp/TotpForm";
import QrImport from "@/app/addCode/_components/QrImport";
import { TotpErrors, validateTotpInput } from "@/lib/totp/validate";
import { TOTP_DEFAULTS, TotpInput } from "@/types/Totp/Totp";
import { AddGroupCodeModalProps } from "@/types/Group/AddGroupCodeModal";

const EMPTY_FORM: TotpInput = { name: "", secret: "", category: "", ...TOTP_DEFAULTS };

const isDefaultAdvanced = (input: TotpInput) =>
  input.digits === TOTP_DEFAULTS.digits &&
  input.period === TOTP_DEFAULTS.period &&
  input.algorithm === TOTP_DEFAULTS.algorithm;

// 新增群組驗證碼：QR Code / 連結 / 備份檔匯入或手動輸入；一次多筆時交給父層的整批匯入
const AddGroupCodeModal = (props: AddGroupCodeModalProps) => {
  const [form, setForm] = useState<TotpInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<TotpErrors>({});
  const [saving, setSaving] = useState(false);
  // 匯入或新增後換 key 讓表單重新掛上，進階設定才會依匯入值決定是否展開
  const [formKey, setFormKey] = useState(0);

  const handleAdd = async () => {
    const nextErrors = validateTotpInput(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    const ok = await props.onAdd([form]);
    setSaving(false);
    if (ok) {
      // 清空表單、類別保留，方便連續新增同類
      setForm({ ...EMPTY_FORM, category: form.category });
      setFormKey((key) => key + 1);
    }
  };

  return (
    <Modal isOpen onOpenChange={(open) => !open && props.onClose()} size="lg" scrollBehavior="inside" className="bg-surface text-ink">
      <ModalContent>
        <ModalHeader>新增驗證碼</ModalHeader>
        <ModalBody className="gap-5">
          <p className="text-[13px] text-ink-muted">新增後群組成員會依身分組權限看到這筆驗證碼</p>

          <section>
            <h3 className="mb-2 text-[13px] font-normal text-ink-muted">匯入</h3>
            <QrImport
              onImport={(input) => {
                setForm({ ...input, category: form.category || input.category });
                setErrors({});
                setFormKey((key) => key + 1);
              }}
              onImportMany={props.onImportMany}
            />
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-normal text-ink-muted">或手動輸入</h3>
            <form
              id="group-code-add-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
              }}
            >
              <TotpForm
                key={formKey}
                value={form}
                onChange={(value) => {
                  setForm(value);
                  setErrors({});
                }}
                categories={props.categories}
                errors={errors}
                advancedOpen={!isDefaultAdvanced(form)}
              />
            </form>
          </section>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={props.onClose} isDisabled={saving}>
            完成
          </Button>
          <Button color="primary" type="submit" form="group-code-add-form" isLoading={saving}>
            新增
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default AddGroupCodeModal;
