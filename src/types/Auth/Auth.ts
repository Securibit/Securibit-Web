import { AppUser } from "@/types/authUser";
import { Profile } from "@/types/Profile/Profile";

export interface AuthContextValue {
  // 第一次確認登入狀態（含載入 profile）完成前為 true
  loading: boolean;
  user?: AppUser;
  profile?: Profile;
  // 重新讀取 profile（修改個人資料後使用），回傳最新資料
  refresh: () => Promise<Profile | undefined>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}
