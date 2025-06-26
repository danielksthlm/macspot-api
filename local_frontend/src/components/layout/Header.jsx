import React from "react";

export default function Header({ mainTitle, subTitle, onNewContact, className = "", style }) {
  return (
    <header
      className={className}
      style={{
        display: "flex",
        alignItems: "flex-start",
        padding: "20px",
        ...style,
      }}
    >
      <div style={{ paddingRight: "10px" }}>
        <h1 className="mac-h1">
          {mainTitle || "Northlight"}
        </h1>
        <div className="mac-subtitle">
          {subTitle}
        </div>
      </div>
      {onNewContact && (
        <button className="mac-btn" onClick={onNewContact}>
          + Ny kontakt
        </button>
      )}
    </header>
  );
}