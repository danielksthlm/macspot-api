import React from "react";
import ContactList from "./components/ContactList";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="p-4 border-b bg-white shadow">
        <h1 className="text-2xl font-bold">MacSpot CRM Dashboard</h1>
      </header>
      <main className="p-6">
        <ContactList />
      </main>
    </div>
  );
}