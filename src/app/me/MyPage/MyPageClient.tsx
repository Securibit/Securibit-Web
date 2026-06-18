"use client";

import { useRouter } from "next-nprogress-bar";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import PersonalCard from "@/components/PersonalCard";
import { UserData } from "@/components/CheckLogin";
import { AppUser } from "@/types/authUser";
import { checkAuth } from "@/lib/totp/account";

const MyPageClient = () => {
  const [user, setUser] = useState<AppUser>();
  const [userData, setUserData] = useState<UserData>();
  const router = useRouter();

  // 一進頁面就驗證，如果沒登入就導回首頁
  useEffect(() => {
    const unsubscribe = checkAuth((authUser, data) => {
      if (authUser) {
        setUser(authUser);
        setUserData(data);
      } else {
        setUser(undefined);
        router.push('/');
        toast.error("驗證失敗！請先登入！", {
          position: "top-right"
        });
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container mx-auto pt-5 pl-5 pr-5">
      <div className="text-left text-gray-blue-500 dark:text-gray-blue-400 text-2xl">
        <p>
          個人頁面
        </p>
        <PersonalCard
          name={userData?.name || ''}
          email={userData?.email || ''}
          photoURL={userData?.photoURL || ''}
          bgPhotoURL={userData?.bgPhotoURL || ''}
          emailVerified={userData?.emailVerified || false}
          phoneNumber={userData?.phoneNumber || ''}
          uid={userData?.uid || ''}
          metadata={{
            creationTime: userData?.metadata.creationTime || '',
            lastSignInTime: userData?.metadata.lastSignInTime || ''
          }}
          lastLoginAt={userData?.lastLoginAt}
          lastLoginIp={userData?.lastLoginIp}
          lastLoginDevice={userData?.lastLoginDevice}
        ></PersonalCard>
      </div>
    </div>
  );
};

export default MyPageClient;
