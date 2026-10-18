"use client";

import { useRef, useState } from "react";
import { Button, Input } from "@heroui/react";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faImage, faLink } from "@fortawesome/free-solid-svg-icons";
import { decodeQrFromFile } from "@/lib/qr";
import { parseOtpauthUri } from "@/lib/totp/otpauth";
import { QrImportProps } from "@/types/AddCode/QrImport";
import CameraScanModal from "./CameraScanModal";

// 從 otpauth:// 連結、QR Code 圖片或相機匯入，解析後交給表單
const QrImport = (props: QrImportProps) => {
  const [uri, setUri] = useState("");
  const [scanning, setScanning] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const importText = (text: string) => {
    const result = parseOtpauthUri(text);
    if (!result.success) {
      toast.error(result.message, { position: "top-right" });
      return false;
    }
    props.onImport(result.data);
    toast.success(`已帶入「${result.data.name}」，確認後按新增`, { position: "top-right" });
    return true;
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setDecoding(true);
    try {
      const text = await decodeQrFromFile(file);
      if (text) {
        importText(text);
      } else {
        toast.error("圖片中找不到 QR Code，請換一張清楚一點的截圖", { position: "top-right" });
      }
    } catch {
      toast.error("無法讀取這張圖片", { position: "top-right" });
    } finally {
      setDecoding(false);
      // 清空才能再次選同一個檔案
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (importText(uri)) setUri("");
        }}
      >
        <Input
          aria-label="otpauth 連結"
          placeholder="貼上 otpauth://totp/... 連結"
          value={uri}
          onValueChange={setUri}
          startContent={<FontAwesomeIcon icon={faLink} className="w-3.5 text-gray-blue-400" />}
          // 貼上完整連結時直接帶入，不用再按按鈕
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.trim().startsWith("otpauth://")) {
              e.preventDefault();
              importText(text);
            }
          }}
        />
        <Button type="submit" variant="flat" isDisabled={!uri.trim()}>
          帶入
        </Button>
      </form>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="bordered"
          startContent={<FontAwesomeIcon icon={faImage} className="w-4" />}
          isLoading={decoding}
          onPress={() => fileRef.current?.click()}
        >
          上傳 QR Code 圖片
        </Button>
        <Button
          variant="bordered"
          startContent={<FontAwesomeIcon icon={faCamera} className="w-4" />}
          onPress={() => setScanning(true)}
        >
          相機掃描
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {scanning && (
        <CameraScanModal
          onClose={() => setScanning(false)}
          onResult={(text) => {
            setScanning(false);
            importText(text);
          }}
        />
      )}
    </div>
  );
};

export default QrImport;
