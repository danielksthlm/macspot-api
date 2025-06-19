import React, { useEffect, useState } from "react";
import ContactList from "../components/contacts/ContactList";
import ContactPanel from "../components/contacts/ContactPanel";

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const selectedContact = contacts.find(c => c.id === selectedId);

  useEffect(() => {
    fetch("http://localhost:8000/contacts")
      .then((res) => {
        if (!res.ok) throw new Error("Fel vid hämtning av kontakter");
        return res.json();
      })
      .then((data) => {
        console.log("📥 Kontakter laddade:", data);
        setContacts(data);
      })
      .catch(setError);
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold mb-4">Kontakter</h1>
      {error && <p className="text-red-500">Fel: {error.message}</p>}
      <div className="flex gap-6">
        <div className="w-2/3">
          <ContactList contacts={contacts} onSelectContact={setSelectedId} />
        </div>
        <div className="w-1/3">
          {selectedContact && <ContactPanel contact={selectedContact} />}
        </div>
      </div>
    </div>
  );
}