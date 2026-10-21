// 排序模式的上下移動按鈕（GroupCodeCard 用）
export interface CodeCardSort {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}
