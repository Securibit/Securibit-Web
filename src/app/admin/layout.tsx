import PageContent from "@/components/layout/PageContent";
import { LayoutData } from "@/types/Layout/Layout";
import AdminNav from "./_components/AdminNav";

// 後台共用外框：左側窄側欄（手機是頂部 tabs）+ 內容（進入後台的權限由 AuthGate 檢查，各頁再檢查自己需要的權限）
const AdminLayout = ({ children }: LayoutData) => (
  <PageContent>
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      <AdminNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  </PageContent>
);

export default AdminLayout;
