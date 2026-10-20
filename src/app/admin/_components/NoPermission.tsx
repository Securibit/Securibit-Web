import { NoPermissionProps } from "@/types/Admin/NoPermission";

// 有進入後台、但沒有這個頁面需要的權限：斜線填充的空狀態
const NoPermission = (props: NoPermissionProps) => (
  <div className="hatch border border-line p-10 text-center">
    <p className="tech-label">ACCESS DENIED</p>
    <p className="mt-2 font-display text-lg font-semibold text-ink">沒有權限</p>
    <p className="mt-1 text-sm text-ink-muted">
      這個頁面需要「{props.permission}」權限，請聯絡管理員。
    </p>
  </div>
);

export default NoPermission;
