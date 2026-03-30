import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import Landing from "./pages/Landing";
import Player from "./pages/Player";
import Auth from "./pages/Auth";
import Favorites from "./pages/Favorites";
import Profile from "./pages/Profile";
import ResetPassword from "./pages/ResetPassword";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-[#0B0F19] text-white font-sans antialiased flex flex-col selection:bg-[#00f2fe] selection:text-black">
        <Navbar />

        <main className="flex-grow pt-16">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/play/:id" element={<Player />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </Router>
  );
}

export default App;
