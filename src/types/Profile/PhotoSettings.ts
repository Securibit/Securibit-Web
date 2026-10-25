// 帳戶設定的大頭照 / 背景圖（選好圖片先預覽，按「上傳」才送出）
export interface PhotoPreviewState {
  kind: 'avatar' | 'background';
  file: File;
  // URL.createObjectURL 的預覽網址，關閉時要 revoke
  url: string;
}
