"use client";

import { useState } from "react";
import { Button, Divider, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
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
    <Modal
      isOpen
      onOpenChange={(open) => !open && props.onClose()}
      size="lg"
      scrollBehavior="inside"
      className="dark:bg-gray-blue-800"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 text-black dark:text-white">
          新增驗證碼到群組
          <span className="text-sm font-normal text-gray-blue-500 dark:text-gray-blue-400">
            新增後群組成員會依身分組權限看到這筆驗證碼
          </span>
        </ModalHeader>
        <ModalBody className="text-black dark:text-white">
          <h3 className="font-semibold">快速匯入</h3>
          <QrImport
            onImport={(input) => {
              setForm({ ...input, category: form.category || input.category });
              setErrors({});
              setFormKey((key) => key + 1);
            }}
            onImportMany={props.onImportMany}
          />

          <div className="my-2 flex items-center gap-3 text-sm text-gray-blue-400">
            <Divider className="flex-1" />
            或手動輸入
            <Divider className="flex-1" />
          </div>

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
        </ModalBody>
        <ModalFooter>
          <Button variant="bordered" onPress={props.onClose} isDisabled={saving}>
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
