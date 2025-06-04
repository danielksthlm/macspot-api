import React, { useEffect, useState } from "react";
import ContactList from "../components/contacts/ContactList";

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState(null);

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
      <h1 className="text-2xl font-bold">Kontakter</h1>
      {error && <p className="text-red-500">Fel: {error.message}</p>}
      <>
        {console.log("🔄 ContactList renderas med:", contacts)}
        <ContactList contacts={contacts} />
      </>
    </div>
  );
}