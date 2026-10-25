import { AppUser } from "@/types/authUser";
import { Profile } from "@/types/Profile/Profile";
import { RoleBrief } from "@/types/Permission/Permission";

// me_permissions()：自己的全站權限
export interface SiteAccess {
  // 已展開（有管理員時是全部權限）
  permissions: number;
  top_position: number;
  // 是不是全站擁有者（唯一不受全站階層限制的人；舊資料庫沒有這個欄位）
  is_owner?: boolean;
  // 不含 @everyone，由高到低
  roles: RoleBrief[];
}

export interface AuthContextValue {
  // 第一次確認登入狀態（含載入 profile）完成前為 true
  loading: boolean;
  user?: AppUser;
  profile?: Profile;
  // 全站權限（未登入為 0）
  permissions: number;
  // 自己最高身分組的 position
  topPosition: number;
  siteRoles: RoleBrief[];
  // 是不是全站擁有者
  isSiteOwner: boolean;
  // 是否擁有某個全站權限（見 lib/permissions/bits.ts 的 SITE）
  can: (bit: number) => boolean;
  // 重新讀取 profile（修改個人資料後使用），回傳最新資料
  refresh: () => Promise<Profile | undefined>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}
