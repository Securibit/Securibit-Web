"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Spinner from "@/components/ui/Loading/Spinner";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import UserChip from "@/components/permissions/UserChip";
import { banUser, loadGroupBans, unbanUser, updateBanReason } from "@/lib/groups/groups";
import { showError } from "@/lib/errorDialog";
import { formatDateTime } from "@/lib/utils";
import { GroupBan } from "@/types/Group/Group";
import { GroupBansProps } from "@/types/Group/GroupBans";
import BanReasonModal from "./BanReasonModal";

const banName = (ban: GroupBan) => ban.name || (ban.username ? `@${ban.username}` : ban.email || "這位使用者");

// 封鎖名單分頁（需要「封鎖成員」）：被封鎖的人不能再透過邀請加入；可以新增、修改原因、解除封鎖
const GroupBans = ({ detail, onChanged }: GroupBansProps) => {
  const gid = detail.group.id;
  const [bans, setBans] = useState<GroupBan[]>();
  const [target, setTarget] = useState("");
  // 新增封鎖：先填 @ID / 電子郵件，按「封鎖」後再問原因
  const [adding, setAdding] = useState<string>();
  const [editing, setEditing] = useState<GroupBan>();
  const [unbanning, setUnbanning] = useState<GroupBan>();

  const reload = async () => {
    const result = await loadGroupBans(gid);
    if (!result.success) {
      showError("載入封鎖名單失敗", result.message);
      setBans((current) => current ?? []);
      return;
    }
    setBans(result.data);
  };

  // 群組資料重新載入時（例如在成員分頁封鎖了某人）一起更新
  useEffect(() => {
    let cancelled = false;
    loadGroupBans(gid).then((result) => {
      if (cancelled) return;
      if (result.success) setBans(result.data);
      else {
        showError("載入封鎖名單失敗", result.message);
        setBans((current) => current ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [gid, detail]);

  const handleUnban = async (ban: GroupBan) => {
    const result = await unbanUser(gid, ban.user_id);
    if (!result.success) {
      showError("解除封鎖失敗", result.message);
      return;
    }
    toast.success(`已解除封鎖 ${banName(ban)}`, { position: "top-right" });
    await reload();
  };

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">封鎖使用者</h2>
        <form
          className="flex items-center gap-3 overflow-hidden rounded-[18px] border border-line/70 bg-surface px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (target.trim()) setAdding(target.trim());
          }}
        >
          <input
            aria-label="電子郵件或 @ID"
            placeholder="name@example.com 或 @someone"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-[12px] bg-surface-1 px-3.5 py-2 text-[17px] text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="submit"
            disabled={!target.trim()}
            className="shrink-0 text-[17px] text-alarm hover:underline disabled:opacity-40 disabled:hover:no-underline"
          >
            封鎖
          </button>
        </form>
        <p className="mt-2 px-5 text-[13px] text-ink-muted">被封鎖的人無法再透過邀請加入；如果對方是成員，會一起移出群組。只能封鎖身分組比你低的成員</p>
      </section>

      <section>
        <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">
          {bans ? `封鎖名單 ${bans.length}` : "封鎖名單"}
        </h2>
        {!bans ? (
          <div className="flex justify-center rounded-[18px] border border-line/70 bg-surface py-6">
            <Spinner />
          </div>
        ) : bans.length === 0 ? (
          <div className="rounded-[18px] bg-surface-1 px-6 py-12 text-center text-ink-muted">沒有封鎖任何人</div>
        ) : (
          <ul role="list" className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {bans.map((ban) => (
              <li key={ban.user_id} className="flex flex-col gap-2 px-5 py-3">
                <div className="flex items-center gap-3">
                  <UserChip
                    className="flex-1"
                    user={{ id: ban.user_id, name: ban.name, username: ban.username, photo_url: ban.photo_url, email: ban.email }}
                  />
                  <button type="button" onClick={() => setEditing(ban)} className="shrink-0 text-[17px] text-accent hover:underline">
                    編輯
                  </button>
                  <button type="button" onClick={() => setUnbanning(ban)} className="shrink-0 text-[17px] text-alarm hover:underline">
                    解除
                  </button>
                </div>
                {/* @ID 已經在 UserChip 的第二行；有 @ID 又看得到電子郵件時另外列出 */}
                {ban.username && ban.email && <p className="truncate text-[13px] text-ink-muted">{ban.email}</p>}
                <p className="whitespace-pre-wrap break-words text-[15px] text-ink">
                  {ban.reason ? ban.reason : <span className="text-ink-muted">沒有填寫原因</span>}
                </p>
                <p className="truncate text-[13px] text-ink-muted tabular-nums">
                  由 {ban.banned_by ? ban.banned_by.name || "成員" : "已刪除的使用者"}封鎖 · {formatDateTime(ban.created_at)}
                  {ban.updated_at && ban.updated_at !== ban.created_at && ` · ${formatDateTime(ban.updated_at)} 修改`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {adding && (
        <BanReasonModal
          key={adding}
          isOpen
          danger
          title="封鎖使用者"
          description={`確定要封鎖 ${adding} 嗎？對方如果是成員會一起移出群組。`}
          confirmLabel="封鎖"
          onClose={() => setAdding(undefined)}
          onSave={async (reason) => {
            const result = await banUser(gid, adding, reason);
            if (result.success) {
              toast.success(`已封鎖 ${adding}`, { position: "top-right" });
              setTarget("");
              // 對方可能是成員：成員列表與封鎖名單一起更新
              await onChanged();
            }
            return result;
          }}
        />
      )}

      {editing && (
        <BanReasonModal
          key={editing.user_id}
          isOpen
          title={`修改封鎖原因：${banName(editing)}`}
          initialReason={editing.reason}
          confirmLabel="儲存"
          onClose={() => setEditing(undefined)}
          onSave={async (reason) => {
            const result = await updateBanReason(gid, editing.user_id, reason);
            if (result.success) {
              toast.success("已更新封鎖原因", { position: "top-right" });
              await reload();
            }
            return result;
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!unbanning}
        title="解除封鎖"
        description={`確定要解除封鎖 ${unbanning ? banName(unbanning) : ""} 嗎？對方之後可以再透過邀請加入。`}
        confirmLabel="解除封鎖"
        onCancel={() => setUnbanning(undefined)}
        onConfirm={async () => {
          const ban = unbanning;
          setUnbanning(undefined);
          if (ban) await handleUnban(ban);
        }}
      />
    </div>
  );
};

export default GroupBans;
