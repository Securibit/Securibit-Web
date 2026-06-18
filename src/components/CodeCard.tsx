import { useEffect, useState } from "react";
import { TOTP } from "totp-generator";
import { useInterval } from 'react-use';
import { CircularProgress, Progress } from "@heroui/react";
import { toast } from "react-hot-toast";
import ModalAlert from "./Code/ModalAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { isBase32 } from "@/lib/totp/crud";

interface CodeCardProps {
  name: string;
  code: string;
  category: string;
  deleteCode: () => void;
}

const CodeCard = (props: CodeCardProps) => {

  const period = 30;
  const [otp, setOtp] = useState<string | null>(null);

  const calculateTimeLeft = () => {
    const currentTime = Math.floor(new Date().getTime() / 1000);
    return period - (currentTime % period);
  };

  // totp-generator v2 的 TOTP.generate 改為 async，需在 effect 中產生驗證碼
  const generateOtp = async () => {
    if (!isBase32(props.code)) {
      setOtp(null);
      return;
    }
    try {
      const result = await TOTP.generate(props.code, { period });
      setOtp(result.otp);
    } catch {
      setOtp(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("已複製驗證碼！", {
      position: "top-right"
    });
  };

  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    setTimeLeft(calculateTimeLeft());
    generateOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.code]);

  // 更新剩餘時間
  useInterval(() => {
    const newTimeLeft = timeLeft - 1;

    if (newTimeLeft <= 0) {
      setTimeLeft(30);
      // 進入新的時間週期時重新產生驗證碼
      generateOtp();
    } else {
      setTimeLeft(newTimeLeft);
    }
  }, 1000);

  return (
    <>
      <li className="py-3 sm:py-4">
        <Progress
          maxValue={30}
          value={timeLeft}
          color="primary"
          className="mb-2 h-1"
        />
        <div className="flex items-center space-x-4">
          <div className="flex-shrink-0">
            {/* <img className="w-8 h-8 rounded-full" src="/docs/images/people/profile-picture-1.jpg" alt="Neil image" /> */}

            {/* Delete Btn */}
            <ModalAlert
              deleteTOTP={props.deleteCode}
            >
              <div className="rounded-full border-2 border-red-500 w-10 h-10 flex items-center justify-center">
                <FontAwesomeIcon icon={faTrash} className="w-5 h-5 text-red-500" />
              </div>
            </ModalAlert>
          </div>

          {/* TOTP Name */}
          <div className="flex-1 min-w-0">
            <p className="text-base sm:text-lg font-medium text-gray-blue-900 truncate dark:text-white">
              {props.name}
            </p>
            <span className="text-xs font-medium sm:mr-2 px-2 sm:px-2.5 sm:py-0.5 rounded bg-purple-100 text-purple-800 border-2 border-purple-300 dark:bg-tpp/30 dark:text-bityo dark:border-tpp">{props.category}</span>

          </div>
          {
            otp ? (
              <button
                onClick={() => { otp && copyToClipboard(otp) }}
                className="text-xl font-semibold text-gray-blue-900 dark:text-white">
                {otp}
              </button>
            ) : (
              <p
                className="text-sm sm:text-xl font-semibold text-red-500">
                驗證碼錯誤！
              </p>
            )
          }
          <CircularProgress
            aria-label="Loading..."
            size="lg"
            maxValue={30}
            value={timeLeft}
            color="primary"
            formatOptions={{
              style: 'unit',
              unit: 'second',
              unitDisplay: 'narrow',
            }}
            showValueLabel={true}
          />
        </div>
      </li>
    </>
  )
}

export default CodeCard;