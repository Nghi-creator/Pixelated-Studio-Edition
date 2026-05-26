import React, { useState, useEffect } from "react";
import {
  UploadCloud,
  Gamepad2,
  Loader2,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { EnginePairingPanel } from "../../features/local-engine/EnginePairingPanel";
import {
  clearEngineToken,
  engineAuthHeaders,
  ENGINE_PAIRING_EVENT,
  hasEngineToken,
} from "../../lib/engineAuth";
import { engineEndpoint } from "../../lib/engineConfig";
import { supabase } from "../../lib/supabaseClient";

export default function LocalVault() {
  const [localGames, setLocalGames] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [userId, setUserId] = useState<string>("anonymous");
  const [isEnginePaired, setIsEnginePaired] = useState(hasEngineToken);

  useEffect(() => {
    const initVault = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || "anonymous";
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

    try {
      const res = await fetch(engineEndpoint("/local-games"), {
        headers: { "X-User-Id": uid, ...engineAuthHeaders() },
      });
      if (res.status === 401) {
        clearEngineToken();
        throw new Error("Invalid engine pairing token");
      }
      if (!res.ok) throw new Error("Local engine offline");
      const data = await res.json();
      setLocalGames(data);
    } catch (err) {
      console.error("Could not connect to local Docker engine:", err);
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
      alert("Pair the local engine before uploading ROMs.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".nes")) {
      alert("Only .nes files are supported!");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("romFile", file);

    try {
      const res = await fetch(engineEndpoint("/upload"), {
        method: "POST",
        headers: { "X-User-Id": userId, ...engineAuthHeaders() },
        body: formData,
      });

      if (res.ok) {
        await fetchLocalGames(userId);
      } else if (res.status === 401) {
        clearEngineToken();
        alert("Invalid pairing token. Please enter the desktop app token again.");
      } else {
        alert("Upload failed.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Make sure your Docker engine is running!");
    } finally {
      setIsUploading(false);
    }
  };

  const deleteLocalGame = async (e: React.MouseEvent, filename: string) => {
    e.preventDefault();

    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) return;

    try {
      const res = await fetch(
        engineEndpoint(`/local-games/${encodeURIComponent(filename)}`),
        {
          method: "DELETE",
          headers: { "X-User-Id": userId, ...engineAuthHeaders() },
        },
      );

      if (res.ok) {
        await fetchLocalGames(userId);
      } else if (res.status === 401) {
        clearEngineToken();
        alert("Invalid pairing token. Please enter the desktop app token again.");
      } else {
        alert("Failed to delete game.");
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Make sure your Docker engine is running!");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full min-h-screen">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-synth-primary transition-colors font-medium group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Back to Library
        </Link>
      </div>

      <div className="mb-8 border-l-4 border-synth-secondary pl-3">
        <h2 className="text-3xl font-extrabold text-white drop-shadow-[0_0_12px_rgba(255,159,67,0.2)]">
          Local Vault
        </h2>
        <p className="text-gray-400 mt-1 flex items-center gap-2">
          Choose a ROM from your hard drive to play on our web-based emulator.
          Your files stay on your machine and are securely isolated to your
          account.
        </p>
      </div>

      <div className="mb-8">
        <EnginePairingPanel onPaired={() => fetchLocalGames(userId)} />
      </div>

      {/* THE DROPZONE */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative mb-12 w-full h-64 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all overflow-hidden ${
          isEnginePaired ? "cursor-pointer" : "cursor-not-allowed opacity-60"
        } ${
          isDragging
            ? "border-synth-primary bg-synth-primary/10 shadow-glow-primary"
            : "border-synth-border bg-synth-surface hover:border-synth-secondary/50"
        }`}
      >
        <input
          type="file"
          accept=".nes"
          disabled={!isEnginePaired}
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />

        {isUploading ? (
          <Loader2 className="w-12 h-12 text-synth-primary animate-spin mb-4" />
        ) : (
          <UploadCloud
            className={`w-12 h-12 mb-4 transition-colors ${isDragging ? "text-synth-primary" : "text-gray-500"}`}
          />
        )}

        <h3 className="text-xl font-bold text-white mb-2">
          {isUploading ? "Transmitting to Engine..." : "Drag & Drop ROMs here"}
        </h3>
        <p className="text-sm text-gray-400">
          {isEnginePaired
            ? "or click to browse your files (.nes only)"
            : "pair the local engine before uploading"}
        </p>
      </div>

      {/* THE LOCAL GAME GRID */}
      {localGames.length === 0 ? (
        <div className="text-center py-20 text-gray-500 bg-synth-surface rounded-xl border border-synth-border">
          <Gamepad2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-xl">Your local vault is empty.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {localGames.map((filename) => (
            <Link
              key={filename}
              to={`/play/${filename}`}
              className="group relative block rounded-xl overflow-hidden bg-synth-surface border border-synth-border hover:border-synth-primary/55 hover:shadow-glow-primary-sm transition-all h-64"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-synth-bg via-synth-surface to-synth-primary/20 flex flex-col items-center justify-center p-4">
                <Gamepad2 className="w-16 h-16 text-synth-primary/40 group-hover:text-synth-primary group-hover:scale-110 transition-all duration-300 drop-shadow-[0_0_8px_rgba(255,77,143,0.5)]" />
              </div>

              <button
                onClick={(e) => deleteLocalGame(e, filename)}
                className="absolute top-2 right-2 bg-synth-bg/85 border border-synth-border p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:border-red-500 hover:bg-red-500/20 focus:outline-none z-10 backdrop-blur-sm"
                title="Delete from Hard Drive"
              >
                <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400 transition-colors" />
              </button>

              <div className="absolute bottom-0 w-full p-4 bg-gradient-to-t from-synth-bg via-synth-bg/92 to-transparent">
                <h3 className="font-bold text-sm md:text-md truncate text-white">
                  {filename.replace(".nes", "")}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
