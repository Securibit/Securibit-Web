import { supabase } from '@/config/supabase';
import { UserData, totpItems } from '@/types/userData';

// Check user data
export const loadUserData = async (uid: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle();

  if (error) {
    return { success: false, message: error.message };
  }
  if (!data) {
    return { success: false, message: '找不到使用者資料' };
  }
  return { success: true, data: { uid: data.id, totp: data.totp ?? [] } as UserData };
};

// add TOTP item
export const addTotp = async (
  uid: string,
  totp: { name: string; secret: string; category: string }
): Promise<{ success: boolean; message?: string }> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('totp')
    .eq('id', uid)
    .maybeSingle();

  if (error) {
    return { success: false, message: error.message };
  }
  if (!data) {
    return { success: false, message: '未找到匹配 UID 的資料' };
  }

  const current = (data.totp ?? []) as totpItems[];
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ totp: [...current, totp] })
    .eq('id', uid);

  if (updateError) {
    return { success: false, message: updateError.message };
  }
  return { success: true };
};

// Delete TOTP item
export const deleteTotpItem = async (uid: string, totpCode: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('totp')
    .eq('id', uid)
    .maybeSingle();

  if (error) {
    return { success: false, message: error.message };
  }
  if (!data) {
    return { success: false, message: '找不到 TOTP 項目' };
  }

  const newTotpArray = ((data.totp ?? []) as totpItems[]).filter(
    (item) => item.secret !== totpCode
  );
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ totp: newTotpArray })
    .eq('id', uid);

  if (updateError) {
    return { success: false, message: updateError.message };
  }
  return { success: true };
};

// Clear TOTP items
export const clearTotpItems = async (uid: string) => {
  const { error } = await supabase
    .from('profiles')
    .update({ totp: [] })
    .eq('id', uid);

  if (error) {
    return { success: false, message: error.message };
  }
  return { success: true };
};

// check if the input is a base32 string
export const isBase32 = (input: string) => {
  const regex = /^[A-Z2-7]+=*$/;
  return regex.test(input);
};
