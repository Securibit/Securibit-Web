"use client";
/* eslint-disable @next/next/no-img-element */
import { supabase } from "@/config/supabase";
import {useRouter} from "next-nprogress-bar";
import toast from "react-hot-toast";

interface Props {
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
}

// 將 ISO 時間轉成在地可讀格式
const fmt = (iso?: string) => {
  if (!iso) return '無';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('zh-TW');
};

const PersonalCard = (props: Props) => {
  const router = useRouter();

  const logout_btn = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(`登出失敗！\n錯誤訊息：\n${error.message}`, {
        position: "top-right"
      });
    } else {
      toast.success('登出成功！', {
        position: "top-right"
      });
    }
    router.push('/');
  }

  return (
    <>
      <div className="w-full bg-white border border-gray-blue-200 rounded-lg shadow dark:bg-gray-blue-800 dark:border-gray-blue-700">
        <div className="flex flex-col items-center pb-10">
          <div className="relative mb-3 mt-3">
            <img className="w-24 h-24 shadow-lg p-1 rounded-full ring-2 ring-gray-blue-300 dark:ring-gray-blue-" src={props.photoURL} alt="Bonnie image" />
            <span className="right-1 bottom-1 absolute  w-5 h-5 bg-green-400 border-2 border-white dark:border-gray-blue-800 rounded-full"></span>
          </div>

          <h5 className="mb-1 text-xl font-medium text-gray-blue-900 dark:text-white">{ props.name }</h5>
          {/* <span className="text-sm text-gray-blue-500 dark:text-gray-blue-400">{ props.email }</span>
          <span className="text-sm text-gray-blue-700 dark:text-gray-blue-300">UID: {props.uid}</span> */}
          
          <table className="text-sm my-3">
            <tbody>
              <tr>
                <td className="px-2 py-2 text-gray-blue-500 font-semibold">Email</td>
                <td className="px-2 py-2">{ props.email }</td>
              </tr>
              <tr>
                <td className="px-2 py-2 text-gray-blue-500 font-semibold">手機號碼</td>
                <td className="px-2 py-2">{ props.phoneNumber? props.phoneNumber: '無' }</td>
              </tr>
              <tr>
                <td className="px-2 py-2 text-gray-blue-500 font-semibold">Email 是否驗證</td>
                <td className="px-2 py-2">{ props.emailVerified ? '是' : '否' }</td>
              </tr>
              <tr>
                <td className="px-2 py-2 text-gray-blue-500 font-semibold">創建時間</td>
                <td className="px-2 py-2">{ props.metadata.creationTime }</td>
              </tr>
              <tr>
                <td className="px-2 py-2 text-gray-blue-500 font-semibold">最後登入時間</td>
                <td className="px-2 py-2">{ fmt(props.lastLoginAt) }</td>
              </tr>
              <tr>
                <td className="px-2 py-2 text-gray-blue-500 font-semibold">最後登入 IP</td>
                <td className="px-2 py-2">{ props.lastLoginIp || '無' }</td>
              </tr>
              <tr>
                <td className="px-2 py-2 text-gray-blue-500 font-semibold">最後登入裝置</td>
                <td className="px-2 py-2">{ props.lastLoginDevice || '無' }</td>
              </tr>
              <tr>
                <td className="px-2 py-2 text-gray-blue-500 font-semibold">UID</td>
                <td className="px-2 py-2">{props.uid}</td>
              </tr>
            </tbody>
          </table>
          
          <div className="flex mt-4 space-x-3 md:mt-6">
            <button onClick={() => router.push('/me/update_info')} className="inline-flex items-center px-4 py-2 text-sm font-medium text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 focus:outline-none dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-900">管理帳戶</button>
            <button onClick={logout_btn} className="inline-flex items-center px-4 py-2 text-sm font-medium text-center text-gray-blue-900 bg-white border border-gray-blue-300 rounded-lg hover:bg-gray-blue-100 focus:ring-4 focus:outline-none focus:ring-gray-blue-200 dark:bg-gray-blue-800 dark:text-white dark:border-gray-blue-600 dark:hover:bg-gray-blue-700 dark:hover:border-gray-blue-700 dark:focus:ring-gray-blue-700">登出帳戶</button>
          </div>
        </div>
      </div>
    </>
  )
}

export default PersonalCard;