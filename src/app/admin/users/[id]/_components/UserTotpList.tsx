"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
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
    <section className="rounded-lg border border-gray-blue-200 p-4 dark:border-gray-blue-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-blue-900 dark:text-white">
          2FA 驗證碼
          <span className="ml-2 text-sm font-normal text-gray-blue-500 dark:text-gray-blue-400">
            {items ? items.length : user.totp_count} 筆
          </span>
        </h2>
        <div className="flex items-center gap-3">
          {!items && <span className="text-xs text-gray-blue-500 dark:text-gray-blue-400">查看會被記錄在操作紀錄</span>}
          {items ? (
            <Button
              size="sm"
              variant="bordered"
              startContent={<FontAwesomeIcon icon={faEyeSlash} className="w-3.5" />}
              onPress={() => setItems(undefined)}
            >
              隱藏
            </Button>
          ) : (
            <Button
              size="sm"
              color="primary"
              variant="flat"
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
        <div className="mt-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 w-4 shrink-0" />
          <p>此使用者啟用了個人加密，管理員無法查看金鑰</p>
        </div>
      )}

      {items &&
        (items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-blue-500 dark:text-gray-blue-400">這位使用者沒有驗證碼</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-blue-200 dark:divide-gray-blue-700">
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
