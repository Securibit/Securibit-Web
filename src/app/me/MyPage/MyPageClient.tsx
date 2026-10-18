"use client";

import PersonalCard from "@/components/PersonalCard";
import useAuth from "@/components/auth/useAuth";

const MyPageClient = () => {
  // 登入與 profile 載入由 AuthGate / AuthProvider 處理
  const { profile } = useAuth();

  return (
    <div className="container mx-auto pt-5 pl-5 pr-5">
      <div className="text-left text-gray-blue-500 dark:text-gray-blue-400 text-2xl">
        <p>
          個人頁面
        </p>
        <PersonalCard
          name={profile?.name || ''}
          email={profile?.email || ''}
          photoURL={profile?.photoURL || ''}
          bgPhotoURL={profile?.bgPhotoURL || ''}
          emailVerified={profile?.emailVerified || false}
          phoneNumber={profile?.phoneNumber || ''}
          uid={profile?.uid || ''}
          metadata={{
            creationTime: profile?.metadata.creationTime || '',
            lastSignInTime: profile?.metadata.lastSignInTime || ''
          }}
          lastLoginAt={profile?.lastLoginAt}
          lastLoginIp={profile?.lastLoginIp}
          lastLoginDevice={profile?.lastLoginDevice}
        ></PersonalCard>
      </div>
    </div>
  );
};

export default MyPageClient;
