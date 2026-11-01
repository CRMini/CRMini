import { type RefObject, useId } from "react";

export default function Field({
  label,
  value,
  onChange,
  onBlur,
  error = "",
  hint = "",
  type = "text",
  required = false,
  placeholder = "",
  format,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  format?: (value: string) => string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className={`form-field${error ? " has-error" : ""}`}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        ref={inputRef}
        type={type}
        value={value || ""}
        required={required}
        placeholder={placeholder}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        onChange={(event) =>
          onChange(format ? format(event.target.value) : event.target.value)
        }
      />
      {error && (
        <span id={errorId} className="form-field-error" role="alert">
          {error}
        </span>
      )}
      {hint && (
        <small id={hintId} className="form-field-hint">
          {hint}
        </small>
      )}
    </div>
  );
}
