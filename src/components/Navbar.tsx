/* eslint-disable @next/next/no-img-element */
/* eslint-disable @next/next/no-html-link-for-pages */

import { faKey, faPlus, faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Themes from "./Themes";
import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import Image from "next/image";
import { IconButton } from "@material-tailwind/react";
import Sidebar from "./Sidebar/Sidebar";
import { UserData } from '@/types/userData';
import { Bars3Icon } from '@heroicons/react/24/solid';
import { checkAuth, handleGoogleLogin, logout } from "@/lib/totp/account";

// 整個 Navbar
const Navbar = () => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [userData, setUserData] = useState<UserData | undefined>();
  const [user, setUser] = useState<User | undefined>();

  // 登入
  const handleLogin = async () => {
    const result = await handleGoogleLogin();

    if (result.success) {
      toast.success('登入成功！', { position: 'top-right' });
    } else {
      toast.error(`登入失敗！\n失敗原因：${result.message}`, { position: 'top-right' });
    }
  };

  // 登出
  const handleLogout = async () => {
    const result = await logout();

    if (result.success) {
      toast.success('登出成功！', { position: 'top-right' });
    } else {
      toast.error(`登出失敗！\n錯誤訊息：${result.message}`, { position: 'top-right' });
    }
  };

  // 當使用者登入狀態改變時，檢查使用者驗證
  useEffect(() => {
    const unsubscribe = checkAuth((user, data) => {
      if (user) {
        setUser(user);
        if (data) {
          setUserData(data);
        }
      } else {
        setUser(undefined);
      }
    });

    return () => unsubscribe();
  }, []);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <nav className="bg-[rgba(41,44,53,0.1)] dark:bg-[rgba(41,44,53,0.3)]">
      <div className="mx-auto px-2 sm:px-6 lg:px-5">
        <div className="relative flex h-16 items-center justify-between">
          <div className="absolute inset-y-0 left-0 flex items-center sm:hidden">
            <></>
          </div>
          {/* Logo */}
          <button
            className="flex items-center gap-2"
            onClick={() => router.push('/')}
          >
            <Image
              src="/imgs/bityo_bg_circle.png"
              alt="about-image"
              width={1920}
              height={1920}
              className="h-8 w-auto drop-shadow-three dark:drop-shadow-none lg:mr-0"
            />
            <p>TOTP 2FA 驗證器</p>
          </button>
          <div className="absolute right-0 flex items-center gap-7 pr-2 sm:pr-0">
            {/* 首頁 */}

            {/* 驗證碼 */}
            {
              user && <button
                onClick={() => { router.push('/code') }}
                className="hidden md:flex gap-2 items-center"
              >
                <FontAwesomeIcon icon={faKey} className="w-4" />
                <p>驗證碼</p>
              </button>
            }

            {/* 新增驗證碼 */}
            {
              user && <button
                onClick={() => { router.push('/addCode') }}
                className="hidden md:flex gap-2 items-center"
              >
                <FontAwesomeIcon icon={faPlus} className="w-4" />
                <p>新增驗證碼</p>
              </button>
            }

            {/* 登出 */}
            {
              user && <button
                onClick={handleLogout}
                className="hidden md:flex gap-2 items-center"
              >
                <FontAwesomeIcon icon={faRightFromBracket} className="w-4" />
                <p>登出</p>
              </button>
            }

            {/* 個人檔案 */}
            {
              user && <button
                onClick={() => { router.push('/me/MyPage') }}
                className="hidden md:flex gap-2 items-center"
              >

                <div className="relative">
                  <img
                    src={user.photoURL as string}
                    className="w-7 h-7 rounded-full"
                  />
                  <span className="top-0 left-5 absolute  w-3 h-3 bg-green-400 border-2 border-white dark:border-gray-blue-800 rounded-full"></span>
                </div>
                <p>{user?.displayName}</p>
              </button>
            }

            {/* 登入 */}
            {
              !user && <button
                onClick={handleLogin}
                className="hidden md:flex gap-2 items-center"
              >
                <FontAwesomeIcon icon={faRightFromBracket} className="w-4" />
                <p>登入</p>
              </button>
            }

            {/* 切換背景 */}
            <div className="hidden md:flex">
              <Themes></Themes>
            </div>

            {/* 更多 */}
            <div className="relative ml- md:hidden">
              <IconButton
                variant="text"
                size="lg"
                onClick={() => setIsDrawerOpen(true)}
                nonce={undefined}
                onResize={undefined}
                onResizeCapture={undefined}
                placeholder={undefined}
                onPointerEnterCapture={undefined}
                onPointerLeaveCapture={undefined}
              >
                <Bars3Icon className="h-8 w-8 stroke-2 dark:invert" />
              </IconButton>
            </div>
          </div>
        </div>
      </div>

      <Sidebar
        isDrawerOpen={isDrawerOpen}
        setIsDrawerOpen={setIsDrawerOpen}
      ></Sidebar>

      <div className="sm:hidden" id="mobile-menu">
      </div>
    </nav>
  );
}

export default Navbar;