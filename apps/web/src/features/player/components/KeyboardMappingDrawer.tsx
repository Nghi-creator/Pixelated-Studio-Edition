import { RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  formatKeyboardCode,
  getStreamKeyboardMapping,
  rebindStreamKeyboard,
  resetStreamKeyboardMapping,
  saveStreamKeyboardMapping,
  STREAM_INPUT_ACTION_LABELS,
  STREAM_INPUT_ACTIONS,
  type StreamInputAction,
} from "../../../lib/webrtc/inputMappings";

type KeyboardMappingDrawerProps = {
  onClose: () => void;
};

const bindingButtonClass =
  "mt-1 min-w-24 w-full rounded-md border border-synth-border bg-synth-bg px-3 py-2 text-sm font-bold text-white transition-colors hover:border-synth-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synth-secondary";

export function KeyboardMappingDrawer({
  onClose,
}: KeyboardMappingDrawerProps) {
  const [mapping, setMapping] = useState(getStreamKeyboardMapping);
  const [capturing, setCapturing] = useState<StreamInputAction | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (capturing) return;
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [capturing, onClose]);

  const captureKeyboard = (
    action: StreamInputAction,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (capturing !== action) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Escape") {
      setCapturing(null);
      setMessage("Keyboard assignment cancelled.");
      return;
    }
    try {
      const nextMapping = rebindStreamKeyboard(mapping, action, event.code);
      setMapping(saveStreamKeyboardMapping(nextMapping));
      setMessage(
        `${STREAM_INPUT_ACTION_LABELS[action]} assigned to ${formatKeyboardCode(event.code)}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not assign that key.",
      );
    }
    setCapturing(null);
  };

  return (
    <div className="fixed inset-0 z-[70]" data-ignore-game-input>
      <button
        aria-label="Close keyboard mapping"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-describedby="keyboard-mapping-description"
        aria-labelledby="keyboard-mapping-title"
        aria-modal="true"
        className="absolute left-0 top-0 flex h-full w-full max-w-md flex-col border-r border-synth-border bg-synth-bg shadow-2xl"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-synth-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-white" id="keyboard-mapping-title">
              Keyboard mapping
            </h2>
            <p className="mt-1 text-xs text-gray-400" id="keyboard-mapping-description">
              Customize the controls stored only in this browser.
            </p>
          </div>
          <button
            aria-label="Close keyboard mapping"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-synth-border text-gray-400 transition-colors hover:bg-synth-elevated hover:text-white"
            onClick={onClose}
            title="Close keyboard mapping"
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-white">Keyboard</h3>
            <button
              className="inline-flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-white"
              onClick={() => {
                setCapturing(null);
                setMapping(resetStreamKeyboardMapping());
                setMessage("Keyboard mapping reset to defaults.");
              }}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              Defaults
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {STREAM_INPUT_ACTIONS.map((action) => (
              <label
                className="text-xs font-semibold text-gray-400"
                key={action}
              >
                {STREAM_INPUT_ACTION_LABELS[action]}
                <button
                  className={bindingButtonClass}
                  onClick={() => {
                    setMessage("");
                    setCapturing(action);
                  }}
                  onKeyDown={(event) => captureKeyboard(action, event)}
                  type="button"
                >
                  {capturing === action
                    ? "Press key…"
                    : formatKeyboardCode(mapping[action])}
                </button>
              </label>
            ))}
          </div>
        </div>

        <div
          aria-live="polite"
          className="border-t border-synth-border px-5 py-4 text-xs text-gray-400"
        >
          {message ||
            "Duplicate keys are rejected. Changes apply to the current stream immediately."}
        </div>
      </aside>
    </div>
  );
}
