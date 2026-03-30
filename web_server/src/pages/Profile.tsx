import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, User, Lock, Save, Camera, X } from "lucide-react";
import Cropper from "react-easy-crop";
import { supabase } from "../lib/supabaseClient";
import type { User as SupabaseUser } from "@supabase/supabase-js";

// ==========================================
// UTILITY: The Canvas Math to crop the image
// ==========================================

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

const getCroppedImg = async (
  imageSrc: string,
  pixelCrop: Area,
): Promise<File> => {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => (image.onload = resolve));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas is empty"));
        return;
      }
      // Return a proper File object ready for Supabase
      resolve(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    }, "image/jpeg");
  });
};

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function Profile() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Split messages for better UX
  const [profileMessage, setProfileMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Profile Form State
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Cropper Modal State
  const [showCropper, setShowCropper] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const {
          data: { session },
          error: authError,
        } = await supabase.auth.getSession();
        if (authError || !session) {
          navigate("/login");
          return;
        }
        setUser(session.user);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("id", session.user.id)
          .single();

        if (profileError) throw profileError;

        if (profile) {
          setUsername(profile.username || "");
          setAvatarUrl(profile.avatar_url || "");
        }
      } catch (error) {
        console.error("Error loading profile", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);

      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    [],
  );

  const handleCropConfirm = async () => {
    try {
      if (!imageSrc || !croppedAreaPixels) return;
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels);

      setAvatarFile(croppedFile);
      setPreviewUrl(URL.createObjectURL(croppedFile));
      setShowCropper(false);
    } catch (e) {
      console.error(e);
      alert("Failed to crop image.");
    }
  };

  const updateProfile = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setProfileMessage(null);

    try {
      let finalAvatarUrl = avatarUrl;

      // If they cropped a new file, upload it
      if (avatarFile) {
        const fileExt = avatarFile.name.split(".").pop();
        const filePath = `${user.id}/avatar.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, avatarFile, { upsert: true });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(filePath);

        finalAvatarUrl = `${publicUrl}?t=${new Date().getTime()}`;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ username, avatar_url: finalAvatarUrl })
        .eq("id", user.id);

      if (error) throw error;

      const { error: authError } = await supabase.auth.updateUser({
        data: { avatar_url: finalAvatarUrl, username: username },
      });

      if (authError) throw authError;

      setAvatarUrl(finalAvatarUrl);
      setAvatarFile(null);
      setPreviewUrl(null);
      setProfileMessage({
        type: "success",
        text: "Profile updated successfully!",
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        setProfileMessage({ type: "error", text: error.message });
      } else {
        setProfileMessage({ type: "error", text: "Failed to update profile." });
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const updatePassword = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.email) return;
    setSavingPassword(true);
    setPasswordMessage(null);

    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) throw new Error("Current password is incorrect.");

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setPasswordMessage({
        type: "success",
        text: "Password updated successfully!",
      });
      setCurrentPassword("");
      setNewPassword("");
    } catch (error: unknown) {
      if (error instanceof Error) {
        setPasswordMessage({ type: "error", text: error.message });
      } else {
        setPasswordMessage({
          type: "error",
          text: "Failed to update password.",
        });
      }
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="w-12 h-12 text-[#00f2fe] animate-spin" />
      </div>
    );
  }

  const displayAvatar =
    previewUrl ||
    avatarUrl ||
    (user?.email
      ? `https://ui-avatars.com/api/?name=${user.email}&background=00f2fe&color=000000&bold=true`
      : "");

  return (
    <div className="flex flex-col min-h-screen">
      {/* MODAL */}
      {showCropper && imageSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
          <div className="bg-[#111827] border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <h3 className="text-white font-bold">Crop your image</h3>
              <button
                onClick={() => setShowCropper(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative w-full h-80 bg-black">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="p-6 bg-[#111827]">
              <label className="text-sm text-gray-400 mb-2 block">Zoom</label>
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00f2fe] mb-6"
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCropper(false)}
                  className="px-5 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCropConfirm}
                  className="px-5 py-2.5 bg-[#00f2fe] hover:bg-blue-400 text-black rounded-lg transition-colors font-bold"
                >
                  Confirm Crop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN PROFILE PAGE */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full mt-8">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-400 hover:text-[#00f2fe] transition-colors mb-8 w-fit"
        >
          <ArrowLeft className="w-5 h-5" /> Back to Home
        </button>

        <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-white">
          Account Settings
        </h1>
        <p className="text-gray-400 mb-8">
          Manage your profile identity and security preferences.
        </p>

        <div className="space-y-8">
          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 md:p-8">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-[#00f2fe]" /> Public Profile
            </h2>

            {/* Profile Message Block */}
            {profileMessage && (
              <div
                className={`p-4 rounded-lg mb-6 border ${profileMessage.type === "success" ? "bg-green-500/10 border-green-500/50 text-green-400" : "bg-red-500/10 border-red-500/50 text-red-400"}`}
              >
                {profileMessage.text}
              </div>
            )}

            <form onSubmit={updateProfile} className="space-y-8">
              <div className="flex flex-col items-center gap-6">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-24 h-24 rounded-full overflow-hidden group cursor-pointer border-2 border-transparent hover:border-[#00f2fe] transition-all shadow-lg"
                >
                  <img
                    src={displayAvatar}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm">
                    <Camera className="w-6 h-6 text-white mb-1" />
                    <span className="text-[10px] text-white font-bold uppercase tracking-wider">
                      Change
                    </span>
                  </div>
                </div>

                <div className="text-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ""}
                  className="w-full bg-[#0B0F19]/50 border border-gray-800 text-gray-500 rounded-lg px-4 py-3 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter a cool username"
                  className="w-full bg-[#0B0F19] border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#00f2fe] focus:ring-1 focus:ring-[#00f2fe] transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="bg-[#00f2fe] hover:bg-blue-400 text-black font-bold py-2.5 px-6 rounded-lg transition-all flex items-center gap-2"
              >
                {savingProfile ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Profile
              </button>
            </form>
          </div>

          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 md:p-8">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Lock className="w-5 h-5 text-red-400" /> Security
            </h2>

            {/* Password Message Block */}
            {passwordMessage && (
              <div
                className={`p-4 rounded-lg mb-6 border ${passwordMessage.type === "success" ? "bg-green-500/10 border-green-500/50 text-green-400" : "bg-red-500/10 border-red-500/50 text-red-400"}`}
              >
                {passwordMessage.text}
              </div>
            )}

            <form onSubmit={updatePassword} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                  className="w-full bg-[#0B0F19] border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  minLength={6}
                  className="w-full bg-[#0B0F19] border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={savingPassword}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-bold py-2.5 px-6 rounded-lg transition-all flex items-center gap-2"
              >
                {savingPassword ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                Update Password
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
