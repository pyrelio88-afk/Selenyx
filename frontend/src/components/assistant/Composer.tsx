/**
 * 可复用的多行输入器。
 *
 * 助理对话与新建任务都通过这个组件承载文本输入和 Enter 提交语义；各页面
 * 仅通过 slots 提供各自的命令面板、约束说明或任务配置，避免两个入口的
 * 输入行为逐渐分叉。
 */

import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  ariaLabel: string;
  placeholder?: string;
  rows?: number;
  className?: string;
  inputWrapClassName?: string;
  inputRowClassName?: string;
  textareaClassName?: string;
  textareaStyle?: CSSProperties;
  autoResize?: boolean;
  maxHeight?: number;
  submitOnEnter?: boolean;
  beforeInput?: ReactNode;
  inputBefore?: ReactNode;
  action?: ReactNode;
  controls?: ReactNode;
  footer?: ReactNode;
}

/**
 * Shared textarea shell. It intentionally owns only input mechanics; request
 * dispatching and page-specific actions stay with the caller.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  textareaRef,
  ariaLabel,
  placeholder,
  rows = 1,
  className,
  inputWrapClassName,
  inputRowClassName,
  textareaClassName,
  textareaStyle,
  autoResize = false,
  maxHeight = 200,
  submitOnEnter = true,
  beforeInput,
  inputBefore,
  action,
  controls,
  footer,
}: ComposerProps) {
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = textareaRef ?? fallbackRef;

  useEffect(() => {
    if (!autoResize) return;
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [autoResize, inputRef, maxHeight, value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !submitOnEnter) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  const input = (
    <textarea
      ref={inputRef}
      className={textareaClassName}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      rows={rows}
      aria-label={ariaLabel}
      style={textareaStyle}
    />
  );

  const row = (
    <div className={inputRowClassName}>
      {input}
      {action}
    </div>
  );

  return (
    <div className={className}>
      {beforeInput}
      {inputWrapClassName ? <div className={inputWrapClassName}>{inputBefore}{row}</div> : <>{inputBefore}{row}</>}
      {controls}
      {footer}
    </div>
  );
}
