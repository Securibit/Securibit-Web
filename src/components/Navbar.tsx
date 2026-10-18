"use client";
/* eslint-disable @next/next/no-img-element */

import { faKey, faPlus, faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Themes from "./Themes";
import { useState } from "react";
import { useRouter } from 'next-nprogress-bar';
import Image from "next/image";
import { Button } from "@heroui/react";
import Sidebar from "./Sidebar/Sidebar";
import { Bars3Icon } from '@heroicons/react/24/solid';
import useAuth from "./auth/useAuth";

// 整個 Navbar
const Navbar = () => {
  const router = useRouter();
  const { user, profile, login: handleLogin, logout: handleLogout } = useAuth();
  // 優先顯示使用者在個人頁面改過的名稱與大頭照
  const displayName = profile?.name || user?.displayName;
  const photoURL = profile?.photoURL || user?.photoURL;

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
            className="flex items-center gap-2 hover:text-tpp transition-colors"
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
                className="hidden md:flex gap-2 items-center hover:text-tpp transition-colors"
              >
                <FontAwesomeIcon icon={faKey} className="w-4" />
                <p>驗證碼</p>
              </button>
            }

            {/* 新增驗證碼 */}
            {
              user && <button
                onClick={() => { router.push('/addCode') }}
                className="hidden md:flex gap-2 items-center hover:text-tpp transition-colors"
              >
                <FontAwesomeIcon icon={faPlus} className="w-4" />
                <p>新增驗證碼</p>
              </button>
            }

            {/* 登出 */}
            {
              user && <button
                onClick={handleLogout}
                className="hidden md:flex gap-2 items-center hover:text-tpp transition-colors"
              >
                <FontAwesomeIcon icon={faRightFromBracket} className="w-4" />
                <p>登出</p>
              </button>
            }

            {/* 個人檔案 */}
            {
              user && <button
                onClick={() => { router.push('/me/MyPage') }}
                className="hidden md:flex gap-2 items-center hover:text-tpp transition-colors"
              >

                <div className="relative">
                  <img
                    src={photoURL ?? ''}
                    alt="大頭照"
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full"
                  />
                  <span className="top-0 left-5 absolute  w-3 h-3 bg-green-400 border-2 border-white dark:border-gray-blue-800 rounded-full"></span>
                </div>
                <p>{displayName}</p>
              </button>
            }

            {/* 登入 */}
            {
              !user && <button
                onClick={handleLogin}
                className="hidden md:flex gap-2 items-center hover:text-tpp transition-colors"
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
              <Button
                isIconOnly
                variant="light"
                size="lg"
                aria-label="開啟選單"
                onPress={() => setIsDrawerOpen(true)}
              >
                <Bars3Icon className="h-8 w-8 stroke-2 dark:invert" />
              </Button>
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