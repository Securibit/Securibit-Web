import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

// 匯出畫面共用的提醒：QR Code 與連結裡就是金鑰本身
const ExportWarning = () => (
  <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
    <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 w-4" />
    <p>裡面包含金鑰，任何人拿到都能產生你的驗證碼。不要截圖分享，也不要在別人看得到的地方開啟。</p>
  </div>
);

export default ExportWarning;
