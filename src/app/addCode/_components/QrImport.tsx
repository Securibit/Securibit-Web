"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faImage, faLink } from "@fortawesome/free-solid-svg-icons";
import { decodeQrFromFile } from "@/lib/qr";
import { formatImportErrors, parseImportText } from "@/lib/totp/importText";
import { QrImportProps } from "@/types/AddCode/QrImport";
import CameraScanModal from "./CameraScanModal";
import { showError } from "@/lib/errorDialog";

// 分組列表裡的一列動作：藍字、左邊一個圖示
const rowClass =
  "flex w-full items-center gap-3 px-5 py-3 text-left text-[17px] text-accent transition-colors hover:bg-surface-1 disabled:opacity-40 disabled:hover:bg-transparent";

// 從 otpauth:// 連結、QR Code 圖片或相機匯入，解析後交給表單
const QrImport = (props: QrImportProps) => {
  const [uri, setUri] = useState("");
  const [scanning, setScanning] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 一筆就帶入表單；多筆（Google Authenticator 匯出、備份檔）交給父層整批匯入
  const importText = (text: string) => {
    const result = parseImportText(text);
    if (result.items.length === 0) {
      const details = [result.errors.length > 0 ? formatImportErrors(result.errors) : "沒有可匯入的內容", ...result.notes];
      // 只有一行時不用行號
      showError("無法匯入", result.errors.length === 1 && result.notes.length === 0 ? result.errors[0].reason : details.join("\n"));
      return false;
    }
    if (result.items.length === 1 && result.errors.length === 0 && !result.batch) {
      const [item] = result.items;
      props.onImport(item);
      toast.success(`已帶入「${item.name}」，確認後按新增`, { position: "top-right" });
    } else {
      props.onImportMany(result);
    }
    return true;
  };

  const isTextFile = (file: File) => file.type.startsWith("text/") || /\.txt$/i.test(file.name);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setDecoding(true);
    try {
      // 本站匯出的文字備份檔
      if (isTextFile(file)) {
        importText(await file.text());
        return;
      }
      const text = await decodeQrFromFile(file);
      if (text) {
        importText(text);
      } else {
        showError("找不到 QR Code", "圖片中找不到 QR Code，請換一張清楚一點的截圖。");
      }
    } catch {
      showError("無法讀取圖片", "這個檔案無法當成圖片讀取，請改用 PNG 或 JPG 截圖。");
    } finally {
      setDecoding(false);
      // 清空才能再次選同一個檔案
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
        {/* 貼上 otpauth 連結 */}
        <form
          className="flex items-center gap-3 px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (importText(uri)) setUri("");
          }}
        >
          <FontAwesomeIcon icon={faLink} className="w-4 shrink-0 text-ink-muted" />
          <input
            aria-label="otpauth 連結"
            placeholder="貼上 otpauth 連結"
            autoComplete="off"
            spellCheck="false"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-muted"
            // 貼上完整連結時直接帶入，不用再按按鈕
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text.trim().startsWith("otpauth")) {
                e.preventDefault();
                importText(text);
              }
            }}
          />
          <button type="submit" disabled={!uri.trim()} className="shrink-0 text-[17px] text-accent disabled:opacity-40">
            帶入
          </button>
        </form>

        <button type="button" className={rowClass} disabled={decoding} onClick={() => fileRef.current?.click()}>
          <FontAwesomeIcon icon={faImage} className="w-4 shrink-0" />
          {decoding ? "讀取中…" : "上傳圖片或備份檔"}
        </button>

        <button type="button" className={rowClass} onClick={() => setScanning(true)}>
          <FontAwesomeIcon icon={faCamera} className="w-4 shrink-0" />
          用相機掃描
        </button>
      </div>
      <p className="mt-2 px-5 text-[13px] text-ink-muted">
        貼上服務給的 otpauth 連結，或用綁定畫面的 QR Code；Google Authenticator 的匯出 QR Code 和本站的備份檔可以一次匯入多筆
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.txt,text/plain"
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
    </>
  );
};

export default QrImport;
