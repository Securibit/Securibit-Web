"use client";

import { AlertCardProps } from "@/types/Alert/AlertCard";
import { CubeTransparentIcon } from "@heroicons/react/24/outline";

const AlertCard = (props: AlertCardProps) => {
  if (!props.openAlert) return null;

  return (
    <div className="mt-auto rounded-lg bg-gray-blue-900 p-4 text-white">
      <button
        onClick={() => props.onClose()}
        className="float-right text-white/70 hover:text-white"
        aria-label="關閉"
      >
        ✕
      </button>
      <CubeTransparentIcon className="mb-4 h-12 w-12" />
      <h6 className="mb-1 text-base font-semibold">{props.title}</h6>
      <p className="text-sm font-normal opacity-80">{props.description}</p>
      <div className="mt-4 flex gap-3">
        <a
          href="#"
          className="text-sm font-medium opacity-80"
          onClick={() => props.leftBtn.onClick()}
        >
          {props.leftBtn.text}
        </a>
        <a
          href="#"
          className="text-sm font-medium"
          onClick={() => props.rightBtn.onClick()}
        >
          {props.rightBtn.text}
        </a>
      </div>
    </div>
  );
};

export default AlertCard;
