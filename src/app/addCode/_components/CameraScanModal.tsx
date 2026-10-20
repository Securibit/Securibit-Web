"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import Spinner from "@/components/ui/Loading/Spinner";
import { decodeQrFromSource } from "@/lib/qr";
import { CameraScanModalProps } from "@/types/AddCode/CameraScanModal";

// 開相機掃描 QR Code；由父層在要掃描時才掛上，關閉時一定要停掉相機
const CameraScanModal = (props: CameraScanModalProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);
  // 避免 effect 依賴 props（父層每次 render 都是新函式）
  const onResultRef = useRef(props.onResult);
  useEffect(() => {
    onResultRef.current = props.onResult;
  });

  useEffect(() => {
    let stream: MediaStream | undefined;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");

    const scan = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= video.HAVE_ENOUGH_DATA) {
        const text = decodeQrFromSource(video, video.videoWidth, video.videoHeight, canvas);
        if (text) {
          stopped = true;
          onResultRef.current(text);
          return;
        }
      }
      frame = requestAnimationFrame(scan);
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("此瀏覽器不支援相機，或網站不是透過 HTTPS 開啟。請改用上傳圖片。");
        return;
      }
      try {
        // 手機優先用後鏡頭
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);
        frame = requestAnimationFrame(scan);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "沒有相機權限，請在瀏覽器設定允許使用相機，或改用上傳圖片。"
            : "無法開啟相機，請改用上傳圖片。"
        );
      }
    };

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <Modal isOpen onOpenChange={(open) => !open && props.onClose()} className="bg-surface text-ink">
      <ModalContent>
        <ModalHeader>掃描 QR Code</ModalHeader>
        <ModalBody>
          {error ? (
            <p className="text-[15px] text-alarm">{error}</p>
          ) : (
            <div className="relative overflow-hidden rounded-[18px] bg-black">
              <video ref={videoRef} muted playsInline className="aspect-square w-full object-cover" />
              {ready ? (
                // 對準框
                <div className="pointer-events-none absolute inset-[15%] rounded-[16px] border-2 border-white/80" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner label="開啟相機…" />
                </div>
              )}
            </div>
          )}
          <p className="text-[13px] text-ink-muted">
            將服務提供的綁定 QR Code 對準框內，辨識成功會自動帶入
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={props.onClose}>
            取消
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CameraScanModal;
