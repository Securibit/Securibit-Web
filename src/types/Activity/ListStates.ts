// 紀錄列表沒有資料時的提示
export interface ListEmptyProps {
  text: string;
}

// 「載入更多」按鈕
export interface LoadMoreButtonProps {
  onPress: () => void;
  isLoading: boolean;
}
