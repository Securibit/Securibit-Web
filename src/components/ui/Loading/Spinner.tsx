"use client";

import { Spinner as HeroSpinner } from "@heroui/react";
import { SpinnerProps } from "@/types/Loading/Spinner";

const Spinner = (props: SpinnerProps) => {
  const spinner = <HeroSpinner color="primary" label={props.label} classNames={{ label: "text-sm text-ink-muted" }} />;

  if (!props.block) return spinner;

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      {spinner}
    </div>
  );
};

export default Spinner;
