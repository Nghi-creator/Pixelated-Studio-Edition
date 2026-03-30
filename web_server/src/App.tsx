import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import Landing from "./pages/Landing";
import Player from "./pages/Player";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-[#0B0F19] text-white font-sans antialiased flex flex-col selection:bg-[#00f2fe] selection:text-black">
        <Navbar />

        <main className="flex-grow pt-16">
          <Routes>
            <Route path="/" element={<Landing />} />
            {/* Swap the placeholder for the real Player component */}
            <Route path="/play/:id" element={<Player />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </Router>
  );
}

export default App;
