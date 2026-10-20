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
      toast.success("已複製全部連結！", { position: "top-right" });
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
      className="border border-line bg-surface-1 text-ink"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 border-b border-line font-display tracking-wide">
          <span className="tech-label">EXPORT // ALL</span>
          匯出全部驗證碼
          <span className="font-mono text-[11px] font-normal tracking-[0.08em] text-ink-dim">{props.items.length} ITEMS</span>
        </ModalHeader>
        <ModalBody className="py-5">
          <ExportWarning />
          <Tabs
            aria-label="匯出方式"
            fullWidth
            variant="underlined"
            color="primary"
            classNames={{
              tabList: "gap-0 border-b border-line p-0",
              tab: "h-10 font-display tracking-[0.08em]",
              cursor: "h-0.5",
            }}
          >
            <Tab key="google" title="Google Authenticator">
              {migrationUris.length === 0 ? (
                <div className="hatch border border-line p-8 text-center">
                  <p className="tech-label">NO DATA</p>
                  <p className="mt-2 text-sm text-ink-muted">沒有可以匯出到 Google Authenticator 的驗證碼。</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-ink-muted">
                    在 Google Authenticator 選「轉移帳戶 → 匯入帳戶」，依序掃描
                    {migrationUris.length > 1 ? ` ${migrationUris.length} 張` : "這張"} QR Code。
                  </p>
                  <QrCode value={migrationUris[page]} size={260} alt={`第 ${page + 1} 張匯出 QR Code`} />
                  {migrationUris.length > 1 && (
                    <div className="flex items-center gap-3">
                      <Button isIconOnly size="sm" variant="bordered" aria-label="上一張" isDisabled={page === 0} onPress={() => setPage(page - 1)}>
                        <FontAwesomeIcon icon={faChevronLeft} className="w-3" />
                      </Button>
                      <span className="font-mono text-sm tabular-nums tracking-[0.08em]">
                        {String(page + 1).padStart(2, "0")} / {String(migrationUris.length).padStart(2, "0")}
                      </span>
                      <Button isIconOnly size="sm" variant="bordered" aria-label="下一張" isDisabled={page === migrationUris.length - 1} onPress={() => setPage(page + 1)}>
                        <FontAwesomeIcon icon={faChevronRight} className="w-3" />
                      </Button>
                    </div>
                  )}
                  {skipped > 0 && (
                    <p className="flex items-center gap-2 text-sm text-alarm">
                      <span className="led led-alarm" aria-hidden />
                      有 <span className="font-mono">{skipped}</span> 筆不是 30 秒週期，Google Authenticator 不支援，請改用文字備份。
                    </p>
                  )}
                </div>
              )}
            </Tab>
            <Tab key="text" title="文字備份">
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-muted">
                  每行一個 otpauth:// 連結（含類別），之後可以在「新增驗證碼 → 上傳圖片或備份檔」整批匯入，也可以給其他支援 otpauth 連結的 App 使用。
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button color="primary" startContent={<FontAwesomeIcon icon={faDownload} className="w-3.5" />} onPress={download}>
                    下載備份檔
                  </Button>
                  <Button variant="bordered" startContent={<FontAwesomeIcon icon={faCopy} className="w-3.5" />} onPress={copy}>
                    複製全部
                  </Button>
                </div>
              </div>
            </Tab>
          </Tabs>
        </ModalBody>
        <ModalFooter className="border-t border-line">
          <Button color="primary" onPress={props.onClose}>
            完成
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ExportModal;
