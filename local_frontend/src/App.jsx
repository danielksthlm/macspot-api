import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import ContactDetail from "./components/ContactDetail";


const App = () => {
  const [contacts, setContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newContact, setNewContact] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company: "",
  });

  useEffect(() => {
    fetch("http://localhost:8000/contacts")
      .then((res) => {
        if (!res.ok) throw new Error("Nätverksfel");
        return res.json();
      })
      .then((data) => {
        setContacts(data);
        if (data.length > 0) setSelectedContact(data[0]);
      })
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, []);

  const handleSelect = (contact) => {
    if (selectedContact?.id === contact.id) {
      setSelectedContact(null); // toggle off
    } else {
      setSelectedContact(contact);
    }
  };

  // Hantera formulärändringar för ny kontakt
  const handleChange = (e) => {
    setNewContact({ ...newContact, [e.target.name]: e.target.value });
  };

  // Hantera submit av ny kontakt
  const handleSubmit = (e) => {
    e.preventDefault();
    fetch("http://localhost:8000/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newContact),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Kunde inte spara kontakt");
        return res.json();
      })
      .then((saved) => {
        setContacts((prev) => [...prev, saved]);
        setShowModal(false);
        setNewContact({
          first_name: "",
          last_name: "",
          email: "",
          phone: "",
          company: "",
        });
      })
      .catch(console.error);
  };

  return (
    <div className="flex gap-6 p-6">
      <div className="flex-1 space-y-4">
        <Header onNewContact={() => setShowModal(true)} />
        {isLoading ? (
          <div className="text-gray-400">Laddar kontakter...</div>
        ) : error ? (
          <div className="text-red-500">Fel: {error.message}</div>
        ) : contacts.length === 0 ? (
          <div className="mac-card text-gray-400">Inga kontakter tillgängliga.</div>
        ) : (
          [...contacts]
            .sort((a, b) => (a.last_name || "").localeCompare(b.last_name || ""))
            .map((contact) => (
              <div
                key={contact.id}
                className={`mac-card cursor-pointer hover:bg-gray-50`}
                onClick={() => handleSelect(contact)}
              >
                <h2 className="text-lg font-bold mb-1 hover:font-medium">
                  {`${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()}{" "}
                  {contact.company ? `| ${contact.company}` : ""}
                </h2>
                {selectedContact?.id === contact.id && (
                  <div className="transition-all max-h-[400px] mt-4 overflow-hidden">
                    <ContactDetail contact={selectedContact} />
                  </div>
                )}
              </div>
            ))
        )}
        {showModal && (
          <div
            className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50"
          >
            <div className="mac-panel rounded-xl space-y-4 w-full max-w-sm p-8 shadow-xl bg-white z-50 min-h-[460px]">
              <h2 className="text-lg font-bold">Ny kontakt</h2>
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Förnamn</label>
                  <input
                    name="first_name"
                    value={newContact.first_name}
                    onChange={handleChange}
                    placeholder="Förnamn"
                    className="input-mac w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Efternamn</label>
                  <input
                    name="last_name"
                    value={newContact.last_name}
                    onChange={handleChange}
                    placeholder="Efternamn"
                    className="input-mac w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">E-post</label>
                  <input
                    name="email"
                    value={newContact.email}
                    onChange={handleChange}
                    placeholder="E-post"
                    type="email"
                    className="input-mac w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Telefon</label>
                  <input
                    name="phone"
                    value={newContact.phone}
                    onChange={handleChange}
                    placeholder="Telefon"
                    className="input-mac w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Företag</label>
                  <input
                    name="company"
                    value={newContact.company}
                    onChange={handleChange}
                    placeholder="Företag"
                    className="input-mac w-full"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    className="mac-btn w-24"
                    onClick={() => setShowModal(false)}
                  >
                    Avbryt
                  </button>
                  <button type="submit" className="mac-btn w-24">
                    Spara
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;