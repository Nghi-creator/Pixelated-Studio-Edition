import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  Loader2,
  ArrowLeft,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  AdminConfirmDialog,
  type AdminConfirmation,
} from "../../components/admin/AdminConfirmDialog";
import {
  ENGINE_PAIRING_EVENT,
  hasEngineToken,
} from "../../lib/engine/engineAuth";
import {
  deleteLocalVaultGame,
  fetchLocalVaultFilenames,
  getLocalGameTitle,
  getLocalVaultErrorMessage,
  getLocalVaultUserId,
  isInvalidEngineTokenError,
  LOCAL_ENGINE_UNREACHABLE_MESSAGE,
  uploadLocalVaultRom,
  validateLocalRomFile,
} from "../../features/local-vault/localVaultClient";
import { PixelIcon } from "../../components/ui/PixelIcon";

export default function LocalVault() {
  const [localGames, setLocalGames] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [userId, setUserId] = useState<string>("anonymous");
  const [isEnginePaired, setIsEnginePaired] = useState(hasEngineToken);
  const [pendingDeleteFilename, setPendingDeleteFilename] = useState<
    string | null
  >(null);
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<AdminConfirmation | null>(null);
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const [vaultMessage, setVaultMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  useEffect(() => {
    const initVault = async () => {
      const currentUserId = await getLocalVaultUserId();
      setUserId(currentUserId);
      if (hasEngineToken()) {
        fetchLocalGames(currentUserId);
      }
    };
    initVault();
  }, []);

  useEffect(() => {
    const refreshEnginePairing = () => {
      const paired = hasEngineToken();
      setIsEnginePaired(paired);
      if (paired) {
        setVaultMessage(null);
        fetchLocalGames(userId);
      } else {
        setLocalGames([]);
      }
    };

    window.addEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
  }, [userId]);

  const fetchLocalGames = async (uid: string) => {
    if (!hasEngineToken()) {
      setLocalGames([]);
      return;
    }

    setIsLoadingGames(true);
    try {
      setLocalGames(await fetchLocalVaultFilenames(uid));
      setVaultMessage(null);
    } catch (err) {
      console.error("Could not connect to local Docker engine:", err);
      if (isInvalidEngineTokenError(err)) {
        setIsEnginePaired(false);
        setLocalGames([]);
      }
      setVaultMessage(
        (currentMessage) =>
          currentMessage || {
            tone: "error",
            text: getLocalVaultErrorMessage(
              err,
              LOCAL_ENGINE_UNREACHABLE_MESSAGE,
            ),
          },
      );
    } finally {
      setIsLoadingGames(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isEnginePaired) return;
    const file = e.dataTransfer.files[0];
    if (file) await uploadFile(file);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    if (!hasEngineToken()) {
      setVaultMessage({
        tone: "error",
        text: "Pair the local engine before uploading ROMs.",
      });
      return;
    }

    const validationError = validateLocalRomFile(file);
    if (validationError) {
      setVaultMessage({
        tone: "error",
        text: validationError,
      });
      setFileInputVersion((version) => version + 1);
      return;
    }

    setVaultMessage(null);
    setIsUploading(true);

    try {
      await uploadLocalVaultRom(file, userId);
      await fetchLocalGames(userId);
      setVaultMessage({
        tone: "success",
        text: "ROM uploaded to your Local Vault.",
      });
      setFileInputVersion((version) => version + 1);
    } catch (err) {
      console.error("Upload error:", err);
      if (isInvalidEngineTokenError(err)) {
        setIsEnginePaired(false);
        setLocalGames([]);
      }
      setVaultMessage({
        tone: "error",
        text: getLocalVaultErrorMessage(err, LOCAL_ENGINE_UNREACHABLE_MESSAGE),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const requestDeleteLocalGame = (e: React.MouseEvent, filename: string) => {
    e.preventDefault();
    setDeleteConfirmation({
      body: `Delete ${filename} from your Local Vault? This removes the ROM from the paired desktop engine.`,
      confirmLabel: "Delete ROM",
      id: filename,
      intent: "danger",
      title: "Delete local ROM?",
    });
  };

  const confirmDeleteLocalGame = async () => {
    if (!deleteConfirmation) return;
    const filename = deleteConfirmation.id;
    setPendingDeleteFilename(filename);
    setVaultMessage(null);
    try {
      await deleteLocalVaultGame(filename, userId);
      await fetchLocalGames(userId);
      setVaultMessage({
        tone: "success",
        text: "Local Vault game deleted.",
      });
      setDeleteConfirmation(null);
    } catch (err) {
      console.error("Delete error:", err);
      if (isInvalidEngineTokenError(err)) {
        setIsEnginePaired(false);
        setLocalGames([]);
      }
      setVaultMessage({
        tone: "error",
        text: getLocalVaultErrorMessage(err, LOCAL_ENGINE_UNREACHABLE_MESSAGE),
      });
    } finally {
      setPendingDeleteFilename(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full min-h-screen">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors font-medium group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Back to Library
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-3xl font-extrabold text-white">
          Local Vault
        </h2>
        <p className="text-gray-400 mt-1 flex items-center gap-2">
          Choose a ROM from your hard drive to play on our web-based emulator.
        </p>
      </div>

      {vaultMessage && (
        <div
          className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            vaultMessage.tone === "error"
              ? "border-red-400/30 bg-red-500/10 text-red-200"
              : "border-[#C02066]/40 bg-[#9B0048]/15 text-[#F38BB4]"
          }`}
        >
          {vaultMessage.tone === "error" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <p>{vaultMessage.text}</p>
        </div>
      )}

      {deleteConfirmation && (
        <AdminConfirmDialog
          confirmation={deleteConfirmation}
          isPending={pendingDeleteFilename === deleteConfirmation.id}
          onCancel={() => setDeleteConfirmation(null)}
          onConfirm={confirmDeleteLocalGame}
        />
      )}

      {/* THE DROPZONE */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
          accept=".nes,.gb,.gbc,.gba,.sfc,.smc"
          disabled={!isEnginePaired || isUploading}
          onChange={handleFileInput}
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
            ? "or click to browse your files (.nes, .gb, .gbc, .gba, .sfc, .smc)"
            : "pair the local engine before uploading"}
        </p>
      </div>

      {/* THE LOCAL GAME GRID */}
      {isLoadingGames ? (
        <div className="text-center py-16 text-gray-500">
          <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-white" />
          <p className="text-xl">Loading Local Vault...</p>
        </div>
      ) : localGames.length === 0 ? (
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
              Upload a `.nes`, `.gb`, `.gbc`, `.gba`, `.sfc`, or `.smc` ROM above and it will appear here.
            </p>
          )}
          {vaultMessage?.tone === "error" && (
            <button
              className="mt-4 rounded-lg border border-synth-border bg-synth-bg px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-synth-surface"
              onClick={() => fetchLocalGames(userId)}
              type="button"
            >
              Retry Local Vault
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {localGames.map((filename) => (
            <Link
              key={filename}
              to={`/play/${filename}`}
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
                onClick={(e) => requestDeleteLocalGame(e, filename)}
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
      )}
    </div>
  );
}
