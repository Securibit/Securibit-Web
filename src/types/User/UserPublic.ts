import { RoleBrief } from "@/types/Permission/Permission";

// user_public() 的回傳：別人的個人頁面看得到的公開資料（不含 email、電話、登入紀錄、驗證碼）
export interface UserPublic {
  id: string;
  name: string;
  username: string | null;
  photo_url: string | null;
  // 帳號建立時間
  created_at: string | null;
  // 全站身分組，不含 @everyone，由高到低
  site_roles: RoleBrief[];
  // 我和對方同時是成員的群組
  shared_groups: { id: string; name: string }[];
}
