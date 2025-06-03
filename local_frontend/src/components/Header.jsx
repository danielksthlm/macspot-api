import React from "react";

export default function Header() {
  return (
    <header className="h-16 px-6 flex items-center justify-between bg-white border-b shadow-sm">
      <h1 className="text-xl font-semibold">Kontakter</h1>
      <button className="mac-btn">
        + Ny kontakt
      </button>
    </header>
  );
}
