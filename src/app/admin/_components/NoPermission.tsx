import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { NoPermissionProps } from "@/types/Admin/NoPermission";

// 有進入後台、但沒有這個頁面需要的權限
const NoPermission = (props: NoPermissionProps) => (
  <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-blue-200 py-16 text-center dark:border-gray-blue-700">
    <FontAwesomeIcon icon={faLock} className="h-8 w-8 text-gray-blue-400" />
    <p className="text-lg font-semibold text-gray-blue-900 dark:text-white">沒有權限</p>
    <p className="text-sm text-gray-blue-500 dark:text-gray-blue-400">
      這個頁面需要「{props.permission}」權限，請聯絡管理員。
    </p>
  </div>
);

export default NoPermission;
