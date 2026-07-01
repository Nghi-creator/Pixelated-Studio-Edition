import type { ChangeEvent, ReactNode } from "react";

type PublishFileFieldProps = {
  accept: string;
  describedBy?: string;
  disabled: boolean;
  error?: string;
  file: File | null;
  icon: ReactNode;
  id: string;
  label: ReactNode;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  required?: boolean;
  selectedBorderClass: string;
};

export function PublishFileField({
  accept,
  describedBy,
  disabled,
  error,
  file,
  icon,
  id,
  label,
  onChange,
  placeholder,
  required = false,
  selectedBorderClass,
}: PublishFileFieldProps) {
  return (
    <div>
      <label
        className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide"
        htmlFor={id}
      >
        {label}
      </label>
      <div
        className={`relative w-full h-14 bg-synth-bg border-2 border-dashed rounded-xl flex items-center justify-center transition-colors group cursor-pointer overflow-hidden ${
          error
            ? "border-red-400"
            : file
              ? selectedBorderClass
              : "border-synth-border hover:border-synth-secondary"
        }`}
      >
        <input
          id={id}
          type="file"
          accept={accept}
          onChange={onChange}
          required={required}
          disabled={disabled}
          aria-describedby={describedBy}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div
          className={`flex items-center gap-2 transition-colors ${file ? "text-synth-secondary" : "text-gray-500 group-hover:text-synth-secondary"}`}
        >
          {icon}
          <span className="font-medium text-sm truncate px-2">
            {file ? file.name : placeholder}
          </span>
        </div>
      </div>
      {error && describedBy && (
        <p id={describedBy} className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
