// 定義使用者資料格式
export interface UserData {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
  bgPhotoURL: string;
  emailVerified: boolean;
  phoneNumber: string;
  metadata: {
    creationTime: string;
    lastSignInTime: string;
  };
  lastLoginAt?: string;
  lastLoginIp?: string;
  lastLoginDevice?: string;
  totp: any[];
}
