import { NextRequest, NextResponse } from 'next/server';
import { authenticate, jsonError } from '@/lib/server/supabaseAdmin';

// 後台刪除使用者：先以呼叫者身分檢查權限（admin_can_delete_user），通過才用 service role 刪除
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;
  const { user, admin, asUser } = auth;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  if (!userId) return jsonError('缺少使用者 ID', 400);

  // 權限、階層、不是自己、不是最後一位管理員、沒有擁有群組；不通過時資料庫會 raise 說明原因
  const { error: checkError } = await asUser.rpc('admin_can_delete_user', { user_id: userId });
  if (checkError) return jsonError(checkError.message, 403);

  // 先讀對方的 email 與名稱留在紀錄裡（刪除後就查不到了）
  const { data: profile } = await admin.from('profiles').select('email, name').eq('id', userId).maybeSingle();
  let email: string | null = profile?.email ?? null;
  if (!email) {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    email = authUser?.user?.email ?? null;
  }

  // 紀錄寫不進去就不刪，確保每次刪除都有紀錄
  const { error: logError } = await admin.from('audit_logs').insert({
    actor_id: user.id,
    action: 'site.user.delete',
    target_type: 'user',
    target_id: userId,
    detail: { email, name: profile?.name ?? null },
  });
  if (logError) return jsonError(`寫入操作紀錄失敗：${logError.message}`, 500);

  // 先刪 profile（auth 使用者刪除時也會 cascade，這裡先確保乾淨）
  const { error: profileError } = await admin.from('profiles').delete().eq('id', userId);
  if (profileError) return jsonError(`刪除使用者資料失敗：${profileError.message}`, 500);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return jsonError(deleteError.message, 500);

  return NextResponse.json({ success: true });
}
