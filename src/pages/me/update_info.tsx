import { User } from "firebase/auth";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Head from "next/head";
import { UserData } from "@/components/CheckLogin";
import { checkAuth, deleteAccount, getUserData, submitChange, syncGoogleUserData } from "@/lib/totp/account";
import ModalAlert from "@/components/Code/ModalAlert";

const UpdateInfo = () => {
  const [user, setUser] = useState<User>();
  const [userData, setUserData] = useState<UserData>(
    {
      uid: '',
      name: '',
      email: '',
      phoneNumber: '',
      photoURL: '',
      bgPhotoURL: '',
      emailVerified: false,
      metadata: {
        creationTime: '',
        lastSignInTime: ''
      },
      totp: []
    }

  );
  const router = useRouter();

  // 當使用者登入狀態改變時，檢查使用者驗證
  useEffect(() => {
    const unsubscribe = checkAuth((user, data) => {
      if (user) {
        setUser(user);
        if (data) {
          setUserData(data);
        } else {
          toast.error('找不到使用者資料！', { position: 'top-right' });
        }
      } else {
        setUser(undefined);
        router.push('/');
        toast.error('請先登入！', { position: 'top-right' });
      }
    });

    return () => unsubscribe();
  }, []);

  // 將 Google 資料同步到用戶資料
  const getGoogleData = async () => {
    await syncGoogleUserData(user as User)
      .then(() => {
        let user_data = user as User;
        setUserData({
          uid: user_data.uid,
          name: user_data.displayName ? user_data.displayName : '',
          email: user_data.email ? user_data.email : '',
          phoneNumber: user_data.phoneNumber ? user_data.phoneNumber : '',
          photoURL: user_data.photoURL ? user_data.photoURL : '',
          bgPhotoURL: '',
          emailVerified: user_data.emailVerified,
          metadata: {
            creationTime: user_data.metadata.creationTime as string,
            lastSignInTime: user_data.metadata.lastSignInTime as string
          },
          totp: []
        });
        toast.success('同步 Google 資料成功！', { position: 'top-right' });
      })
      .catch((error) => {
        toast.error(`同步 Google 資料失敗！\n錯誤訊息：${error.message}`, { position: 'top-right' });
      }
      );
  }

  // 獲取用戶資料
  const loadUserData = async (uid: string) => {
    const result = await getUserData(uid);
    if (result.success) {
      setUserData(result.data as UserData);  // 將資料設置到狀態
    } else {
      toast.error(`載入資料失敗！\n錯誤訊息：${result.message}`, { position: 'top-right' });
    }
  };

  // 更新用戶資料
  const handleSubmitChange = async (user: User) => {
    const updatedUserData = {
      email: userData.email,
      name: userData.name,
      phoneNumber: userData.phoneNumber,
      photoURL: userData.photoURL,
      bgPhotoURL: userData.bgPhotoURL,
      uid: userData.uid,
      emailVerified: userData.emailVerified,
      metadata: {
        creationTime: userData.metadata.creationTime,
        lastSignInTime: userData.metadata.lastSignInTime,
      },
      totp: userData.totp,
    };

    setUserData(updatedUserData);

    const result = await submitChange(user.uid, updatedUserData);
    if (result.success) {
      toast.success('修改成功！', { position: 'top-right' });
    } else {
      toast.error(`修改失敗！\n錯誤訊息：${result.message}`, { position: 'top-right' });
    }
  };

  // 刪除帳號
  const deleteAccountHandler = async (user: User) => {
    await deleteAccount(user)
      .then(() => {
        router.push('/');
        toast.success('刪除帳號成功！', { position: 'top-right' });
      })
      .catch((error) => {
        toast.error(`刪除帳號失敗！\n錯誤訊息：${error.message}`, { position: 'top-right' });
      });
  };

  return (
    <>
      <Head>
        <title>更改個人資料 - TOTP 2FA</title>
      </Head>
      <div className="container mx-auto pt-5 pl-5 pr-5">
        <div className="text-left text-gray-blue-500 dark:text-gray-blue-400 text-2xl">
          <p>
            更改個人資料
          </p>
        </div>

        <form className="mt-5">
          <div className="relative z-0 w-full mb-6 group">
            <input type="email" value={userData.email} disabled={true} name="email" id="email" className="block py-2.5 px-0 w-full text-sm text-gray-blue-900 bg-transparent border-0 border-b-2 border-gray-blue-300 appearance-none dark:text-white dark:border-gray-blue-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer cursor-not-allowed" placeholder=" " required />
            <label className="peer-focus:font-medium absolute text-sm text-gray-blue-500 dark:text-gray-blue-400 duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6">電子郵件(不可修改)</label>
          </div>
          <div className="grid md:grid-cols-2 md:gap-6">
            <div className="relative z-0 w-full mb-6 group">
              <input type="text" onChange={e => setUserData({ ...userData, name: e.target.value })} value={userData.name} name="name" id="name" className="block py-2.5 px-0 w-full text-sm text-gray-blue-900 bg-transparent border-0 border-b-2 border-gray-blue-300 appearance-none dark:text-white dark:border-gray-blue-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer" placeholder=" " required />
              <label className="peer-focus:font-medium absolute text-sm text-gray-blue-500 dark:text-gray-blue-400 duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6">姓名</label>
            </div>
            <div className="relative z-0 w-full mb-6 group">
              <input type="tel" onChange={e => setUserData({ ...userData, phoneNumber: e.target.value })} value={userData.phoneNumber ? userData.phoneNumber : ''} pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}" name="phoneNumber" id="phoneNumber" className="block py-2.5 px-0 w-full text-sm text-gray-blue-900 bg-transparent border-0 border-b-2 border-gray-blue-300 appearance-none dark:text-white dark:border-gray-blue-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer" placeholder=" " required />
              <label className="peer-focus:font-medium absolute text-sm text-gray-blue-500 dark:text-gray-blue-400 duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6">電話號碼</label>
            </div>
          </div>
          <div className="grid md:grid-cols-2 md:gap-6">
            <div className="relative z-0 w-full mb-6 group">
              <input type="text" onChange={e => setUserData({ ...userData, photoURL: e.target.value })} value={userData.photoURL} name="photoURL" id="photoURL" className="block py-2.5 px-0 w-full text-sm text-gray-blue-900 bg-transparent border-0 border-b-2 border-gray-blue-300 appearance-none dark:text-white dark:border-gray-blue-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer" placeholder=" " required />
              <label className="peer-focus:font-medium absolute text-sm text-gray-blue-500 dark:text-gray-blue-400 duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6">大頭照(URL)</label>
            </div>
            <div className="relative z-0 w-full mb-6 group">
              <input type="text" onChange={e => setUserData({ ...userData, bgPhotoURL: e.target.value })} value={userData.bgPhotoURL} name="bgPhotoURL" id="bgPhotoURL" className="block py-2.5 px-0 w-full text-sm text-gray-blue-900 bg-transparent border-0 border-b-2 border-gray-blue-300 appearance-none dark:text-white dark:border-gray-blue-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer" placeholder=" " required />
              <label className="peer-focus:font-medium absolute text-sm text-gray-blue-500 dark:text-gray-blue-400 duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6">背景圖片(URL)</label>
            </div>
          </div>
          <button type="submit" onClick={() => handleSubmitChange(user as User)} className="relative inline-flex items-center justify-center p-0.5 mb-2 mr-2 overflow-hidden text-sm font-medium text-gray-blue-900 rounded-lg group bg-gradient-to-br from-purple-600 to-blue-500 group-hover:from-purple-600 group-hover:to-blue-500 hover:text-white dark:text-white focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800">
            <span className="relative px-5 py-2.5 transition-all ease-in duration-75 bg-white dark:bg-gray-blue-900 rounded-md group-hover:bg-opacity-0">
              修改
            </span>
          </button>

          <button
            type="submit"
            onClick={getGoogleData}
            className="relative inline-flex items-center justify-center p-0.5 mb-2 mr-2 overflow-hidden text-sm font-medium text-gray-blue-900 rounded-lg group bg-gradient-to-br from-cyan-500 to-blue-500 group-hover:from-cyan-500 group-hover:to-blue-500 hover:text-white dark:text-white focus:ring-4 focus:outline-none focus:ring-cyan-200 dark:focus:ring-cyan-800"
          >
            <span className="relative px-5 py-2.5 transition-all ease-in duration-75 bg-white dark:bg-gray-blue-900 rounded-md group-hover:bg-opacity-0">
              同步 Google 資料
            </span>
          </button>

          <ModalAlert
            deleteTOTP={() => deleteAccountHandler(user as User)}
          >
            <button type="button" className="relative inline-flex items-center justify-center p-0.5 mb-2 mr-2 overflow-hidden text-sm font-medium rounded-lg group bg-gradient-to-br focus:outline-none text-gray-blue-900 dark:text-white bg-red-500 hover:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-900">
              <span className="relative px-5 py-2.5 transition-all ease-in duration-75 bg-white dark:bg-gray-blue-900 rounded-md group-hover:bg-opacity-0">
                刪除帳戶
              </span>
            </button>
          </ModalAlert>
        </form>
      </div>
    </>
  )
}

export default UpdateInfo;