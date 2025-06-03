import React, { useEffect, useState } from "react";

export default function ContactList({ selectedContact, setSelectedContact }) {
  const [contacts, setContacts] = useState([]);
  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

  useEffect(() => {
    fetch(`${API_BASE}/contacts/`)
      .then((res) => res.json())
      .then((data) => {
        setContacts(data);
      })
      .catch((error) => console.error("Kunde inte ladda kontakter:", error));
  }, []);

  return (
    <div className="p-6 flex flex-col lg:flex-row gap-6">
      <div className="flex-1">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Kontakter</h1>
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {contacts.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelectedContact(c)}
              className={`mac-card cursor-pointer ${
                selectedContact && selectedContact.id === c.id ? "border-blue-500" : ""
              }`}
            >
              <h2 className="text-lg font-bold mb-1">{c.first_name} {c.last_name}</h2>
              <p className="text-sm text-gray-600">{c.email}</p>
              <p className="text-sm text-gray-700">Företag: {c.company}</p>
              <p className="text-sm text-gray-700">Bokningar: {c.booking_count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}