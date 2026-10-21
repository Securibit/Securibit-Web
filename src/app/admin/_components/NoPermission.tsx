import { NoPermissionProps } from "@/types/Admin/NoPermission";

// 有進入後台、但沒有這個頁面需要的權限
const NoPermission = (props: NoPermissionProps) => (
  <div className="rounded-[18px] bg-surface-1 px-6 py-16 text-center">
    <p className="text-[19px] font-semibold">沒有權限</p>
    <p className="mt-1 text-ink-muted">這個頁面需要「{props.permission}」權限，請聯絡管理員</p>
  </div>
);

export default NoPermission;
