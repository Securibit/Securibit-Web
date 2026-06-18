import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 此 API 需要 service_role 金鑰（僅後端，切勿外洩）才能刪除 auth 使用者
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ message: '伺服器未設定 Supabase service role' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return NextResponse.json({ message: '未提供授權憑證' }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 以 token 反查使用者，確保只能刪除「自己」
  const { data: userResult, error: userError } = await admin.auth.getUser(token);
  if (userError || !userResult?.user) {
    return NextResponse.json({ message: '無效的授權憑證' }, { status: 401 });
  }

  const uid = userResult.user.id;

  // 先刪 profile（auth 使用者刪除時亦會 cascade，這裡先行確保乾淨）
  await admin.from('profiles').delete().eq('id', uid);

  const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
  if (deleteError) {
    return NextResponse.json({ message: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
