"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "react-use";
import toast from "react-hot-toast";
import { Button, Input, Switch, Textarea } from "@heroui/react";
import PageHeader from "@/components/layout/PageHeader";
import ConfirmModal from "@/components/ui/Modal/ConfirmModal";
import RoleChip from "@/components/permissions/RoleChip";
import { LoadMoreButton } from "@/components/activity/ListStates";
import useAuth from "@/components/auth/useAuth";
import { loadSiteRoles } from "@/lib/admin/admin";
import { BROADCAST_PAGE_SIZE, isValidVersion, loadBroadcasts, previewBroadcast, sendBroadcast } from "@/lib/notifications/broadcast";
import { safeNotificationLink } from "@/lib/notifications/notifications";
import { BODY_MAX, BROADCAST_KINDS, BROADCAST_PLATFORMS, broadcastKindName, LINK_MAX, TITLE_MAX } from "@/lib/notifications/types";
import { SITE, permissionName, SITE_PERMISSIONS } from "@/lib/permissions/bits";
import { sortRoles } from "@/lib/permissions/hierarchy";
import { showError } from "@/lib/errorDialog";
import { cn } from "@/lib/utils";
import { AdminUser } from "@/types/Admin/Admin";
import { BroadcastFilter, BroadcastKind, BroadcastPlatform, BroadcastPreview, BroadcastRecord } from "@/types/Notification/Notification";
import { Role } from "@/types/Permission/Permission";
import NoPermission from "../_components/NoPermission";
import CheckRow from "./_components/CheckRow";
import UserPicker from "./_components/UserPicker";
import DevicePicker from "./_components/DevicePicker";
import BroadcastHistory from "./_components/BroadcastHistory";

// 一次最多的人數（資料庫也會擋）
const USER_LIMIT = 10_000;

const toggleIn = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

// 後台「發送通知」：內容、對象條件、預覽人數，確認後送出；下面是發送紀錄
const NotifyClient = () => {
  const { can } = useAuth();
  const allowed = can(SITE.SEND_NOTIFICATIONS);
  // 搜尋使用者、列出裝置要「查看使用者」
  const canPickUsers = can(SITE.VIEW_USERS);

  // 內容
  const [kind, setKind] = useState<BroadcastKind>("update");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");

  // 對象
  const [allUsers, setAllUsers] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<BroadcastPlatform[]>([]);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [versionMin, setVersionMin] = useState("");
  const [versionMax, setVersionMax] = useState("");
  const [lastSeenDays, setLastSeenDays] = useState("");

  const [roles, setRoles] = useState<Role[]>([]);
  const sortedRoles = useMemo(() => sortRoles(roles), [roles]);
  useEffect(() => {
    if (!allowed) return;
    loadSiteRoles().then((result) => {
      if (result.success) setRoles(result.data);
      else showError("載入身分組失敗", result.message);
    });
  }, [allowed]);

  // 發送紀錄
  const [records, setRecords] = useState<BroadcastRecord[] | null>(null);
  const [hasMoreRecords, setHasMoreRecords] = useState(false);
  const [loadingMoreRecords, setLoadingMoreRecords] = useState(false);
  const [recordsVersion, setRecordsVersion] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    loadBroadcasts().then((result) => {
      if (cancelled) return;
      if (result.success) {
        setRecords(result.data);
        setHasMoreRecords(result.data.length >= BROADCAST_PAGE_SIZE);
      } else {
        setRecords([]);
        showError("載入發送紀錄失敗", result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, recordsVersion]);

  const loadMoreRecords = async () => {
    if (!records || records.length === 0 || loadingMoreRecords) return;
    setLoadingMoreRecords(true);
    const result = await loadBroadcasts(records[records.length - 1].id);
    setLoadingMoreRecords(false);
    if (!result.success) {
      showError("載入發送紀錄失敗", result.message);
      return;
    }
    const seen = new Set(records.map((record) => record.id));
    setRecords([...records, ...result.data.filter((record) => !seen.has(record.id))]);
    setHasMoreRecords(result.data.length >= BROADCAST_PAGE_SIZE);
  };

  // ---------- 檢查與條件 ----------

  const trimmedTitle = title.trim();
  const trimmedLink = link.trim();
  const titleInvalid = trimmedTitle.length > TITLE_MAX;
  const bodyInvalid = body.trim().length > BODY_MAX;
  const linkInvalid = !!trimmedLink && (trimmedLink.length > LINK_MAX || !safeNotificationLink(trimmedLink));
  const versionMinInvalid = !!versionMin.trim() && !isValidVersion(versionMin);
  const versionMaxInvalid = !!versionMax.trim() && !isValidVersion(versionMax);
  const days = lastSeenDays.trim() ? Number(lastSeenDays) : null;
  const daysInvalid = days !== null && (!Number.isInteger(days) || days < 1 || days > 3650);
  const conditionsInvalid = versionMinInvalid || versionMaxInvalid || daysInvalid;

  // 選了使用者才能指定裝置；選的人被移除時，他的裝置也要拿掉（DevicePicker 只列出目前的人）
  const pickedUsers = allUsers ? [] : users;

  const filter = useMemo<BroadcastFilter>(() => {
    const next: BroadcastFilter = {};
    if (allUsers) next.all_users = true;
    if (!allUsers && users.length > 0) next.user_ids = users.map((user) => user.id);
    if (!allUsers && roleIds.length > 0) next.site_role_ids = roleIds;
    if (platforms.length > 0) next.platforms = platforms;
    if (!allUsers && users.length > 0 && sessionIds.length > 0) next.session_ids = sessionIds;
    if (versionMin.trim()) next.version_min = versionMin.trim();
    if (versionMax.trim()) next.version_max = versionMax.trim();
    const parsedDays = lastSeenDays.trim() ? Number(lastSeenDays) : NaN;
    if (Number.isInteger(parsedDays) && parsedDays > 0) next.last_seen_days = parsedDays;
    return next;
  }, [allUsers, users, roleIds, platforms, sessionIds, versionMin, versionMax, lastSeenDays]);

  const hasTarget = Object.keys(filter).length > 0;
  const filterKey = JSON.stringify(filter);

  // ---------- 預覽 ----------

  // 條件停止變動 500ms 後才預覽；結果和它對應的條件
  const [previewKey, setPreviewKey] = useState("");
  useDebounce(() => setPreviewKey(hasTarget && !conditionsInvalid ? filterKey : ""), 500, [filterKey, hasTarget, conditionsInvalid]);
  const [preview, setPreview] = useState<{ key: string; data: BroadcastPreview | null; error?: string }>();
  const previewSeq = useRef(0);

  useEffect(() => {
    if (!allowed || !previewKey) return;
    const current = ++previewSeq.current;
    previewBroadcast(JSON.parse(previewKey) as BroadcastFilter).then((result) => {
      if (current !== previewSeq.current) return;
      setPreview(result.success ? { key: previewKey, data: result.data } : { key: previewKey, data: null, error: result.message });
    });
  }, [allowed, previewKey]);

  const currentPreview = preview && preview.key === filterKey && previewKey === filterKey ? preview : undefined;
  const previewData = currentPreview?.data ?? null;
  const tooMany = !!previewData && previewData.users > (previewData.limit ?? USER_LIMIT);

  // ---------- 送出 ----------

  const [confirmOpen, setConfirmOpen] = useState(false);
  const canSend =
    !!trimmedTitle &&
    !titleInvalid &&
    !bodyInvalid &&
    !linkInvalid &&
    hasTarget &&
    !conditionsInvalid &&
    !!previewData &&
    previewData.users > 0 &&
    !tooMany;

  const handleSend = async () => {
    const result = await sendBroadcast(kind, title, body, trimmedLink || null, filter);
    setConfirmOpen(false);
    if (!result.success) {
      showError("發送失敗", result.message);
      return;
    }
    toast.success(`已發送給 ${result.data.users} 位使用者`, { position: "top-right" });
    setTitle("");
    setBody("");
    setLink("");
    setRecordsVersion((value) => value + 1);
  };

  if (!allowed) return <NoPermission permission={permissionName(SITE_PERMISSIONS, SITE.SEND_NOTIFICATIONS)} />;

  const kindName = broadcastKindName(kind);
  const confirmText = previewData
    ? `將「${kindName}」發送給 ${previewData.users} 位使用者，其中 ${previewData.push_devices} 台裝置會收到推播。送出後無法收回。` +
      (kind === "important" ? "重要公告使用者無法關閉，登入網站時也會在頂端顯示。" : "")
    : "";

  return (
    <div>
      <PageHeader title="發送通知" subtitle="發送公告與推廣通知，會出現在鈴鐺裡，並推播到符合條件的裝置" />

      <div className="flex flex-col gap-8">
        {/* 類別 */}
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">類別</h2>
          <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {BROADCAST_KINDS.map((item) => (
              <CheckRow key={item.key} checked={kind === item.key} onToggle={() => setKind(item.key)} description={item.description}>
                {item.name}
              </CheckRow>
            ))}
          </div>
          <p className="mt-2 px-5 text-[13px] text-ink-muted">使用者可以在設定關掉重要公告以外的類別，關掉的人不會收到推播，但鈴鐺裡還是看得到</p>
        </section>

        {/* 內容 */}
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">內容</h2>
          <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            <div className="px-5 py-4">
              <Input
                variant="flat"
                labelPlacement="outside"
                size="lg"
                label="標題"
                isRequired
                maxLength={TITLE_MAX}
                value={title}
                onValueChange={setTitle}
                isInvalid={titleInvalid}
                description={`${trimmedTitle.length} / ${TITLE_MAX}`}
              />
            </div>
            <div className="px-5 py-4">
              <Textarea
                variant="flat"
                labelPlacement="outside"
                size="lg"
                label="內文"
                minRows={3}
                maxLength={BODY_MAX}
                value={body}
                onValueChange={setBody}
                isInvalid={bodyInvalid}
                description={`${body.trim().length} / ${BODY_MAX}`}
              />
            </div>
            <div className="px-5 py-4">
              <Input
                variant="flat"
                labelPlacement="outside"
                size="lg"
                label="連結"
                placeholder="/download"
                maxLength={LINK_MAX}
                value={link}
                onValueChange={setLink}
                isInvalid={linkInvalid}
                errorMessage="只能填站內路徑，例如 /download"
                description="選填。點通知時開啟的站內頁面，要用 / 開頭"
              />
            </div>
          </div>
          <p className="mt-2 px-5 text-[13px] text-ink-muted">不要在通知裡放驗證碼、金鑰、密碼或其他敏感資料</p>
        </section>

        {/* 對象 */}
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">對象</h2>
          <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            <div className="flex items-center justify-between gap-6 px-5 py-3">
              <span className="text-[17px]">所有使用者</span>
              <Switch aria-label="所有使用者" isSelected={allUsers} onValueChange={setAllUsers} />
            </div>
          </div>
          <p className="mt-2 px-5 text-[13px] text-ink-muted">
            {allUsers ? "下面的平台、版本與最近使用的條件仍然會套用" : "沒有開的話，至少要選一個條件；所有條件同時符合才會收到"}
          </p>
        </section>

        {!allUsers && (
          <section>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">使用者</h2>
            {canPickUsers ? (
              <UserPicker selected={users} onChange={setUsers} />
            ) : (
              <div className="rounded-[18px] border border-line/70 bg-surface px-5 py-4 text-[15px] text-ink-muted">
                需要「{permissionName(SITE_PERMISSIONS, SITE.VIEW_USERS)}」權限才能指定使用者
              </div>
            )}
          </section>
        )}

        {!allUsers && pickedUsers.length > 0 && (
          <section>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">指定裝置</h2>
            <DevicePicker users={pickedUsers} selected={sessionIds} onChange={setSessionIds} />
            <p className="mt-2 px-5 text-[13px] text-ink-muted">都沒勾就是這些人的所有裝置；勾了只推播到勾選的裝置</p>
          </section>
        )}

        {!allUsers && sortedRoles.length > 0 && (
          <section>
            <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">網站身分組</h2>
            <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
              {sortedRoles.map((role) => (
                <CheckRow key={role.id} checked={roleIds.includes(role.id)} onToggle={() => setRoleIds(toggleIn(roleIds, role.id))}>
                  <RoleChip role={role} />
                </CheckRow>
              ))}
            </div>
            <p className="mt-2 px-5 text-[13px] text-ink-muted">有任一個勾選的身分組就算符合；@everyone 是所有人</p>
          </section>
        )}

        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">平台</h2>
          <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {BROADCAST_PLATFORMS.map((item) => (
              <CheckRow
                key={item.key}
                checked={platforms.includes(item.key)}
                onToggle={() => setPlatforms(toggleIn(platforms, item.key))}
                description={item.key === "web" ? "沒有登入中的 App、只用過網站的人；只會出現在鈴鐺，沒有推播" : undefined}
              >
                {item.name}
              </CheckRow>
            ))}
          </div>
          <p className="mt-2 px-5 text-[13px] text-ink-muted">都沒勾就是不限平台</p>
        </section>

        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">版本與使用時間</h2>
          <div className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            <div className="grid grid-cols-2 gap-4 px-5 py-4">
              <Input
                variant="flat"
                labelPlacement="outside"
                size="lg"
                label="最低版本"
                placeholder="1.4.0"
                value={versionMin}
                onValueChange={setVersionMin}
                isInvalid={versionMinInvalid}
                errorMessage="例如 1.4.0"
                classNames={{ input: "tabular-nums" }}
              />
              <Input
                variant="flat"
                labelPlacement="outside"
                size="lg"
                label="最高版本"
                placeholder="1.5.0"
                value={versionMax}
                onValueChange={setVersionMax}
                isInvalid={versionMaxInvalid}
                errorMessage="例如 1.5.0"
                classNames={{ input: "tabular-nums" }}
              />
            </div>
            <div className="px-5 py-4">
              <Input
                variant="flat"
                labelPlacement="outside"
                size="lg"
                label="最近幾天用過"
                placeholder="30"
                type="number"
                min={1}
                max={3650}
                value={lastSeenDays}
                onValueChange={setLastSeenDays}
                isInvalid={daysInvalid}
                errorMessage="請輸入 1 到 3650"
                endContent={<span className="text-[15px] text-ink-muted">天</span>}
                classNames={{ input: "tabular-nums" }}
              />
            </div>
          </div>
          <p className="mt-2 px-5 text-[13px] text-ink-muted">版本範圍包含兩端，只看 App 的版本；留空就是不限</p>
        </section>

        {/* 預覽與送出 */}
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">預覽</h2>
          <dl className="divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line/70 bg-surface">
            {!hasTarget ? (
              <p className="px-5 py-3 text-[17px] text-ink-muted">請選擇通知對象</p>
            ) : conditionsInvalid ? (
              <p className="px-5 py-3 text-[17px] text-ink-muted">條件格式不正確</p>
            ) : currentPreview?.error ? (
              <p className="px-5 py-3 text-[17px] text-alarm">{currentPreview.error}</p>
            ) : (
              (
                [
                  ["使用者", previewData?.users],
                  ["App 裝置", previewData?.devices],
                  ["收得到推播的裝置", previewData?.push_devices],
                ] as [string, number | undefined][]
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-6 px-5 py-3">
                  <dt className="text-[17px]">{label}</dt>
                  <dd className={cn("text-[17px] tabular-nums text-ink-muted", value === undefined && "opacity-60")}>
                    {value === undefined ? "計算中…" : value.toLocaleString()}
                  </dd>
                </div>
              ))
            )}
          </dl>
          {tooMany && (
            <p className="mt-2 px-5 text-[13px] text-alarm">一次最多 {(previewData?.limit ?? USER_LIMIT).toLocaleString()} 位使用者，請縮小範圍</p>
          )}
          <Button
            color="primary"
            radius="full"
            size="lg"
            className="mt-4 w-full font-semibold"
            isDisabled={!canSend}
            onPress={() => setConfirmOpen(true)}
          >
            發送
          </Button>
        </section>

        {/* 發送紀錄 */}
        <section>
          <h2 className="mb-2 px-5 text-[13px] font-normal text-ink-muted">發送紀錄</h2>
          <div className="flex flex-col gap-4">
            <BroadcastHistory records={records} roles={roles} />
            {hasMoreRecords && <LoadMoreButton onPress={loadMoreRecords} isLoading={loadingMoreRecords} />}
          </div>
        </section>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        danger={kind === "important"}
        title={`發送${kindName}`}
        description={confirmText}
        confirmLabel="發送"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleSend}
      />
    </div>
  );
};

export default NotifyClient;
