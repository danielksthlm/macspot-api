import React, { useEffect, useState } from "react";

export default function ContactList() {
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    fetch("http://localhost:8000/contacts/")
      .then((res) => res.json())
      .then((data) => setContacts(data));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Kontakter</h1>
      <ul className="space-y-2">
        {contacts.map((c) => (
          <li key={c.id} className="p-4 border rounded shadow">
            <p className="font-semibold">{c.first_name} {c.last_name}</p>
            <p className="text-sm text-gray-600">{c.email}</p>
            <p className="text-sm">Företag: {c.company}</p>
            <p className="text-sm">Bokningar: {c.booking_count}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}