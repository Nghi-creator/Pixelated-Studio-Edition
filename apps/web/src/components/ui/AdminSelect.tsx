import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

type AdminSelectOption<TValue extends string> = {
  label: string;
  value: TValue;
};

type AdminSelectProps<TValue extends string> = {
  ariaLabel: string;
  buttonClassName?: string;
  className?: string;
  iconClassName?: string;
  menuClassName?: string;
  onChange: (value: TValue) => void;
  options: AdminSelectOption<TValue>[];
  value: TValue;
};

export function AdminSelect<TValue extends string>({
  ariaLabel,
  buttonClassName = "flex h-10 w-full min-w-44 items-center justify-between gap-4 rounded-lg border border-synth-secondary/40 bg-synth-bg pl-3 pr-4 text-left text-sm font-semibold text-white outline-none transition-colors hover:border-synth-secondary focus:border-synth-secondary",
  className = "",
  iconClassName = "h-4 w-4",
  menuClassName = "absolute left-0 top-full z-50 mt-2 w-full min-w-max overflow-hidden rounded-lg border border-synth-secondary/50 bg-synth-bg py-1 shadow-card",
  onChange,
  options,
  value,
}: AdminSelectProps<TValue>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className={buttonClassName}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="min-w-0 truncate">
          {selectedOption?.label || "Select"}
        </span>
        <ChevronDown
          className={`${iconClassName} flex-shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className={menuClassName}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  isSelected
                    ? "bg-synth-secondary/20 text-white"
                    : "text-gray-200 hover:bg-synth-elevated hover:text-white"
                }`}
                key={option.value || "all"}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                type="button"
              >
                <Check
                  className={`h-4 w-4 flex-shrink-0 ${
                    isSelected ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span className="whitespace-nowrap">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
