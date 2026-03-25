export default function Footer() {
  return (
    <footer className="border-t border-gray-800 mt-auto bg-[#0B0F19] py-8">
      <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center text-gray-500 text-sm">
        <p>&copy; 2026 WebRTC Cloud Console. All rights reserved.</p>
        <div className="flex gap-4 mt-4 md:mt-0 items-center">
          <span className="text-gray-400">Built by Nick</span>
          <a href="#" className="hover:text-[#00f2fe] transition-colors">
            GitHub
          </a>
          <a href="#" className="hover:text-[#00f2fe] transition-colors">
            LinkedIn
          </a>
        </div>
      </div>
    </footer>
  );
}
