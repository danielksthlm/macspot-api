import React from "react";

export default function Header({ onNewContact }) {
  return (
    <header className="h-16 px-6 flex items-center justify-between bg-white shadow-sm">
      <h1 className="text-xl font-semibold">Kontakter</h1>
      <button className="mac-btn" onClick={onNewContact}>
        + Ny kontakt
      </button>
    </header>
  );
}
