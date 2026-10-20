"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import { Tab, Tabs } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faLock } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Loading/Spinner";
import RoleChip from "@/components/permissions/RoleChip";
import AuditLogList from "@/components/permissions/AuditLogList";
import useAuth from "@/components/auth/useAuth";
import { loadGroupAuditLog, loadGroupDetail } from "@/lib/groups/groups";
import { GROUP, SITE, has, hasAny } from "@/lib/permissions/bits";
import { Actor, sortRoles } from "@/lib/permissions/hierarchy";
import { showError } from "@/lib/errorDialog";
import { GroupDetail } from "@/types/Group/Group";
import { GroupViewProps } from "@/types/Group/GroupView";
import GroupCodes from "./GroupCodes";
import GroupMembers from "./GroupMembers";
import GroupRoles from "./GroupRoles";
import GroupInvites from "./GroupInvites";
import GroupSettings from "./GroupSettings";

type TabKey = "codes" | "members" | "roles" | "invites" | "settings" | "audit";

const TAB_KEYS: TabKey[] = ["codes", "members", "roles", "invites", "settings", "audit"];

// 群組內頁主體：依權限顯示 驗證碼 / 成員 / 身分組 / 邀請 / 設定 / 紀錄（/groups/[id] 與後台 /admin/groups/[id] 共用）
const GroupView = (props: GroupViewProps) => {
  const { gid, exitHref } = props;
  const router = useRouter();
  const { user, can } = useAuth();
  const [detail, setDetail] = useState<GroupDetail>();
  const [tab, setTab] = useState<TabKey>(() =>
    TAB_KEYS.includes(props.initialTab as TabKey) ? (props.initialTab as TabKey) : "codes"
  );

  // 載入失敗（不是成員、群組已刪除…）就跳錯誤並回到列表
  const applyDetail = (result: Awaited<ReturnType<typeof loadGroupDetail>>) => {
    if (result.success && result.data) {
      setDetail(result.data);
    } else {
      showError("無法開啟群組", result.success ? "找不到這個群組。" : result.message);
      router.replace(exitHref);
    }
  };

  // 各分頁修改後重新載入
  const reload = async () => applyDetail(await loadGroupDetail(gid));

  // 登入狀態由 AuthGate 確認過
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadGroupDetail(gid).then((result) => {
      if (!cancelled) applyDetail(result);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, gid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 擁有者、全站管理員 / 管理所有群組：不受階層限制
  const actor = useMemo<Actor>(
    () => ({
      unrestricted: !!detail?.is_owner || can(SITE.ADMINISTRATOR) || can(SITE.MANAGE_GROUPS),
      topPosition: detail?.top_position ?? 0,
    }),
    [detail?.is_owner, detail?.top_position, can]
  );

  if (!detail) return <Spinner block label="載入群組…" />;

  const permissions = detail.permissions;
  const me = detail.members.find((member) => member.id === user?.uid);
  const myRoles = sortRoles(detail.roles).filter((role) => !role.is_default && me?.role_ids.includes(role.id));

  // 看不到的分頁不顯示（驗證碼、成員、身分組、設定所有成員都有）
  const visible: Record<TabKey, boolean> = {
    codes: true,
    members: true,
    roles: true,
    // 加密的群組不能邀請其他人
    invites: hasAny(permissions, [GROUP.CREATE_INVITE, GROUP.MANAGE_GROUP]) && !detail.group.encrypted,
    settings: true,
    audit: has(permissions, GROUP.VIEW_AUDIT_LOG),
  };
  // 權限被拿掉時目前的分頁可能不見了，回到驗證碼
  const activeTab: TabKey = visible[tab] ? tab : "codes";

  const tabProps = { detail, actor, onChanged: reload };

  const backLink = (
    <Link
      href={props.backHref}
      className={
        props.backPlacement === "top"
          ? "mb-3 inline-flex items-center gap-1.5 text-[17px] text-accent hover:underline"
          : "flex items-center gap-1.5 text-[17px] text-accent hover:underline"
      }
    >
      <FontAwesomeIcon icon={faChevronLeft} className="w-2.5" />
      {props.backText}
    </Link>
  );

  return (
    <div>
      {props.backPlacement === "top" && backLink}
      <PageHeader
        title={detail.group.name}
        subtitle={detail.group.description || undefined}
        right={props.backPlacement === "right" ? backLink : undefined}
      />

      {/* 我的身分 */}
      <div className="mb-5 flex flex-wrap items-center gap-2 px-1 text-[15px] text-ink-muted">
        <span>我的身分</span>
        {detail.is_owner && <span className="rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-ink">擁有者</span>}
        {myRoles.map((role) => (
          <RoleChip key={role.id} role={role} />
        ))}
        {me && !detail.is_owner && myRoles.length === 0 && (
          <span className="rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-ink">@everyone</span>
        )}
        {!me && <span className="rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-ink">非成員，以全站管理權限檢視</span>}
        {detail.is_default && <span className="rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-accent">我的預設群組</span>}
        {detail.group.encrypted && (
          <span className="flex items-center gap-1 rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-ink">
            <FontAwesomeIcon icon={faLock} className="w-2.5" />
            已加密
          </span>
        )}
      </div>

      <Tabs
        aria-label="群組分頁"
        variant="light"
        radius="full"
        fullWidth
        selectedKey={activeTab}
        onSelectionChange={(key) => setTab(key as TabKey)}
        // 切換分頁時保留內容，避免驗證碼每次切回來都重新讀取金鑰（每次讀取都會記一筆紀錄）
        destroyInactiveTabPanel={false}
        classNames={{
          tabList: "flex-wrap gap-1 rounded-full bg-surface-1 p-1",
          tab: "h-9",
          tabContent: "text-[15px] text-ink-muted group-data-[selected=true]:text-ink",
          cursor: "bg-surface shadow-none",
          panel: "px-0 pt-6",
        }}
      >
        <Tab key="codes" title="驗證碼">
          <GroupCodes {...tabProps} />
        </Tab>
        <Tab key="members" title={`成員 ${detail.members.length}`}>
          <GroupMembers {...tabProps} adminMode={props.adminMode} />
        </Tab>
        <Tab key="roles" title="身分組">
          <GroupRoles {...tabProps} />
        </Tab>
        {visible.invites && (
          <Tab key="invites" title="邀請">
            <GroupInvites {...tabProps} />
          </Tab>
        )}
        <Tab key="settings" title="設定">
          <GroupSettings {...tabProps} exitHref={exitHref} />
        </Tab>
        {visible.audit && (
          <Tab key="audit" title="紀錄">
            <AuditLogList load={(before) => loadGroupAuditLog(gid, before)} />
          </Tab>
        )}
      </Tabs>
    </div>
  );
};

export default GroupView;
