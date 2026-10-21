"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Tab, Tabs } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import QrCode from "@/components/ui/QrCode/QrCode";
import { buildMigrationUris, canExportToGoogle } from "@/lib/totp/migration";
import { buildOtpauthUri } from "@/lib/totp/otpauth";
import { showError } from "@/lib/errorDialog";
import { ExportModalProps } from "@/types/Code/ExportModal";
import ExportWarning from "./ExportWarning";

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

// 翻頁用的小圓鈕
const pageButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

// 分組列表裡的一列動作：藍字
const actionRowClass =
  "flex w-full items-center gap-3 px-5 py-3 text-left text-[17px] text-accent transition-colors hover:bg-surface-1";

// 全部匯出：Google Authenticator 的匯入 QR Code，或每行一個 otpauth 連結的文字備份
const ExportModal = (props: ExportModalProps) => {
  const googleItems = useMemo(() => props.items.filter(canExportToGoogle), [props.items]);
  const migrationUris = useMemo(() => buildMigrationUris(googleItems), [googleItems]);
  const [page, setPage] = useState(0);

  const backupText = useMemo(
    () =>
      [
        `# Securibit TOTP 備份（${new Date().toLocaleString()}，共 ${props.items.length} 筆）`,
        "# 每行一個 otpauth:// 連結，可匯入本站或其他支援的驗證器 App",
        ...props.items.map(buildOtpauthUri),
      ].join("\n"),
    [props.items]
  );

  const download = () => {
    const url = URL.createObjectURL(new Blob([backupText + "\n"], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `securibit-totp-${today()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(backupText);
      toast.success("已複製全部連結", { position: "top-right" });
    } catch {
      showError("無法複製", "瀏覽器不允許存取剪貼簿，請改用下載。");
    }
  };

  const skipped = props.items.length - googleItems.length;

  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && props.onClose()}
      size="lg"
      scrollBehavior="inside"
      className="bg-surface text-ink"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span>匯出全部驗證碼</span>
          <span className="text-[13px] font-normal text-ink-muted">共 {props.items.length} 筆</span>
        </ModalHeader>
        <ModalBody className="gap-5">
          <ExportWarning />
          <Tabs aria-label="匯出方式" fullWidth variant="light" radius="full">
            <Tab key="google" title="Google Authenticator">
              {migrationUris.length === 0 ? (
                <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">
                  沒有可以匯出到 Google Authenticator 的驗證碼
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-center text-[15px] text-ink-muted">
                    在 Google Authenticator 選「轉移帳戶 → 匯入帳戶」，依序掃描
                    {migrationUris.length > 1 ? ` ${migrationUris.length} 張` : "這張"} QR Code
                  </p>
                  <QrCode value={migrationUris[page]} size={260} alt={`第 ${page + 1} 張匯出 QR Code`} />
                  {migrationUris.length > 1 && (
                    <div className="flex items-center gap-3">
                      <button type="button" aria-label="上一張" disabled={page === 0} onClick={() => setPage(page - 1)} className={pageButtonClass}>
                        <FontAwesomeIcon icon={faChevronLeft} className="w-3" />
                      </button>
                      <span className="text-[15px] tabular-nums text-ink-muted">
                        {page + 1} / {migrationUris.length}
                      </span>
                      <button
                        type="button"
                        aria-label="下一張"
                        disabled={page === migrationUris.length - 1}
                        onClick={() => setPage(page + 1)}
                        className={pageButtonClass}
                      >
                        <FontAwesomeIcon icon={faChevronRight} className="w-3" />
                      </button>
                    </div>
                  )}
                  {skipped > 0 && (
                    <p className="text-center text-[13px] text-alarm">
                      有 {skipped} 筆不是 30 秒週期，Google Authenticator 不支援，請改用文字備份
                    </p>
                  )}
                </div>
              )}
            </Tab>
            <Tab key="text" title="文字備份">
              <div className="flex flex-col gap-4">
                <p className="text-[15px] text-ink-muted">
                  每行一個 otpauth 連結（含類別），之後可以在「新增驗證碼 → 上傳圖片或備份檔」整批匯入，也可以給其他支援 otpauth 連結的 App 使用
                </p>
                <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
                  <button type="button" onClick={download} className={actionRowClass}>
                    <FontAwesomeIcon icon={faDownload} className="w-4 shrink-0" />
                    下載備份檔
                  </button>
                  <button type="button" onClick={copy} className={actionRowClass}>
                    <FontAwesomeIcon icon={faCopy} className="w-4 shrink-0" />
                    複製全部連結
                  </button>
                </div>
              </div>
            </Tab>
          </Tabs>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onPress={props.onClose}>
            完成
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ExportModal;
