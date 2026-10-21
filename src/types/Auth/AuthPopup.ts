// 彈出視窗登入完成後，callback 頁透過 BroadcastChannel 通知原本的頁面
export type AuthPopupMessage =
  | { type: 'signed-in'; accessToken: string; refreshToken: string }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };
