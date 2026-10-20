"use client";

import { SpinnerProps } from "@/types/Loading/Spinner";

// 儀表式載入指示：方框裡一段轉動的磷光邊
const Spinner = (props: SpinnerProps) => {
  const spinner = (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div className="relative h-8 w-8 border border-line">
        <div className="absolute -inset-px border-t-2 border-phos animate-spin [animation-duration:0.9s]" />
      </div>
      {props.label && <p className="tech-label">{props.label}</p>}
    </div>
  );

  if (!props.block) return spinner;

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      {spinner}
    </div>
  );
};

export default Spinner;
