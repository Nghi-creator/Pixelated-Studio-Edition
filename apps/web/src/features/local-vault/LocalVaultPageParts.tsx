import type React from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  AdminConfirmDialog,
  type AdminConfirmation,
} from "../../components/admin/AdminConfirmDialog";
import { PixelIcon } from "../../components/ui/PixelIcon";
import {
  getLocalGamePlayPath,
  getLocalGameTitle,
} from "./localVaultClient";

export type LocalVaultMessage = {
  tone: "error" | "success";
  text: string;
};

export function LocalVaultMessageBanner({
  message,
}: {
  message: LocalVaultMessage | null;
}) {
  if (!message) return null;

  return (
    <div
      className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
        message.tone === "error"
          ? "danger-panel font-bold"
          : "border-[#C02066]/40 bg-[#9B0048]/15 text-[#F38BB4]"
      }`}
    >
      {message.tone === "error" ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <p>{message.text}</p>
    </div>
  );
}

export function LocalVaultDeleteDialog({
  confirmation,
  onCancel,
  onConfirm,
  pendingFilename,
}: {
  confirmation: AdminConfirmation | null;
  onCancel: () => void;
  onConfirm: () => void;
  pendingFilename: string | null;
}) {
  if (!confirmation) return null;

  return (
    <AdminConfirmDialog
      confirmation={confirmation}
      isPending={pendingFilename === confirmation.id}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function LocalVaultDropzone({
  fileInputVersion,
  isDragging,
  isEnginePaired,
  isUploading,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileInput,
}: {
  fileInputVersion: number;
  isDragging: boolean;
  isEnginePaired: boolean;
  isUploading: boolean;
  onDragLeave: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onFileInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative mb-12 flex h-64 w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors ${
        isEnginePaired ? "cursor-pointer" : "cursor-not-allowed opacity-60"
      } ${
        isDragging
          ? "border-[#C01662] bg-[#2B1720]"
          : "border-synth-border bg-synth-bg hover:border-[#7E3250] hover:bg-[#120A0E]"
      }`}
    >
      <input
        key={fileInputVersion}
        type="file"
        accept=".nes,.gb,.gbc,.gba,.sfc,.smc,.md,.gen,.sms,.gg"
        disabled={!isEnginePaired || isUploading}
        onChange={onFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />

      {isUploading ? (
        <Loader2 className="w-12 h-12 text-white animate-spin mb-4" />
      ) : (
        <PixelIcon
          className={`mb-4 h-12 w-12 transition-colors ${isDragging ? "text-white" : "text-[#F38BB4]"}`}
          name="upload"
        />
      )}

      <h3 className="text-xl font-bold text-white mb-2">
        {isUploading ? "Transmitting to Engine..." : "Drag & Drop ROMs here"}
      </h3>
      <p className="text-sm text-gray-400">
        {isEnginePaired
          ? "or click to browse your files (.nes, .gb, .gbc, .gba, .sfc, .smc, .md, .gen, .sms, .gg)"
          : "pair the local engine before uploading"}
      </p>
    </div>
  );
}

export function LocalVaultGameList({
  games,
  isEnginePaired,
  isLoading,
  message,
  onDeleteRequest,
  onRetry,
  pendingDeleteFilename,
}: {
  games: string[];
  isEnginePaired: boolean;
  isLoading: boolean;
  message: LocalVaultMessage | null;
  onDeleteRequest: (event: React.MouseEvent, filename: string) => void;
  onRetry: () => void;
  pendingDeleteFilename: string | null;
}) {
  if (isLoading) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-white" />
        <p className="text-xl">Loading Local Vault...</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="mx-auto max-w-xl border-t border-synth-border/70 py-10 text-center text-gray-500">
        <PixelIcon
          className="mx-auto mb-4 h-10 w-10 text-[#F38BB4] opacity-70"
          name={isEnginePaired ? "empty" : "engine-off"}
        />
        <p className="text-lg text-gray-400">
          {isEnginePaired
            ? "Your local vault is empty."
            : "Pair the local engine to view your vault."}
        </p>
        {isEnginePaired && (
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Upload a `.nes`, `.gb`, `.gbc`, `.gba`, `.sfc`, `.smc`, `.md`, `.gen`, `.sms`, or `.gg` ROM above and it will appear here.
          </p>
        )}
        {message?.tone === "error" && (
          <button
            className="mt-4 rounded-lg border border-synth-border bg-synth-bg px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-synth-surface"
            onClick={onRetry}
            type="button"
          >
            Retry Local Vault
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {games.map((filename) => (
        <Link
          key={filename}
          to={getLocalGamePlayPath(filename)}
          className="group relative flex h-64 flex-col justify-between overflow-hidden rounded-lg border border-synth-border bg-synth-surface p-4 transition-colors hover:bg-synth-elevated"
        >
          <div>
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-synth-border bg-synth-bg text-synth-secondary">
              <PixelIcon className="h-6 w-6" name="cartridge" />
            </div>
            <h3 className="line-clamp-4 text-sm font-bold text-white md:text-base">
              {getLocalGameTitle(filename)}
            </h3>
          </div>

          <button
            disabled={pendingDeleteFilename === filename}
            onClick={(event) => onDeleteRequest(event, filename)}
            className="absolute top-2 right-2 bg-synth-bg border border-synth-border p-2 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-colors hover:border-red-500 hover:bg-red-500/20 focus:outline-none z-10"
            title="Delete from Local Vault"
            type="button"
          >
            {pendingDeleteFilename === filename ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-300" />
            ) : (
              <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400 transition-colors" />
            )}
          </button>

          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-synth-secondary">
            Play local ROM
          </span>
        </Link>
      ))}
    </div>
  );
}
