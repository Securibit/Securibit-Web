import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

// 匯出畫面共用的提醒：QR Code 與連結裡就是金鑰本身
const ExportWarning = () => (
  <p className="flex w-full items-start gap-2 text-[13px] text-alarm">
    <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 w-3.5 shrink-0" />
    <span>裡面包含金鑰，任何人拿到都能產生你的驗證碼。不要截圖分享，也不要在別人看得到的地方開啟</span>
  </p>
);

export default ExportWarning;
