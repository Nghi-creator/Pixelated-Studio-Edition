const externalLinks = {
  github: "https://github.com/Nghi-creator",
  linkedin: "https://www.linkedin.com/in/nicholas-nguyen-3bb17a335/",
};

function openExternalLink(url: string) {
  const newWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (newWindow) {
    newWindow.opener = null;
  }
}

export default function Footer() {
  return (
    <footer className="border-t border-synth-border/60 mt-auto bg-synth-bg py-8">
      <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center text-gray-500 text-sm">
        <p>&copy; 2026 WebRTC Cloud Console. All rights reserved.</p>
        <div className="flex gap-4 mt-4 md:mt-0 items-center">
          <span className="text-gray-400">Built by Nicholas Nguyen</span>
          <button
            className="text-gray-400 transition-colors hover:text-white"
            onClick={() => openExternalLink(externalLinks.github)}
            type="button"
          >
            GitHub
          </button>
          <button
            className="text-gray-400 transition-colors hover:text-white"
            onClick={() => openExternalLink(externalLinks.linkedin)}
            type="button"
          >
            LinkedIn
          </button>
        </div>
      </div>
    </footer>
  );
}
