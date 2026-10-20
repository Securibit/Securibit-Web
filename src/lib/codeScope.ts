// 驗證碼頁目前看的是「我的」還是哪個群組，記在這個瀏覽器；空字串代表我的
const SCOPE_KEY = 'securibit:codeScope';

export const readCodeScope = () => {
  try {
    return localStorage.getItem(SCOPE_KEY) ?? '';
  } catch {
    return '';
  }
};

export const writeCodeScope = (gid: string) => {
  try {
    localStorage.setItem(SCOPE_KEY, gid);
  } catch {
    // 存不了就只在這次有效
  }
};
