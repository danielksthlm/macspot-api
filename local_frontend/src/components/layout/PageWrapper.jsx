import { useLocation } from "react-router-dom";
import React from "react";
import Header from "./Header.jsx";
import Sidebar from "./Sidebar.jsx";

function getHeaderTitles(path) {
  const structure = {
    "/contacts": ["Relationer", "Kontakter"],
    "/bookings": ["Relationer", "Bokningar"],
    "/prospects": ["Relationer", "Prospekt"],
    "/campaigns": ["Marknad", "Kampanjer"],
    "/mailings": ["Marknad", "Utskick"],
    "/projects": ["Uppdrag", "Projekt"],
    "/tasks": ["Uppdrag", "Att göra"],
    "/reports": ["Ekonomi", "Rapporter"],
    "/invoices": ["Ekonomi", "Fakturor"],
    "/settings": ["System", "Inställningar"],
  };
  return structure[path] || ["Northlight", ""];
}

export default function PageWrapper({ children }) {
  const location = useLocation();
  const [mainTitle, subTitle] = getHeaderTitles(location.pathname);
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header mainTitle={mainTitle} subTitle={subTitle} />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}