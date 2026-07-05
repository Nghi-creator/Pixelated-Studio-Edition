import type { ReactNode } from "react";
import { CheckCircle } from "lucide-react";
import { labelClassName, publishColor, publishSteps } from "./PublishFormConstants";

export type ChoiceOption = {
  description: string;
  label: string;
  value: string;
};

type PublishActionButtonProps = {
  children: ReactNode;
  disabled: boolean;
  onClick?: () => void;
  type: "button" | "submit";
};

function publishButtonStyle(disabled: boolean) {
  return {
    backgroundColor: disabled ? publishColor.disabled : publishColor.active,
    borderColor: disabled ? publishColor.disabledBorder : publishColor.activeBorder,
    color: disabled ? publishColor.disabledText : "#FFFFFF",
  };
}

export function PublishActionButton({
  children,
  disabled,
  onClick,
  type,
}: PublishActionButtonProps) {
  return (
    <button
      className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border px-6 font-bold transition-colors disabled:pointer-events-none disabled:cursor-default"
      disabled={disabled}
      onClick={onClick}
      style={publishButtonStyle(disabled)}
      type={type}
    >
      {children}
    </button>
  );
}

export function PublishProgress({ step }: { step: number }) {
  return (
    <div className="mb-6 rounded-lg border border-synth-border bg-synth-surface p-4 shadow-card">
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-synth-bg">
        <div
          aria-hidden
          className="h-full rounded-full transition-all"
          style={{
            backgroundColor: publishColor.active,
            width: `${((step + 1) / publishSteps.length) * 100}%`,
          }}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {publishSteps.map((name, index) => {
          const isReached = index <= step;
          return (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-extrabold ${
                isReached ? "text-white" : "text-gray-500"
              }`}
              key={name}
              style={
                isReached
                  ? {
                      backgroundColor: publishColor.active,
                    }
                  : undefined
              }
            >
              {index < step && <CheckCircle className="h-4 w-4 flex-shrink-0" />}
              {name}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FieldLabel({
  children,
  optional = false,
}: {
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <label className={labelClassName}>
      {children}
      {optional ? (
        <span className="ml-2 text-xs font-semibold lowercase text-gray-400">
          optional
        </span>
      ) : (
        <span className="ml-1 text-synth-secondary">*</span>
      )}
    </label>
  );
}

export function ChoiceGroup({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  value: string;
}) {
  return (
    <fieldset>
      <legend className={labelClassName}>{label}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              className={`rounded-lg border p-4 text-left outline-none transition-colors focus:ring-2 focus:ring-[#E0A3BB] ${
                selected
                  ? "text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
                  : "border-synth-border bg-synth-bg/70 text-gray-200 hover:border-synth-secondary/70"
              } disabled:cursor-not-allowed disabled:opacity-60`}
              disabled={disabled}
              key={option.value}
              onClick={() => onChange(option.value)}
              style={
                selected
                  ? {
                      backgroundColor: publishColor.active,
                      borderColor: publishColor.activeBorder,
                    }
                  : undefined
              }
              type="button"
            >
              <span className="flex items-center gap-2 text-sm font-extrabold text-white">
                {selected && <CheckCircle className="h-4 w-4 text-white" />}
                {option.label}
              </span>
              <span className="mt-2 block text-sm font-medium leading-6 text-gray-300">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CheckboxField({
  checked,
  children,
  disabled,
  onChange,
}: {
  checked: boolean;
  children: ReactNode;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex gap-3 rounded-lg border border-synth-border bg-synth-bg/70 p-4 text-sm font-semibold leading-6 text-white">
      <input
        checked={checked}
        className="mt-1 h-4 w-4 accent-synth-secondary"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{children}</span>
    </label>
  );
}
