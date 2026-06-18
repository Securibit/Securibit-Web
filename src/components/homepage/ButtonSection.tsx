"use client";

import { faFacebook, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next-nprogress-bar";

const ButtonSection = () => {
  const router = useRouter();
  
  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:w-fit sm:grid-cols-2 items-center">
      <button
        onClick={() => router.push('/code')}
        className="flex items-center justify-center rounded-lg px-2 py-2 border-2 border-tpp hover:bg-tpp/50 dark:hover:bg-tpp/50 text-white"
      >
        <FontAwesomeIcon icon={faFacebook} className="mr-2 w-5" />
        開始使用
      </button>
      <button
        onClick={() => router.push('/about')}
        className="flex items-center justify-center px-2 py-2 rounded-lg border-2 border-[#17FFAD] hover:bg-[#17FFAD]/50 dark:hover:bg-tpp/50 text-white"
      >
        <FontAwesomeIcon icon={faYoutube} className="mr-2 w-5" />
        了解更多
      </button>
    </div>
  )
} 

export default ButtonSection;