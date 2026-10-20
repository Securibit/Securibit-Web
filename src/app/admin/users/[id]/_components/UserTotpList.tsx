"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { deleteAdminUserTotp, loadAdminUserTotp, updateAdminUserTotp } from "@/lib/admin/admin";
import { normalizeSecret } from "@/lib/totp/crud";
import { showError } from "@/lib/errorDialog";
import { AdminTotpItem } from "@/types/Admin/Admin";
import { TotpInput } from "@/types/Totp/Totp";
import { UserTotpListProps } from "@/types/Admin/UserTotpList";
import AdminTotpRow from "./AdminTotpRow";
import AdminTotpEditModal from "./AdminTotpEditModal";

// 使用者的 2FA：按「顯示」才載入（每次載入都會寫一筆操作紀錄）
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
    toast.success("已儲存", { position: "top-right" });
    return true;
  };

  const handleDelete = async (item: AdminTotpItem) => {
    const result = await deleteAdminUserTotp(user.id, item.id);
    if (!result.success) {
      showError("刪除驗證碼失敗", result.message);
      return;
    }
    setItems((prev) => prev?.filter((current) => current.id !== item.id));
    toast.success("已刪除", { position: "top-right" });
  };

  const count = items ? items.length : user.totp_count;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-5">
        <h2 className="text-[13px] font-normal text-ink-muted">驗證碼（{count} 筆）</h2>
        {items ? (
          <button type="button" onClick={() => setItems(undefined)} className="text-[13px] text-accent hover:underline">
            隱藏
          </button>
        ) : (
          <button type="button" onClick={reveal} disabled={loading} className="text-[13px] text-accent hover:underline disabled:opacity-50">
            {loading ? "載入中…" : "顯示"}
          </button>
        )}
      </div>

      {!items ? (
        <div className="rounded-[18px] border border-line/70 bg-surface px-5 py-3 text-[17px] text-ink-muted">
          點「顯示」才會載入，查看會被記錄在操作紀錄
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">這位使用者沒有驗證碼</div>
      ) : (
        <ul className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
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
      )}

      {user.vault_enabled && (
        <p className="mt-2 px-5 text-[13px] text-ink-muted">此使用者啟用了個人加密，管理員無法查看金鑰</p>
      )}

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
