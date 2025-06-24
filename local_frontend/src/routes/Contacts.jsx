import React, { useEffect, useState, useMemo } from "react";
import ContactList from "../components/contacts/ContactList";
import ContactPanel from "../components/contacts/ContactPanel";

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState("grid");
  const [sortBy, setSortBy] = useState("last_name");
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
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

  const uniqueCompanies = useMemo(() => {
    const names = contacts.map(c => c.company).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
      const email = c.email?.toLowerCase() || "";
      const company = c.company?.toLowerCase() || "";
      const term = searchTerm.toLowerCase();
      const matchesSearch = fullName.includes(term) || email.includes(term) || company.includes(term);
      const matchesCompany = !companyFilter || c.company === companyFilter;
      return matchesSearch && matchesCompany;
    });
  }, [contacts, searchTerm, companyFilter]);

  const sortedContacts = useMemo(() => {
    return [...filteredContacts].sort((a, b) =>
      (a[sortBy] || "").localeCompare(b[sortBy] || "")
    );
  }, [filteredContacts, sortBy]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Kontakter</h1>
          <div className="text-sm text-gray-500">
            {sortedContacts.length} kontakt{sortedContacts.length !== 1 && "er"} funna
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-sm text-gray-600">Sortera efter:</label>
          <select
            id="sort"
            className="border px-2 py-1 rounded text-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="last_name">Efternamn</option>
            <option value="first_name">Förnamn</option>
            <option value="company">Företag</option>
          </select>
          <input
            type="text"
            placeholder="Sök..."
            className="border px-2 py-1 rounded text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="border px-2 py-1 rounded text-sm"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="">Alla företag</option>
            {uniqueCompanies.map((company) => (
              <option key={company} value={company}>{company}</option>
            ))}
          </select>
          <button onClick={() => setViewMode("grid")} className={`text-sm px-2 py-1 rounded ${viewMode === "grid" ? "bg-blue-500 text-white" : "bg-gray-100"}`}>🔲</button>
          <button onClick={() => setViewMode("list")} className={`text-sm px-2 py-1 rounded ${viewMode === "list" ? "bg-blue-500 text-white" : "bg-gray-100"}`}>📄</button>
          <button className="ml-4 text-sm px-2 py-1 rounded bg-green-500 text-white hover:bg-green-600">
            ➕ Ny kontakt
          </button>
        </div>
      </div>
      {error && <p className="text-red-500">Fel: {error.message}</p>}
      <div className="flex gap-6">
        <div className="w-2/3 max-h-[75vh] overflow-y-auto pr-2">
          <ContactList contacts={sortedContacts} onSelectContact={setSelectedId} viewMode={viewMode} />
        </div>
        <div className="w-1/3">
          {selectedContact && <ContactPanel contact={selectedContact} />}
        </div>
      </div>
    </div>
  );
}