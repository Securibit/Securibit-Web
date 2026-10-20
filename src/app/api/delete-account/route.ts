import { NextRequest, NextResponse } from 'next/server';
import { authenticate, rpcError, serverError } from '@/lib/server/supabaseAdmin';

// 刪除自己的帳戶：需要 service_role 金鑰（僅後端，切勿外洩）才能刪除 auth 使用者
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  // 以 token 反查使用者，確保只能刪除「自己」
  const { admin, asUser } = auth;
  const uid = auth.user.id;

  // 還擁有「有其他成員」的群組或是最後一位管理員時不能刪，訊息由資料庫給；
  // 只有自己一個人的群組（含預設群組）會在刪除 profile 時由 0011 的觸發器一起刪掉
  // （PGRST202 = 函式不存在，代表 0009 還沒執行、也就不會有群組與身分組）
  const { error: checkError } = await asUser.rpc('can_delete_self');
  if (checkError && checkError.code !== 'PGRST202') {
    return rpcError('can_delete_self 失敗', checkError, 400);
  }

  // 直接刪 auth 使用者：profiles.id references auth.users on delete cascade，
  // profile 與底下資料會在同一個交易裡一起刪掉；失敗時整筆回滾，不會留下沒有 profile 的帳號
  const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
  if (deleteError) return serverError('刪除帳戶失敗', deleteError);

  return NextResponse.json({ success: true });
}
