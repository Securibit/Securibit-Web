export interface CategoryInputProps {
  // 已選的類別，用「,」串起來的字串（同 TotpInput.category）
  value: string;
  onChange: (value: string) => void;
  // 既有類別，列在下面點一下就能加入
  suggestions: string[];
  label?: string;
  placeholder?: string;
  description?: string;
}
