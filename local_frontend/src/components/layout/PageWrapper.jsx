import React from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function PageWrapper({ children }) {
  return (
    <div className="flex h-screen bg-gray-100 text-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}