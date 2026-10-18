"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionItem,
  Autocomplete,
  AutocompleteItem,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { isValidSecret, normalizeSecret } from "@/lib/totp/crud";
import { TotpErrors } from "@/lib/totp/validate";
import { TOTP_ALGORITHMS, TOTP_DEFAULTS, TOTP_DIGITS, TOTP_PERIODS, TotpAlgorithm, TotpInput } from "@/types/Totp/Totp";
import { GroupCodeEditModalProps } from "@/types/Group/GroupCodeEditModal";

/*
 * 編輯群組的一筆驗證碼。欄位同 TotpForm，但沒有「查看金鑰」時拿不到原本的金鑰：
 * 金鑰欄位留空、留空代表不修改（TotpForm 的金鑰是必填，所以這裡自己排欄位）。
 */
const GroupCodeEditModal = (props: GroupCodeEditModalProps) => {
  const { account } = props;
  const secretKnown = props.secret !== undefined;
  const [form, setForm] = useState<TotpInput>(() => ({
    name: account.name,
    secret: props.secret ?? "",
    category: account.category,
    digits: account.digits ?? TOTP_DEFAULTS.digits,
    period: account.period ?? TOTP_DEFAULTS.period,
    algorithm: account.algorithm ?? TOTP_DEFAULTS.algorithm,
  }));
  const [errors, setErrors] = useState<TotpErrors>({});
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const set = (patch: Partial<TotpInput>) => {
    setForm({ ...form, ...patch });
    setErrors({});
  };

  const newSecret = normalizeSecret(form.secret);
  const secretChanged = !!newSecret && newSecret !== normalizeSecret(props.secret ?? "");
  const advancedChanged =
    (account.digits ?? TOTP_DEFAULTS.digits) !== TOTP_DEFAULTS.digits ||
    (account.period ?? TOTP_DEFAULTS.period) !== TOTP_DEFAULTS.period ||
    (account.algorithm ?? TOTP_DEFAULTS.algorithm) !== TOTP_DEFAULTS.algorithm;

  const validate = () => {
    const next: TotpErrors = {};
    if (!form.name.trim()) next.name = "請輸入名稱";
    if (!newSecret) {
      // 看得到金鑰時清空等於刪掉金鑰，不允許；看不到時留空代表不修改
      if (secretKnown) next.secret = "請輸入金鑰";
    } else if (!isValidSecret(form.secret)) {
      next.secret = "金鑰格式錯誤，只能包含 A-Z 與 2-7（Base32）";
    }
    return next;
  };

  const handleSave = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // 金鑰沒有改就不送，避免沒有「查看金鑰」的人誤把金鑰清掉
    const patch: Partial<TotpInput> = {
      name: form.name,
      category: form.category,
      digits: form.digits,
      period: form.period,
      algorithm: form.algorithm,
    };
    if (secretChanged) patch.secret = form.secret;

    setSaving(true);
    const ok = await props.onSave(patch);
    setSaving(false);
    if (ok) props.onClose();
  };

  const digits = form.digits ?? TOTP_DEFAULTS.digits;
  const period = form.period ?? TOTP_DEFAULTS.period;
  const algorithm = form.algorithm ?? TOTP_DEFAULTS.algorithm;

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
            id="group-code-edit-form"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <Input
              label="名稱"
              placeholder="例如：Google - me@example.com"
              isRequired
              value={form.name}
              onValueChange={(name) => set({ name })}
              isInvalid={!!errors.name}
              errorMessage={errors.name}
            />

            <Autocomplete
              label="類別"
              placeholder="例如：工作、個人、遊戲"
              allowsCustomValue
              inputValue={form.category}
              onInputChange={(category) => set({ category })}
              defaultItems={props.categories.map((category) => ({ key: category }))}
            >
              {(item) => <AutocompleteItem key={item.key}>{item.key}</AutocompleteItem>}
            </Autocomplete>

            <Input
              label="金鑰（Secret）"
              placeholder={secretKnown ? "JBSWY3DPEHPK3PXP" : "不修改請留空"}
              isRequired={secretKnown}
              type={showSecret ? "text" : "password"}
              autoComplete="off"
              spellCheck="false"
              value={form.secret}
              onValueChange={(secret) => set({ secret })}
              isInvalid={!!errors.secret}
              errorMessage={errors.secret}
              description={
                secretKnown
                  ? "Base32 格式（A-Z、2-7），空白與小寫會自動轉換"
                  : "你沒有「查看金鑰」權限，看不到目前的金鑰；要更換才需要填寫"
              }
              endContent={
                <button
                  type="button"
                  onClick={() => setShowSecret((prev) => !prev)}
                  aria-label={showSecret ? "隱藏金鑰" : "顯示金鑰"}
                  className="text-gray-blue-400 hover:text-tpp"
                >
                  <FontAwesomeIcon icon={showSecret ? faEyeSlash : faEye} className="w-4" />
                </button>
              }
            />

            <Accordion variant="bordered" defaultExpandedKeys={advancedChanged ? ["advanced"] : []}>
              <AccordionItem key="advanced" title="進階設定" subtitle={`${digits} 位數 · ${period} 秒 · ${algorithm}`}>
                <p className="mb-3 text-sm text-gray-blue-500 dark:text-gray-blue-400">
                  大多數服務使用預設值（6 位數、30 秒、SHA-1），除非服務另有說明否則不需更改。
                </p>
                <div className="grid gap-3 pb-2 sm:grid-cols-3">
                  <Select
                    label="位數"
                    selectedKeys={[String(digits)]}
                    disallowEmptySelection
                    onChange={(e) => e.target.value && set({ digits: Number(e.target.value) })}
                  >
                    {TOTP_DIGITS.map((d) => <SelectItem key={String(d)}>{`${d} 位數`}</SelectItem>)}
                  </Select>
                  <Select
                    label="週期"
                    selectedKeys={[String(period)]}
                    disallowEmptySelection
                    onChange={(e) => e.target.value && set({ period: Number(e.target.value) })}
                  >
                    {TOTP_PERIODS.map((p) => <SelectItem key={String(p)}>{`${p} 秒`}</SelectItem>)}
                  </Select>
                  <Select
                    label="演算法"
                    selectedKeys={[algorithm]}
                    disallowEmptySelection
                    onChange={(e) => e.target.value && set({ algorithm: e.target.value as TotpAlgorithm })}
                  >
                    {TOTP_ALGORITHMS.map((a) => <SelectItem key={a}>{a}</SelectItem>)}
                  </Select>
                </div>
              </AccordionItem>
            </Accordion>
          </form>
          {secretChanged && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 w-4" />
              <p>更換金鑰後會產生完全不同的驗證碼，群組裡所有成員看到的驗證碼都會跟著改變。</p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="bordered" onPress={props.onClose} isDisabled={saving}>
            取消
          </Button>
          <Button color="primary" type="submit" form="group-code-edit-form" isLoading={saving}>
            儲存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default GroupCodeEditModal;
