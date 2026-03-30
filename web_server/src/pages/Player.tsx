import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useWebRTC } from "../lib/useWebRTC";

export default function Player() {
  const { id } = useParams<{ id: string }>(); // Grab the game ID from the URL
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Power on the WebRTC engine!
  const { stream, status } = useWebRTC(id || "");

  // Whenever the WebRTC hook gives us a new video stream, attach it to the HTML video player
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="flex flex-col items-center justify-center p-4 h-[85vh]">
      {/* Top Controls Bar */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-6">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-400 hover:text-[#00f2fe] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" /> Back to Library
        </button>

        {/* Status Indicator */}
        <div className="flex items-center gap-2 bg-[#111827] px-4 py-2 rounded-full border border-gray-800">
          <div
            className={`w-2.5 h-2.5 rounded-full ${status === "playing" ? "bg-green-500 shadow-[0_0_10px_#22c55e]" : "bg-yellow-500 animate-pulse"}`}
          ></div>
          <span className="text-sm font-medium text-gray-300 uppercase tracking-wider">
            {status === "connecting"
              ? "Connecting to Edge Node..."
              : "Live Stream Active"}
          </span>
        </div>
      </div>

      {/* The Player Container */}
      <div className="relative w-full max-w-5xl aspect-video bg-black border border-gray-800 rounded-xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)] flex items-center justify-center">
        {/* Loading Overlay */}
        {status === "connecting" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0B0F19]/90 backdrop-blur-sm">
            <Loader2 className="w-12 h-12 text-[#00f2fe] animate-spin mb-4" />
            <p className="text-lg text-gray-300 font-medium tracking-wide">
              Establishing WebRTC Handshake...
            </p>
          </div>
        )}

        {/* The actual video feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
      </div>

      {/* Instructions */}
      <div className="mt-8 flex gap-4 text-gray-400 text-sm">
        <p>Click video to focus.</p>
        <p className="border-l border-gray-700 pl-4">
          Move:{" "}
          <kbd className="bg-gray-800 px-2 py-1 rounded text-gray-200 ml-1 font-mono">
            ARROWS
          </kbd>
        </p>
        <p className="border-l border-gray-700 pl-4">
          Action:{" "}
          <kbd className="bg-gray-800 px-2 py-1 rounded text-gray-200 ml-1 font-mono">
            Z
          </kbd>{" "}
          /{" "}
          <kbd className="bg-gray-800 px-2 py-1 rounded text-gray-200 ml-1 font-mono">
            X
          </kbd>
        </p>
      </div>
    </div>
  );
}
