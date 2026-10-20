"use client";

import { useState } from "react";
import { Input, Select, SelectItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import {
  TOTP_ALGORITHMS,
  TOTP_DEFAULTS,
  TOTP_DIGITS,
  TOTP_PERIODS,
  TotpAlgorithm,
} from "@/types/Totp/Totp";
import { TotpFormProps } from "@/types/Totp/TotpForm";
import CategoryInput from "./CategoryInput";

// 新增頁與編輯對話框共用的 TOTP 欄位
const TotpForm = (props: TotpFormProps) => {
  const { value, errors = {} } = props;
  const [showSecret, setShowSecret] = useState(false);
  const [advanced, setAdvanced] = useState(!!props.advancedOpen);

  const set = (patch: Partial<typeof value>) => props.onChange({ ...value, ...patch });

  const digits = value.digits ?? TOTP_DEFAULTS.digits;
  const period = value.period ?? TOTP_DEFAULTS.period;
  const algorithm = value.algorithm ?? TOTP_DEFAULTS.algorithm;

  return (
    <div className="flex flex-col gap-5">
      <Input
        label="名稱"
        placeholder="例如：Google - me@example.com"
        variant="flat"
        labelPlacement="outside"
        size="lg"
        isRequired
        value={value.name}
        onValueChange={(name) => set({ name })}
        isInvalid={!!errors.name}
        errorMessage={errors.name}
      />

      <CategoryInput
        value={value.category}
        onChange={(category) => set({ category })}
        suggestions={props.categories}
      />

      <Input
        label="金鑰"
        placeholder="JBSWY3DPEHPK3PXP"
        variant="flat"
        labelPlacement="outside"
        size="lg"
        isRequired
        type={showSecret ? "text" : "password"}
        autoComplete="off"
        spellCheck="false"
        value={value.secret}
        onValueChange={(secret) => set({ secret })}
        isInvalid={!!errors.secret}
        errorMessage={errors.secret}
        description="Base32 格式（A–Z、2–7），空白與小寫會自動轉換"
        classNames={{ description: "text-[13px] text-ink-muted" }}
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

      {/* 進階設定：預設收合，點藍字展開 */}
      <div>
        <button
          type="button"
          onClick={() => setAdvanced((prev) => !prev)}
          aria-expanded={advanced}
          className="flex w-full items-center justify-between gap-3 text-[17px]"
        >
          <span className="text-accent">進階設定</span>
          <span className="flex items-center gap-2 text-[15px] text-ink-muted">
            <span className="tabular-nums">{digits} 位數 · {period} 秒 · {algorithm}</span>
            <FontAwesomeIcon icon={advanced ? faChevronUp : faChevronDown} className="w-3" />
          </span>
        </button>

        {advanced && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="位數"
                variant="flat"
                labelPlacement="outside"
                size="lg"
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
                size="lg"
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
                size="lg"
                selectedKeys={[algorithm]}
                disallowEmptySelection
                onChange={(e) => e.target.value && set({ algorithm: e.target.value as TotpAlgorithm })}
              >
                {TOTP_ALGORITHMS.map((a) => <SelectItem key={a}>{a}</SelectItem>)}
              </Select>
            </div>
            <p className="text-[13px] text-ink-muted">
              大多數服務使用預設值（6 位數、30 秒、SHA-1），除非服務另有說明否則不需更改
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TotpForm;
