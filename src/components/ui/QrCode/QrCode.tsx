"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCodeProps } from "@/types/QrCode/QrCode";

// 把文字轉成 QR Code 圖片；深色模式也維持白底黑碼，相機才掃得到
const QrCode = (props: QrCodeProps) => {
  const size = props.size ?? 240;
  const [image, setImage] = useState<{ value: string; url: string }>();

  useEffect(() => {
    let cancelled = false;
    // 產生兩倍大小，高解析度螢幕上才不會糊
    QRCode.toDataURL(props.value, { width: size * 2, margin: 2, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setImage({ value: props.value, url });
      })
      .catch(() => {
        if (!cancelled) setImage(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [props.value, size]);

  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-[18px] border border-line/70 bg-white p-3"
      style={{ width: size + 26, height: size + 26 }}
    >
      {image?.value === props.value && (
        <img src={image.url} width={size} height={size} alt={props.alt ?? "QR Code"} />
      )}
    </div>
  );
};

export default QrCode;
