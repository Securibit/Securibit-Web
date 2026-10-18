"use client";

import { useState } from "react";
import { Accordion, AccordionItem, Autocomplete, AutocompleteItem, Input, Select, SelectItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import {
  TOTP_ALGORITHMS,
  TOTP_DEFAULTS,
  TOTP_DIGITS,
  TOTP_PERIODS,
  TotpAlgorithm,
} from "@/types/Totp/Totp";
import { TotpFormProps } from "@/types/Totp/TotpForm";

// 新增頁與編輯對話框共用的 TOTP 欄位
const TotpForm = (props: TotpFormProps) => {
  const { value, errors = {} } = props;
  const [showSecret, setShowSecret] = useState(false);

  const set = (patch: Partial<typeof value>) => props.onChange({ ...value, ...patch });

  const digits = value.digits ?? TOTP_DEFAULTS.digits;
  const period = value.period ?? TOTP_DEFAULTS.period;
  const algorithm = value.algorithm ?? TOTP_DEFAULTS.algorithm;

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="名稱"
        placeholder="例如：Google - me@example.com"
        isRequired
        value={value.name}
        onValueChange={(name) => set({ name })}
        isInvalid={!!errors.name}
        errorMessage={errors.name}
      />

      <Autocomplete
        label="類別"
        placeholder="例如：工作、個人、遊戲"
        allowsCustomValue
        inputValue={value.category}
        onInputChange={(category) => set({ category })}
        defaultItems={props.categories.map((category) => ({ key: category }))}
      >
        {(item) => <AutocompleteItem key={item.key}>{item.key}</AutocompleteItem>}
      </Autocomplete>

      <Input
        label="金鑰（Secret）"
        placeholder="JBSWY3DPEHPK3PXP"
        isRequired
        type={showSecret ? "text" : "password"}
        autoComplete="off"
        spellCheck="false"
        value={value.secret}
        onValueChange={(secret) => set({ secret })}
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

      <Accordion
        variant="bordered"
        defaultExpandedKeys={props.advancedOpen ? ["advanced"] : []}
      >
        <AccordionItem
          key="advanced"
          title="進階設定"
          subtitle={`${digits} 位數 · ${period} 秒 · ${algorithm}`}
        >
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
    </div>
  );
};

export default TotpForm;
