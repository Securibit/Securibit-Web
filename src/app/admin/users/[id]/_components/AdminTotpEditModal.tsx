"use client";

import { useState } from "react";
import {
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
import { TOTP_ALGORITHMS, TOTP_DIGITS, TOTP_PERIODS, TotpAlgorithm, TotpInput } from "@/types/Totp/Totp";
import { AdminTotpEditModalProps } from "@/types/Admin/AdminTotpEditModal";

/*
 * 管理員編輯使用者的一筆 2FA。
 * 欄位同 TotpForm，但使用者啟用個人加密時金鑰欄位要停用（TotpForm 沒有這個選項，所以這裡自己排）。
 * 只送出有變動的欄位。
 */
const AdminTotpEditModal = (props: AdminTotpEditModalProps) => {
  const { item, secretLocked } = props;
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [secret, setSecret] = useState(item.secret ?? "");
  const [digits, setDigits] = useState(item.digits);
  const [period, setPeriod] = useState(item.period);
  const [algorithm, setAlgorithm] = useState<TotpAlgorithm>(item.algorithm);
  const [showSecret, setShowSecret] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; secret?: string }>({});
  const [saving, setSaving] = useState(false);

  const secretChanged = !secretLocked && normalizeSecret(secret) !== normalizeSecret(item.secret ?? "");

  const handleSave = async () => {
    const nextErrors: typeof errors = {};
    if (!name.trim()) nextErrors.name = "請輸入名稱";
    if (secretChanged) {
      if (!normalizeSecret(secret)) nextErrors.secret = "請輸入金鑰";
      else if (!isValidSecret(secret)) nextErrors.secret = "金鑰格式錯誤，只能包含 A-Z 與 2-7（Base32）";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const patch: Partial<TotpInput> = {};
    if (name.trim() !== item.name) patch.name = name;
    if (category.trim() !== item.category) patch.category = category;
    if (secretChanged) patch.secret = secret;
    if (digits !== item.digits) patch.digits = digits;
    if (period !== item.period) patch.period = period;
    if (algorithm !== item.algorithm) patch.algorithm = algorithm;
    if (Object.keys(patch).length === 0) {
      props.onClose();
      return;
    }

    setSaving(true);
    const ok = await props.onSave(patch);
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
            id="admin-totp-edit-form"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <Input
              label="名稱"
              isRequired
              value={name}
              onValueChange={(value) => {
                setName(value);
                setErrors({});
              }}
              isInvalid={!!errors.name}
              errorMessage={errors.name}
            />

            <Autocomplete
              label="類別"
              allowsCustomValue
              inputValue={category}
              onInputChange={setCategory}
              defaultItems={props.categories.map((value) => ({ key: value }))}
            >
              {(option) => <AutocompleteItem key={option.key}>{option.key}</AutocompleteItem>}
            </Autocomplete>

            {secretLocked ? (
              <Input
                label="金鑰（Secret）"
                isDisabled
                value=""
                placeholder="已加密，無法修改"
                description="此使用者啟用了個人加密，管理員不能查看或修改金鑰"
              />
            ) : (
              <Input
                label="金鑰（Secret）"
                isRequired
                type={showSecret ? "text" : "password"}
                autoComplete="off"
                spellCheck="false"
                value={secret}
                onValueChange={(value) => {
                  setSecret(value);
                  setErrors({});
                }}
                isInvalid={!!errors.secret}
                errorMessage={errors.secret}
                description="Base32 格式（A-Z、2-7），空白與小寫會自動轉換"
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
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="位數"
                selectedKeys={[String(digits)]}
                disallowEmptySelection
                onChange={(e) => e.target.value && setDigits(Number(e.target.value))}
              >
                {TOTP_DIGITS.map((d) => <SelectItem key={String(d)}>{`${d} 位數`}</SelectItem>)}
              </Select>
              <Select
                label="週期"
                selectedKeys={[String(period)]}
                disallowEmptySelection
                onChange={(e) => e.target.value && setPeriod(Number(e.target.value))}
              >
                {TOTP_PERIODS.map((p) => <SelectItem key={String(p)}>{`${p} 秒`}</SelectItem>)}
              </Select>
              <Select
                label="演算法"
                selectedKeys={[algorithm]}
                disallowEmptySelection
                onChange={(e) => e.target.value && setAlgorithm(e.target.value as TotpAlgorithm)}
              >
                {TOTP_ALGORITHMS.map((a) => <SelectItem key={a}>{a}</SelectItem>)}
              </Select>
            </div>
          </form>
          {secretChanged && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 w-4" />
              <p>更換金鑰後會產生完全不同的驗證碼，使用者原本綁定的服務可能就無法登入。</p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="bordered" onPress={props.onClose} isDisabled={saving}>
            取消
          </Button>
          <Button color="primary" type="submit" form="admin-totp-edit-form" isLoading={saving}>
            儲存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default AdminTotpEditModal;
