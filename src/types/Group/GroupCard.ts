import { GroupSummary } from "@/types/Group/Group";

export interface GroupCardProps {
  group: GroupSummary;
  onOpen: () => void;
}
