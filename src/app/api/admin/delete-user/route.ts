import { NextRequest, NextResponse } from 'next/server';
import { authenticate, jsonError, rpcError, serverError } from '@/lib/server/supabaseAdmin';

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
  if (checkError) return rpcError('admin_can_delete_user 失敗', checkError, 403);

  // 先讀對方的 email 與名稱留在紀錄裡（刪除後就查不到了）
  const { data: profile } = await admin.from('profiles').select('email, name').eq('id', userId).maybeSingle();
  let email: string | null = profile?.email ?? null;
  if (!email) {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    email = authUser?.user?.email ?? null;
  }

  // 紀錄寫不進去就不刪，確保每次刪除都有紀錄
  const { data: log, error: logError } = await admin
    .from('audit_logs')
    .insert({
      actor_id: user.id,
      action: 'site.user.delete',
      target_type: 'user',
      target_id: userId,
      detail: { email, name: profile?.name ?? null },
    })
    .select('id')
    .single();
  if (logError) return serverError('寫入操作紀錄失敗', logError);

  // 直接刪 auth 使用者：profiles.id references auth.users on delete cascade，
  // profile 與底下資料會在同一個交易裡一起刪掉；失敗時整筆回滾
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    // 沒刪成就撤回剛寫的紀錄，免得紀錄說刪了、人卻還在
    if (log?.id != null) await admin.from('audit_logs').delete().eq('id', log.id);
    return serverError('刪除使用者失敗', deleteError);
  }

  return NextResponse.json({ success: true });
}
