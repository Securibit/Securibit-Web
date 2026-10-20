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
import { faChevronDown, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
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
  // 進階設定：有改過預設值才預設展開
  const [advancedOpen, setAdvancedOpen] = useState(advancedChanged);

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
    <Modal isOpen onOpenChange={(open) => !open && props.onClose()} size="lg" scrollBehavior="inside" className="bg-surface text-ink">
      <ModalContent>
        <ModalHeader>編輯驗證碼</ModalHeader>
        <ModalBody>
          <form
            id="group-code-edit-form"
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <Input
              label="名稱"
              placeholder="例如：Google - me@example.com"
              variant="flat"
              labelPlacement="outside"
              size="lg"
              isRequired
              value={form.name}
              onValueChange={(name) => set({ name })}
              isInvalid={!!errors.name}
              errorMessage={errors.name}
            />

            <Autocomplete
              label="類別"
              placeholder="例如：工作、個人、遊戲"
              variant="flat"
              labelPlacement="outside"
              size="lg"
              allowsCustomValue
              inputValue={form.category}
              onInputChange={(category) => set({ category })}
              defaultItems={props.categories.map((category) => ({ key: category }))}
            >
              {(item) => <AutocompleteItem key={item.key}>{item.key}</AutocompleteItem>}
            </Autocomplete>

            <Input
              label="金鑰"
              placeholder={secretKnown ? "JBSWY3DPEHPK3PXP" : "不修改請留空"}
              variant="flat"
              labelPlacement="outside"
              size="lg"
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
                  className="text-ink-muted transition-colors hover:text-ink"
                >
                  <FontAwesomeIcon icon={showSecret ? faEyeSlash : faEye} className="w-4" />
                </button>
              }
            />

            {/* 進階設定：點一列展開 */}
            <div className="overflow-hidden rounded-[12px] bg-surface-1">
              <button
                type="button"
                onClick={() => setAdvancedOpen((open) => !open)}
                aria-expanded={advancedOpen}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
              >
                <span className="text-[17px]">進階設定</span>
                <span className="flex items-center gap-2 text-[15px] text-ink-muted tabular-nums">
                  {digits} 位數 · {period} 秒 · {algorithm}
                  <FontAwesomeIcon icon={faChevronDown} className={cn("w-3 transition-transform", advancedOpen && "rotate-180")} />
                </span>
              </button>
              {advancedOpen && (
                <div className="border-t border-line/60 px-4 py-4">
                  <p className="mb-3 text-[13px] text-ink-muted">大多數服務使用預設值（6 位數、30 秒、SHA-1），除非服務另有說明否則不需更改</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Select
                      label="位數"
                      variant="flat"
                      labelPlacement="outside"
                      selectedKeys={[String(digits)]}
                      disallowEmptySelection
                      onChange={(e) => e.target.value && set({ digits: Number(e.target.value) })}
                    >
                      {TOTP_DIGITS.map((d) => <SelectItem key={String(d)}>{`${d} 位數`}</SelectItem>)}
                    </Select>
                    <Select
                      label="週期"
                      variant="flat"
                      labelPlacement="outside"
                      selectedKeys={[String(period)]}
                      disallowEmptySelection
                      onChange={(e) => e.target.value && set({ period: Number(e.target.value) })}
                    >
                      {TOTP_PERIODS.map((p) => <SelectItem key={String(p)}>{`${p} 秒`}</SelectItem>)}
                    </Select>
                    <Select
                      label="演算法"
                      variant="flat"
                      labelPlacement="outside"
                      selectedKeys={[algorithm]}
                      disallowEmptySelection
                      onChange={(e) => e.target.value && set({ algorithm: e.target.value as TotpAlgorithm })}
                    >
                      {TOTP_ALGORITHMS.map((a) => <SelectItem key={a}>{a}</SelectItem>)}
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </form>
          {secretChanged && (
            <p className="rounded-[12px] bg-surface-1 px-4 py-3 text-[15px] text-alarm">
              更換金鑰後會產生完全不同的驗證碼，群組裡所有成員看到的驗證碼都會跟著改變
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={props.onClose} isDisabled={saving}>
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
