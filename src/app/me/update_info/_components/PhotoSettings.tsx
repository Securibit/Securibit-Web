"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons";
import useAuth from "@/components/auth/useAuth";
import { PhotoKind, removePhoto, uploadPhoto } from "@/lib/users/photo";
import { showError } from "@/lib/errorDialog";
import { cn } from "@/lib/utils";
import { PhotoPreviewState } from "@/types/Profile/PhotoSettings";

// 舊資料庫給每個人的預設背景圖：等於沒有設定（同 PersonalCard）
const DEFAULT_BG_PHOTO = 'https://img.freepik.com/free-photo/abstract-luxury-plain-blur-grey-black-gradient-used-as-background-studio-wall-display-your-products_1258-63747.jpg?w=2000';

const KIND_TEXT: Record<PhotoKind, string> = { avatar: "大頭照", background: "背景圖" };

const linkClass = "shrink-0 text-[17px] text-accent hover:underline disabled:opacity-40 disabled:hover:no-underline";

// 帳戶設定「個人資料」裡的大頭照與背景圖兩列：選圖片 → 預覽 → 上傳（伺服器裁切成 webp）；可以改回 Google 大頭照、移除背景
const PhotoSettings = () => {
  const { profile, refresh } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const pickingRef = useRef<PhotoKind>("avatar");
  const [preview, setPreview] = useState<PhotoPreviewState>();
  const [busy, setBusy] = useState<PhotoKind>();

  const photo = profile?.photoURL ?? "";
  const background = profile?.bgPhotoURL && profile.bgPhotoURL !== DEFAULT_BG_PHOTO ? profile.bgPhotoURL : "";

  const pick = (kind: PhotoKind) => {
    pickingRef.current = kind;
    inputRef.current?.click();
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(undefined);
  };

  const handleUpload = async () => {
    if (!preview) return;
    setBusy(preview.kind);
    const result = await uploadPhoto(preview.kind, preview.file);
    setBusy(undefined);
    if (!result.success) {
      showError(`上傳${KIND_TEXT[preview.kind]}失敗`, result.message);
      return;
    }
    closePreview();
    await refresh();
    toast.success(`已更新${KIND_TEXT[preview.kind]}`, { position: "top-right" });
  };

  const handleRemove = async (kind: PhotoKind) => {
    setBusy(kind);
    const result = await removePhoto(kind);
    setBusy(undefined);
    if (!result.success) {
      showError(kind === "avatar" ? "改回 Google 頭像失敗" : "移除背景失敗", result.message);
      return;
    }
    await refresh();
    toast.success(kind === "avatar" ? "已改回 Google 頭像" : "已移除背景", { position: "top-right" });
  };

  return (
    <>
      <div className="flex items-center gap-4 px-5 py-3">
        {photo ? (
          <img className="h-12 w-12 shrink-0 rounded-full object-cover" src={photo} referrerPolicy="no-referrer" alt="" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-1 text-ink-muted">
            <FontAwesomeIcon icon={faUser} className="w-4" />
          </span>
        )}
        <span className="min-w-0 flex-1 text-[17px]">大頭照</span>
        {profile?.photoCustom && (
          <button type="button" className={linkClass} disabled={!!busy} onClick={() => handleRemove("avatar")}>
            {busy === "avatar" ? "處理中…" : "使用 Google 頭像"}
          </button>
        )}
        <button type="button" className={linkClass} disabled={!!busy} onClick={() => pick("avatar")}>
          上傳
        </button>
      </div>

      <div className="flex items-center gap-4 px-5 py-3">
        {background ? (
          <img className="h-12 w-20 shrink-0 rounded-[10px] object-cover" src={background} alt="" />
        ) : (
          <span className="h-12 w-20 shrink-0 rounded-[10px] bg-surface-1" aria-hidden />
        )}
        <span className="min-w-0 flex-1 text-[17px]">背景圖</span>
        {background && (
          <button type="button" className={cn(linkClass, "text-alarm")} disabled={!!busy} onClick={() => handleRemove("background")}>
            {busy === "background" ? "處理中…" : "移除背景"}
          </button>
        )}
        <button type="button" className={linkClass} disabled={!!busy} onClick={() => pick("background")}>
          上傳
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // 清空才能再次選同一個檔案
          e.target.value = "";
          if (!file) return;
          if (!file.type.startsWith("image/")) {
            showError("無法使用這個檔案", "請選擇 JPG、PNG 或 WebP 圖片。");
            return;
          }
          setPreview({ kind: pickingRef.current, file, url: URL.createObjectURL(file) });
        }}
      />

      <Modal isOpen={!!preview} onOpenChange={(open) => !open && !busy && closePreview()} className="bg-surface text-ink">
        <ModalContent>
          <ModalHeader>{preview ? `上傳${KIND_TEXT[preview.kind]}` : ""}</ModalHeader>
          <ModalBody className="items-center gap-3">
            {preview?.kind === "avatar" && (
              <img className="h-40 w-40 rounded-full object-cover" src={preview.url} alt="" />
            )}
            {preview?.kind === "background" && (
              <img className="h-36 w-full rounded-[14px] object-cover" src={preview.url} alt="" />
            )}
            <p className="text-[13px] text-ink-muted">
              {preview?.kind === "avatar" ? "會裁成正方形，圖片的位置資訊等中繼資料會被移除" : "寬度超過 1600 像素會縮小，圖片的位置資訊等中繼資料會被移除"}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={closePreview} isDisabled={!!busy}>
              取消
            </Button>
            <Button color="primary" onPress={handleUpload} isLoading={!!busy}>
              上傳
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default PhotoSettings;
