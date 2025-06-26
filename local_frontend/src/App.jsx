import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import PageWrapper from "./components/layout/PageWrapper";

import Dashboard from "./routes/Dashboard";
import Contacts from "./routes/Contacts";
import Bookings from "./routes/Bookings";
import Settings from "./routes/Settings";
import NotFound from "./routes/NotFound";

// Placeholder for Prospects page
function Prospects() {
  return <div className="p-8 text-lg">Prospekt-sidan är under utveckling.</div>;
}

export default function App() {
  console.log("✅ App.jsx är igång");
  return (
    <Router>
      <PageWrapper>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/prospects" element={<Prospects />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </PageWrapper>
    </Router>
  );
}