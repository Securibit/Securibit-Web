"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { deleteAdminUserTotp, loadAdminUserTotp, updateAdminUserTotp } from "@/lib/admin/admin";
import { normalizeSecret } from "@/lib/totp/crud";
import { showError } from "@/lib/errorDialog";
import { AdminTotpItem } from "@/types/Admin/Admin";
import { TotpInput } from "@/types/Totp/Totp";
import { UserTotpListProps } from "@/types/Admin/UserTotpList";
import AdminTotpRow from "./AdminTotpRow";
import AdminTotpEditModal from "./AdminTotpEditModal";

// 使用者的 2FA：按「顯示 2FA」才載入（每次載入都會寫一筆操作紀錄）
const UserTotpList = (props: UserTotpListProps) => {
  const { user } = props;
  const [items, setItems] = useState<AdminTotpItem[]>();
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AdminTotpItem>();

  const categories = useMemo(
    () => [...new Set((items ?? []).map((item) => item.category).filter(Boolean))].sort(),
    [items]
  );

  const reveal = async () => {
    setLoading(true);
    const result = await loadAdminUserTotp(user.id);
    setLoading(false);
    if (result.success) setItems(result.data);
    else showError("載入 2FA 失敗", result.message);
  };

  // 改完只更新畫面上那一筆，不重新載入（重新載入會再寫一筆查看紀錄）
  const handleSave = async (item: AdminTotpItem, patch: Partial<TotpInput>) => {
    const result = await updateAdminUserTotp(user.id, item.id, patch);
    if (!result.success) {
      showError("儲存驗證碼失敗", result.message);
      return false;
    }
    setItems((prev) =>
      prev?.map((current) =>
        current.id === item.id
          ? {
              ...current,
              ...patch,
              name: patch.name?.trim() ?? current.name,
              category: patch.category?.trim() ?? current.category,
              secret: patch.secret !== undefined ? normalizeSecret(patch.secret) : current.secret,
            }
          : current
      )
    );
    toast.success("已儲存驗證碼！", { position: "top-right" });
    return true;
  };

  const handleDelete = async (item: AdminTotpItem) => {
    const result = await deleteAdminUserTotp(user.id, item.id);
    if (!result.success) {
      showError("刪除驗證碼失敗", result.message);
      return;
    }
    setItems((prev) => prev?.filter((current) => current.id !== item.id));
    toast.success("已刪除驗證碼！", { position: "top-right" });
  };

  return (
    <section className="border border-line bg-surface-1 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="tech-label">03 // 2FA</p>
          <h2 className="mt-1 font-display text-xl font-bold text-ink">
            驗證碼
            <span className="ml-3 font-mono text-sm font-normal text-ink-muted">{items ? items.length : user.totp_count} 筆</span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {!items && <span className="font-mono text-[11px] tracking-[0.08em] text-ink-dim">查看會被記錄在操作紀錄</span>}
          {items ? (
            <Button
              size="sm"
              variant="bordered"
              className="font-display tracking-[0.08em]"
              startContent={<FontAwesomeIcon icon={faEyeSlash} className="w-3.5" />}
              onPress={() => setItems(undefined)}
            >
              隱藏
            </Button>
          ) : (
            <Button
              size="sm"
              color="primary"
              className="font-display tracking-[0.08em]"
              isLoading={loading}
              startContent={!loading && <FontAwesomeIcon icon={faEye} className="w-3.5" />}
              onPress={reveal}
            >
              顯示 2FA
            </Button>
          )}
        </div>
      </div>

      {user.vault_enabled && (
        <p className="mt-4 flex items-center gap-3 border-l-2 border-line-strong pl-3 text-sm text-ink-muted">
          <span className="led-off" aria-hidden />
          此使用者啟用了個人加密，管理員無法查看金鑰
        </p>
      )}

      {items &&
        (items.length === 0 ? (
          <div className="hatch mt-4 border border-line p-10 text-center">
            <p className="tech-label">NO DATA</p>
            <p className="mt-2 text-ink-muted">這位使用者沒有驗證碼</p>
          </div>
        ) : (
          <ul className="mt-4 border-t border-line">
            {items.map((item) => (
              <AdminTotpRow
                key={item.id}
                item={item}
                canManage={props.canManage}
                onEdit={() => setEditing(item)}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </ul>
        ))}

      {editing && (
        <AdminTotpEditModal
          key={editing.id}
          item={editing}
          secretLocked={user.vault_enabled || editing.encrypted}
          categories={categories}
          onClose={() => setEditing(undefined)}
          onSave={(patch) => handleSave(editing, patch)}
        />
      )}
    </section>
  );
};

export default UserTotpList;
