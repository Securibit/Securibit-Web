import { Profile } from "./Profile";
import { RoleBrief } from "@/types/Permission/Permission";

export interface PersonalCardProps {
  profile: Profile;
  // 全站身分組（不含 @everyone，由高到低）
  siteRoles?: RoleBrief[];
  // 放在「登出」上面的其他分組（例如登入紀錄、操作紀錄）
  children?: React.ReactNode;
}
