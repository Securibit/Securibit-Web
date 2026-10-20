import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

// 匯出畫面共用的提醒：QR Code 與連結裡就是金鑰本身
const ExportWarning = () => (
  <div className="flex w-full gap-3 border border-alarm/50 bg-alarm/10 p-3 text-sm text-ink">
    <FontAwesomeIcon icon={faTriangleExclamation} className="mt-1 w-4 flex-shrink-0 text-alarm" />
    <p>裡面包含金鑰，任何人拿到都能產生你的驗證碼。不要截圖分享，也不要在別人看得到的地方開啟。</p>
  </div>
);

export default ExportWarning;
