"use client";

import { KeyboardEvent, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { joinCategories, parseCategories } from "@/lib/totp/categories";
import { CategoryInputProps } from "@/types/Totp/CategoryInput";

// 輸入框裡打到這些字元就把前面的字變成一個類別
const SEPARATOR = /[,，、]/;

/*
 * 多選類別的標籤輸入：已選的顯示成可移除的藥丸，後面接一個輸入框。
 * Enter 或逗號新增、空白時按 Backspace 刪最後一個，離開輸入框時把打到一半的字也加進去。
 * 對外仍是一個字串（用「,」串起來），跟 TotpInput.category 一樣。
 */
const CategoryInput = (props: CategoryInputProps) => {
  const { label = "類別" } = props;
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  const selected = parseCategories(props.value);

  const add = (names: string[]) => {
    const next = joinCategories([...selected, ...names]);
    if (next !== joinCategories(selected)) props.onChange(next);
  };

  const remove = (name: string) => props.onChange(joinCategories(selected.filter((current) => current !== name)));

  const commitDraft = () => {
    if (!draft.trim()) return;
    add(parseCategories(draft));
    setDraft("");
  };

  const handleChange = (text: string) => {
    // 打了分隔符號（或貼上「工作,個人」）：分隔符號前面的都加進去，最後一段留著繼續打
    if (SEPARATOR.test(text)) {
      const parts = text.split(SEPARATOR);
      add(parseCategories(parts.slice(0, -1).join(",")));
      setDraft(parts[parts.length - 1].trimStart());
      return;
    }
    setDraft(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 中文輸入法選字時的 Enter／Backspace 不處理
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      // 沒有打字時不攔截，讓表單照常送出
      if (!draft.trim()) return;
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && !draft && selected.length > 0) {
      e.preventDefault();
      remove(selected[selected.length - 1]);
    }
  };

  // 建議：已選的不顯示，有打字時只列包含那段字的
  const keyword = draft.trim().toLowerCase();
  const suggestions = props.suggestions.filter(
    (name) => !selected.includes(name) && (!keyword || name.toLowerCase().includes(keyword))
  );

  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="pb-1.5 text-medium text-foreground">
        {label}
      </label>

      {/* 點外框任何地方都聚焦到輸入框 */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-12 cursor-text flex-wrap items-center gap-1.5 rounded-large bg-default-100 px-3 py-2 transition-colors hover:bg-default-200 focus-within:bg-default-100 focus-within:ring-2 focus-within:ring-accent/40"
      >
        {selected.map((name) => (
          <span key={name} className="flex max-w-full items-center gap-1 rounded-full bg-surface py-0.5 pl-2.5 pr-1.5 text-[13px] text-ink">
            <span className="truncate">{name}</span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                remove(name);
              }}
              aria-label={`移除「${name}」`}
              className="flex size-4 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink"
            >
              <FontAwesomeIcon icon={faXmark} className="w-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          placeholder={selected.length === 0 ? (props.placeholder ?? "例如：工作、個人、遊戲") : "新增類別"}
          autoComplete="off"
          enterKeyHint="enter"
          className="h-8 min-w-24 flex-1 bg-transparent text-medium text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      <p className="pt-1.5 text-[13px] text-ink-muted">
        {props.description ?? "可選多個，按 Enter 或逗號新增"}
      </p>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2" aria-label="既有類別">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              // 不讓輸入框失焦，否則打到一半的字會先被加進去
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                add([name]);
                setDraft("");
              }}
              className="flex items-center gap-1 rounded-full bg-surface-1 px-2.5 py-0.5 text-[13px] text-accent transition-colors hover:bg-default-200"
            >
              <FontAwesomeIcon icon={faPlus} className="w-2.5" />
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoryInput;
