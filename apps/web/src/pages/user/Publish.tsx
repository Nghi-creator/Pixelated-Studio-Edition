import React, { useState } from "react";
import {
  UploadCloud,
  Send,
  ArrowLeft,
  Loader2,
  CheckCircle,
  Image as ImageIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

export default function Publish() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const FORMSPREE_URL = "https://formspree.io/f/mlgaeqgj";

  // Form State
  const [authorName, setAuthorName] = useState("");
  const [email, setEmail] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [description, setDescription] = useState("");

  // File State
  const [romFile, setRomFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const handleRomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith(".nes")) {
        alert("Only .nes files are allowed!");
        e.target.value = "";
        return;
      }
      setRomFile(file);
    }
  };

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<File | null>>,
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith("image/")) {
        alert("Please upload a valid image file (PNG, JPG, etc).");
        e.target.value = "";
        return;
      }
      setter(file);
    }
  };

  const uploadToSupabase = async (file: File, folder: string) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error } = await supabase.storage
      .from("submissions")
      .upload(fileName, file);
    if (error) throw error;

    const { data } = supabase.storage
      .from("submissions")
      .getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!romFile) {
      alert("Please attach your .nes ROM file.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Upload ROM
      const romUrl = await uploadToSupabase(romFile, "roms");

      // 2. Upload Optional Images
      let coverUrl = null;
      let bannerUrl = null;
      if (coverFile) coverUrl = await uploadToSupabase(coverFile, "covers");
      if (bannerFile) bannerUrl = await uploadToSupabase(bannerFile, "banners");

      // 3. Save to Supabase Database
      const { error: dbError } = await supabase
        .from("game_submissions")
        .insert({
          author_name: authorName,
          email: email,
          game_title: gameTitle,
          description: description || null,
          rom_url: romUrl,
          cover_url: coverUrl,
          banner_url: bannerUrl,
        });

      if (dbError) throw dbError;

      // 4. Stealth Ping to Formspree for Email Alert
      await fetch(FORMSPREE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          subject: `New Game Submission: ${gameTitle}`,
          developer: authorName,
          contact_email: email,
          game: gameTitle,
          description: description || "No description provided.",
          rom_download: romUrl,
          cover_art: coverUrl || "None provided",
          banner_art: bannerUrl || "None provided",
        }),
      });

      setIsSuccess(true);
    } catch (error: unknown) {
      console.error("Submission error:", error);
      alert("Failed to submit game. Make sure files aren't too large.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-32 w-full min-h-screen flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-synth-primary/20 rounded-full flex items-center justify-center mb-6 shadow-glow-primary">
          <CheckCircle className="w-10 h-10 text-synth-primary" />
        </div>
        <h2 className="text-4xl font-extrabold text-white mb-4">
          Application Received!
        </h2>
        <p className="text-gray-400 text-lg mb-8 max-w-lg">
          Your game has been securely uploaded to our vault. Our moderation team
          will review it, and if approved, you will receive your Developer Badge
          and your game will go live.
        </p>
        <Link
          to="/"
          className="bg-synth-surface border border-synth-border hover:border-synth-primary text-white font-bold py-3 px-8 rounded-xl transition-all shadow-glow-card hover:shadow-glow-primary-sm"
        >
          Return to Library
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full min-h-screen">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-synth-primary transition-colors font-medium group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Back to Library
        </Link>
      </div>

      <div className="mb-10 border-l-4 border-synth-secondary pl-3">
        <h2 className="text-3xl font-extrabold text-white drop-shadow-[0_0_12px_rgba(255,159,67,0.2)]">
          Developer Program
        </h2>
        <p className="text-gray-400 mt-2 flex items-center gap-2 text-lg">
          Publish your homebrew creations to our global cloud.
        </p>
      </div>

      <div className="bg-synth-surface border border-synth-border rounded-2xl p-8 shadow-glow-card">
        <p className="text-gray-300 mb-8 leading-relaxed">
          Are you a retro developer? Test your{" "}
          <code className="text-synth-primary bg-synth-bg px-2 py-1 rounded">
            .nes
          </code>{" "}
          games in our Local Vault for free, or apply below to have them
          published to the official PIXELATED Cloud Library. Approved developers
          will receive a Verified Dev badge. We're happy to feature your work!
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">
                Developer Name{" "}
                <span className="text-synth-primary ml-1">*</span>
              </label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                required
                className="w-full bg-synth-bg border border-synth-border text-white rounded-xl px-4 py-3 focus:outline-none focus:border-synth-primary transition-colors"
                placeholder="Studio or Creator Name"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">
                Contact Email <span className="text-synth-primary ml-1">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-synth-bg border border-synth-border text-white rounded-xl px-4 py-3 focus:outline-none focus:border-synth-primary transition-colors"
                placeholder="you@domain.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">
              Game Title <span className="text-synth-primary ml-1">*</span>
            </label>
            <input
              type="text"
              value={gameTitle}
              onChange={(e) => setGameTitle(e.target.value)}
              required
              className="w-full bg-synth-bg border border-synth-border text-white rounded-xl px-4 py-3 focus:outline-none focus:border-synth-primary transition-colors"
              placeholder="Epic Quest 198X"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">
              ROM File (.nes) <span className="text-synth-primary ml-1">*</span>
            </label>
            <div
              className={`relative w-full h-14 bg-synth-bg border-2 border-dashed rounded-xl flex items-center justify-center transition-colors group cursor-pointer overflow-hidden ${romFile ? "border-synth-primary" : "border-synth-border hover:border-synth-primary"}`}
            >
              <input
                type="file"
                accept=".nes"
                onChange={handleRomChange}
                required
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div
                className={`flex items-center gap-2 transition-colors ${romFile ? "text-synth-primary" : "text-gray-400 group-hover:text-synth-primary"}`}
              >
                {romFile ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <UploadCloud className="w-5 h-5" />
                )}
                <span className="font-medium text-sm">
                  {romFile ? romFile.name : "Click to attach .nes file"}
                </span>
              </div>
            </div>
          </div>

          {/* OPTIONAL ART UPLOADS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">
                Cover Art{" "}
                <span className="text-gray-500 font-normal lowercase">
                  (optional)
                </span>
              </label>
              <div
                className={`relative w-full h-14 bg-synth-bg border-2 border-dashed rounded-xl flex items-center justify-center transition-colors group cursor-pointer overflow-hidden ${coverFile ? "border-synth-secondary" : "border-synth-border hover:border-synth-primary"}`}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageChange(e, setCoverFile)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div
                  className={`flex items-center gap-2 transition-colors ${coverFile ? "text-synth-secondary" : "text-gray-500 group-hover:text-synth-primary"}`}
                >
                  {coverFile ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <ImageIcon className="w-4 h-4" />
                  )}
                  <span className="font-medium text-sm truncate px-2">
                    {coverFile ? coverFile.name : "Upload Cover Image"}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">
                Banner Art{" "}
                <span className="text-gray-500 font-normal lowercase">
                  (optional)
                </span>
              </label>
              <div
                className={`relative w-full h-14 bg-synth-bg border-2 border-dashed rounded-xl flex items-center justify-center transition-colors group cursor-pointer overflow-hidden ${bannerFile ? "border-synth-secondary" : "border-synth-border hover:border-synth-primary"}`}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageChange(e, setBannerFile)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div
                  className={`flex items-center gap-2 transition-colors ${bannerFile ? "text-synth-secondary" : "text-gray-500 group-hover:text-synth-primary"}`}
                >
                  {bannerFile ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <ImageIcon className="w-4 h-4" />
                  )}
                  <span className="font-medium text-sm truncate px-2">
                    {bannerFile ? bannerFile.name : "Upload Banner Image"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">
              Game Description{" "}
              <span className="text-gray-500 font-normal lowercase">
                (optional)
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full bg-synth-bg border border-synth-border text-white rounded-xl px-4 py-3 focus:outline-none focus:border-synth-primary transition-colors resize-none"
              placeholder="Tell us about your game and controls..."
            ></textarea>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-synth-primary hover:bg-synth-primary-hover text-black font-bold text-lg py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-glow-primary active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Uploading to
                Vault...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" /> Submit for Review
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
