import { rpc } from '@/lib/rpc';
import { auditActionText } from '@/lib/permissions/auditActions';
import { AccountActivity, ActivityViewer, LoginRecord } from '@/types/Activity/Activity';
import { Result, UserBrief } from '@/types/Permission/Permission';

// 函式不存在（還沒執行 0014）時改成提示要執行哪個 migration
const MIGRATION = '0014_activity_log.sql';
const withHint = <T>(fn: string, result: Result<T>): Result<T> =>
  result.success || !result.message.includes(`「${fn}」`)
    ? result
    : { success: false, message: `資料庫還沒更新，請先在 Supabase 執行 ${MIGRATION}。` };

const call = async <T>(fn: string, args: Record<string, unknown>): Promise<Result<T[]>> => {
  const result = withHint(fn, await rpc<T[] | null>(fn, args));
  return result.success ? { success: true, data: result.data ?? [] } : result;
};

// ---------- RPC ----------

export const loadMyLoginHistory = (beforeId: number | null, pageSize: number) =>
  call<LoginRecord>('my_login_history', { before_id: beforeId, page_size: pageSize });

export const loadMyAccountActivity = (beforeId: number | null, pageSize: number) =>
  call<AccountActivity>('my_account_activity', { before_id: beforeId, page_size: pageSize });

export const loadAdminUserLoginHistory = (userId: string, beforeId: number | null, pageSize: number) =>
  call<LoginRecord>('admin_user_login_history', { user_id: userId, before_id: beforeId, page_size: pageSize });

export const loadAdminUserActivity = (userId: string, beforeId: number | null, pageSize: number) =>
  call<AccountActivity>('admin_user_activity', { user_id: userId, before_id: beforeId, page_size: pageSize });

// ---------- 顯示 ----------

const PROVIDER_TEXT: Record<string, string> = { google: 'Google', email: 'Email' };

// 登入方式的顯示文字
export const providerText = (provider: string | null) =>
  provider ? (PROVIDER_TEXT[provider] ?? provider) : '未知方式';

const str = (value: unknown) => (typeof value === 'string' && value ? value : null);
const names = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && !!v) : [];
const quoted = (list: string[]) => list.map((name) => `「${name}」`).join('、');

// 操作者的稱呼：名稱 → @ID → email
const actorName = (actor: UserBrief | null) =>
  actor ? actor.name || (actor.username ? `@${actor.username}` : '') || actor.email || '某位使用者' : '系統';

// 「X 從 a 改成 b」；沒有舊值時是「設定 X 為 b」，沒有新值時是「清除 X（原本是 a）」
// quote：值加上「」（名稱、群組名）；不加時前後留空白（電話、email）
const changeText = (label: string, oldValue: string | null, newValue: string | null, quote = false) => {
  const v = (value: string) => (quote ? `「${value}」` : ` ${value} `);
  if (oldValue && newValue) return `${label}從${v(oldValue)}改成${v(newValue)}`.trim();
  if (newValue) return `設定${label}為${v(newValue)}`.trim();
  if (oldValue) return `清除${label}（原本是${quote ? v(oldValue) : oldValue}）`;
  return `變更${label}`;
};

// @ID 的變更（不加引號，和網址上的寫法一樣）
const usernameText = (oldValue: string | null, newValue: string | null) => {
  if (oldValue && newValue) return `@ID 從 ${oldValue} 改成 ${newValue}`;
  if (newValue) return `設定 @ID 為 ${newValue}`;
  if (oldValue) return `清除 @ID（原本是 ${oldValue}）`;
  return '變更 @ID';
};

/**
 * 一筆帳號操作紀錄的中文描述，例如「@ID 從 andy 改成 andy.chen」「管理員 X 查看了你的 2FA」。
 * subjectId：這些紀錄是誰的；viewer：本人看用「你」，後台看用「他」
 */
export const describeActivity = (log: AccountActivity, subjectId: string, viewer: ActivityViewer): string => {
  const d = log.detail ?? {};
  const you = viewer === 'self' ? '你' : '他';
  const byOther = !!log.actor && log.actor.id !== subjectId;
  const name = actorName(log.actor);
  // 本人做的不加；別人（管理員）做的、系統做的在後面註明
  const suffix = !log.actor ? '（系統）' : byOther ? `（由 ${name}）` : '';
  const admin = `管理員 ${name}`;
  const group = log.group?.name ?? str(d.name) ?? '已刪除的群組';

  switch (log.action) {
    case 'user.username':
      return usernameText(str(d.old), str(d.new)) + suffix;
    case 'user.name':
      return changeText('名稱', str(d.old), str(d.new), true) + suffix;
    case 'user.photo':
      return (str(d.new) ? '更換了大頭照' : '移除了大頭照') + suffix;
    case 'user.background':
      return (str(d.new) ? '更換了背景圖' : '移除了背景圖') + suffix;
    case 'user.phone':
      return changeText('電話', str(d.old), str(d.new)) + suffix;
    case 'user.email':
      return `${changeText('電子郵件', str(d.old), str(d.new))}${log.actor ? suffix : '（從登入帳號同步）'}`;
    case 'user.vault.enable':
      return `啟用金鑰加密${suffix}`;
    case 'user.vault.password':
      return `變更加密密碼${suffix}`;
    case 'user.vault.disable':
      return `停用金鑰加密${suffix}`;
    case 'user.vault.reset':
      return `忘記加密密碼並重設（已加密的驗證碼一併刪除）${suffix}`;
    case 'user.default_group':
      return changeText('預設群組', str(d.old), str(d.new), true) + suffix;
    case 'site.user.update': {
      const parts = [
        str(d.old_name) !== str(d.name) ? changeText('名稱', str(d.old_name), str(d.name), true) : null,
        str(d.old_username) !== str(d.username) ? usernameText(str(d.old_username), str(d.username)) : null,
      ].filter(Boolean);
      return `${admin} 修改了${you}的資料${parts.length ? `：${parts.join('、')}` : ''}`;
    }
    case 'site.user.roles': {
      const added = names(d.added_names);
      const removed = names(d.removed_names);
      const who = log.actor ? admin : '系統';
      const parts = [
        added.length ? `指派身分組 ${quoted(added)}` : null,
        removed.length ? `移除身分組 ${quoted(removed)}` : null,
      ].filter(Boolean);
      return parts.length ? `${who} ${parts.join('，並')}` : `${who} 變更了${you}的身分組`;
    }
    case 'site.user.totp.view':
      return `${admin} 查看了${you}的 2FA`;
    case 'site.user.totp.update':
      return `${admin} 修改了${you}的 2FA${str(d.item_name) ? `「${str(d.item_name)}」` : ''}`;
    case 'site.user.totp.delete':
      return `${admin} 刪除了${you}的 2FA${str(d.item_name) ? `「${str(d.item_name)}」` : ''}`;
    case 'group.member.join':
      return `加入群組「${group}」`;
    case 'group.member.add':
      return `${admin} 把${you}加入群組「${group}」`;
    case 'group.member.leave':
      return `離開群組「${group}」`;
    case 'group.member.kick':
      return `被 ${name} 移出群組「${group}」`;
    case 'group.encryption.enable':
      return `開啟群組「${group}」的加密`;
    case 'group.encryption.disable':
      return d.reset ? `重設加密密碼，群組「${group}」改成不加密` : `關閉群組「${group}」的加密`;
    default:
      return auditActionText(log.action);
  }
};
