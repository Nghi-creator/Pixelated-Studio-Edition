import { useEffect, useState, useRef } from "react";
import {
  Check,
  Trash2,
  ShieldBan,
  ChevronDown,
  ShieldAlert,
  Clock,
} from "lucide-react";

export interface Report {
  id: string;
  reason: string;
  created_at: string;
  comments: {
    id: string;
    content: string;
    profiles: {
      id: string;
      username: string;
      role: string;
    };
  };
  profiles: {
    id: string;
    username: string;
  };
}

interface ReportCardProps {
  report: Report;
  currentUserId: string;
  currentUserRole: string;
  onIgnore: (id: string) => void;
  onDelete: (id: string) => void;
  onBan: (userId: string, commentId: string) => void;
}

export default function ReportCard({
  report,
  currentUserId,
  currentUserRole,
  onIgnore,
  onDelete,
  onBan,
}: ReportCardProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!report.comments) return null;

  const isSelf = report.comments.profiles.id === currentUserId;
  const isTargetAdmin =
    report.comments.profiles.role === "admin" ||
    report.comments.profiles.role === "super_admin";
  const isSuperAdmin = currentUserRole === "super_admin";

  const isReporter = report.profiles.id === currentUserId;

  const showLockBadge = isTargetAdmin && !isSuperAdmin;

  const isPendingOtherAdmin = isReporter && !isSuperAdmin;

  const canBan = !isSelf;

  return (
    <div
      className={`bg-synth-surface border rounded-xl p-6 flex flex-col md:flex-row gap-6 justify-between items-start transition-all relative shadow-glow-card ${
        showLockBadge || isPendingOtherAdmin
          ? "border-synth-secondary/40"
          : "border-synth-border hover:border-synth-primary/35"
      }`}
    >
      {/* Left Side: The Content & Details */}
      <div className="flex-1 w-full space-y-4">
        <div>
          <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            Reason
          </h4>
          <div className="bg-synth-bg p-4 rounded-lg border border-synth-border">
            <p className="text-white">{report.reason}</p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold text-synth-primary uppercase tracking-wider mb-2">
            Content
          </h4>
          <div className="bg-synth-bg p-4 rounded-lg border border-synth-border">
            <p className="text-white">"{report.comments.content}"</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 font-medium pt-2">
          <div>
            Posted by:{" "}
            <span className="text-gray-300">
              @{report.comments.profiles?.username || "Unknown"}{" "}
              {isTargetAdmin && "(Admin)"}
            </span>
          </div>
          <div>
            Reported by:{" "}
            <span
              className={
                isReporter ? "text-synth-primary font-bold" : "text-gray-300"
              }
            >
              @{report.profiles?.username || "Unknown"} {isReporter && "(You)"}
            </span>
          </div>
        </div>
      </div>

      {/* Right Side Logic Tree */}
      {showLockBadge ? (
        <div
          className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold rounded-lg flex items-center gap-2 cursor-help whitespace-nowrap"
          title="Admin reports can only be resolved by the Super Admin."
        >
          <ShieldAlert className="w-4 h-4" /> Locked for Review
        </div>
      ) : isPendingOtherAdmin ? (
        <div
          className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-sm font-bold rounded-lg flex items-center gap-2 cursor-help whitespace-nowrap"
          title="You reported this. Another admin must review it to prevent bias."
        >
          <Clock className="w-4 h-4" /> Awaiting Peer Review
        </div>
      ) : (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-synth-elevated hover:bg-synth-border border border-synth-border text-white text-sm font-bold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-synth-primary/30"
          >
            Action{" "}
            <ChevronDown
              className={`w-4 h-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
            />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-synth-bg border border-synth-border rounded-xl shadow-glow-card py-2 z-50 overflow-hidden backdrop-blur-xl">
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  onIgnore(report.id);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-synth-elevated hover:text-white transition-colors text-left"
              >
                <Check className="w-4 h-4" /> Ignore Report
              </button>

              <div className="h-px bg-synth-border my-1"></div>

              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  onDelete(report.comments.id);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
              >
                <Trash2 className="w-4 h-4" /> Delete Comment
              </button>

              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  onBan(report.comments.profiles.id, report.comments.id);
                }}
                disabled={!canBan}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-left transition-colors ${
                  !canBan
                    ? "text-gray-600 cursor-not-allowed"
                    : "text-red-500 hover:bg-red-500/10"
                }`}
              >
                <ShieldBan className="w-4 h-4" />
                {isSelf ? "Cannot Ban Self" : "Ban User"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
