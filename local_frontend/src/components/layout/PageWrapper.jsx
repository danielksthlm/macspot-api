import React from "react";
import Header from "./Header.jsx";
import Sidebar from "./Sidebar.jsx";

function getPageTitle(path) {
  const map = {
    "/": "Översikt",
    "/contacts": "Kontakter",
    "/bookings": "Bokningar",
    "/prospects": "Prospekt",
    "/settings": "Systeminställningar",
  };
  return map[path] || "Northlight";
}

export default function PageWrapper({ children }) {
  return (
    <div className="flex h-screen bg-gray-100 text-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title={getPageTitle(window.location.pathname)} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}