import { NextRequest, NextResponse } from 'next/server';
import { authenticate, jsonError } from '@/lib/server/supabaseAdmin';

// 刪除自己的帳戶：需要 service_role 金鑰（僅後端，切勿外洩）才能刪除 auth 使用者
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  // 以 token 反查使用者，確保只能刪除「自己」
  const { admin, asUser } = auth;
  const uid = auth.user.id;

  // 還擁有群組（groups.owner_id 沒有 cascade）或是最後一位管理員時不能刪，訊息由資料庫給
  // （PGRST202 = 函式不存在，代表 0009 還沒執行、也就不會有群組與身分組）
  const { error: checkError } = await asUser.rpc('can_delete_self');
  if (checkError && checkError.code !== 'PGRST202') {
    return jsonError(checkError.message, 400);
  }

  // 先刪 profile（auth 使用者刪除時亦會 cascade，這裡先行確保乾淨）
  const { error: profileError } = await admin.from('profiles').delete().eq('id', uid);
  if (profileError) {
    return jsonError(profileError.message, 500);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
  if (deleteError) {
    return jsonError(deleteError.message, 500);
  }

  return NextResponse.json({ success: true });
}
