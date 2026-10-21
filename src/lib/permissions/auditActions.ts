// 操作紀錄的 action 對應的中文說明（與 docs/groups-and-permissions.md 一致）
export const AUDIT_ACTION_TEXT: Record<string, string> = {
  'site.role.create': '建立身分組',
  'site.role.update': '編輯身分組',
  'site.role.delete': '刪除身分組',
  'site.role.reorder': '調整身分組順序',
  'site.user.roles': '變更使用者身分組',
  'site.user.update': '修改使用者資料',
  'site.user.delete': '刪除使用者',
  'site.user.totp.view': '查看使用者的 2FA',
  'site.user.totp.update': '修改使用者的 2FA',
  'site.user.totp.delete': '刪除使用者的 2FA',
  'group.create': '建立群組',
  'group.update': '修改群組資料',
  'group.transfer': '轉移擁有權',
  'group.role.create': '建立身分組',
  'group.role.update': '編輯身分組',
  'group.role.delete': '刪除身分組',
  'group.role.reorder': '調整身分組順序',
  'group.member.roles': '變更成員身分組',
  'group.member.kick': '移除成員',
  'group.member.join': '加入群組',
  'group.member.add': '直接加入成員',
  'group.member.leave': '離開群組',
  'group.invite.create': '建立邀請連結',
  'group.invite.revoke': '撤銷邀請連結',
  'group.invite.email': '邀請使用者',
  'group.account.create': '新增驗證碼',
  'group.account.update': '編輯驗證碼',
  'group.account.delete': '刪除驗證碼',
  'group.account.overwrite': '變更驗證碼權限',
  'group.account.secret.view': '查看金鑰',
  'group.account.clear': '清空驗證碼',
  'group.encryption.enable': '開啟加密',
  'group.encryption.disable': '關閉加密',
  // 使用者的帳號變更（0014；target_type 'user'）
  'user.username': '變更 @ID',
  'user.name': '變更名稱',
  'user.photo': '變更大頭照',
  'user.background': '變更背景圖',
  'user.phone': '變更電話',
  'user.email': '變更電子郵件',
  'user.vault.enable': '啟用金鑰加密',
  'user.vault.password': '變更加密密碼',
  'user.vault.disable': '停用金鑰加密',
  'user.vault.reset': '重設加密密碼',
  'user.default_group': '變更預設群組',
};

export const auditActionText = (action: string) => AUDIT_ACTION_TEXT[action] ?? action;

// 帳號變更（user.*）的「舊值 → 新值」，給全站操作紀錄顯示；圖片網址太長不顯示
const CHANGE_ACTIONS = new Set(['user.username', 'user.name', 'user.phone', 'user.email', 'user.default_group']);

export const auditChangeText = (action: string, detail: Record<string, unknown> | null | undefined) => {
  if (!CHANGE_ACTIONS.has(action) || !detail) return null;
  const show = (value: unknown) => (typeof value === 'string' && value ? value : '（無）');
  return `${show(detail.old)} → ${show(detail.new)}`;
};
