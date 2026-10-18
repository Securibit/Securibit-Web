import { Profile } from "./Profile";
import { RoleBrief } from "@/types/Permission/Permission";

export interface PersonalCardProps {
  profile: Profile;
  // 全站身分組（不含 @everyone，由高到低）
  siteRoles?: RoleBrief[];
}
