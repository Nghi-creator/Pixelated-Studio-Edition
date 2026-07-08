import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  type AdminConfirmation,
} from "../../components/admin/AdminConfirmDialog";
import {
  ENGINE_PAIRING_EVENT,
  hasEngineToken,
} from "../../lib/engine/engineAuth";
import {
  deleteLocalVaultGame,
  fetchLocalVaultFilenames,
  getLocalVaultErrorMessage,
  getLocalVaultUserId,
  isInvalidEngineTokenError,
  LOCAL_ENGINE_UNREACHABLE_MESSAGE,
  uploadLocalVaultRom,
  validateLocalRomFile,
} from "../../features/local-vault/localVaultClient";
import {
  LocalVaultDeleteDialog,
  LocalVaultDropzone,
  LocalVaultGameList,
  LocalVaultMessageBanner,
  type LocalVaultMessage,
} from "../../features/local-vault/LocalVaultPageParts";

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
  const [vaultMessage, setVaultMessage] =
    useState<LocalVaultMessage | null>(null);

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
          to="/home"
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

      <LocalVaultMessageBanner message={vaultMessage} />
      <LocalVaultDeleteDialog
        confirmation={deleteConfirmation}
        onCancel={() => setDeleteConfirmation(null)}
        onConfirm={confirmDeleteLocalGame}
        pendingFilename={pendingDeleteFilename}
      />
      <LocalVaultDropzone
        fileInputVersion={fileInputVersion}
        isDragging={isDragging}
        isEnginePaired={isEnginePaired}
        isUploading={isUploading}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onFileInput={handleFileInput}
      />
      <LocalVaultGameList
        games={localGames}
        isEnginePaired={isEnginePaired}
        isLoading={isLoadingGames}
        message={vaultMessage}
        onDeleteRequest={requestDeleteLocalGame}
        onRetry={() => fetchLocalGames(userId)}
        pendingDeleteFilename={pendingDeleteFilename}
      />
    </div>
  );
}
