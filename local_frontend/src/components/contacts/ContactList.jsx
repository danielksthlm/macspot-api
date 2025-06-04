import React from "react";

export default function ContactList({ contacts }) {
  if (!contacts || contacts.length === 0) {
    return <div className="text-gray-400 p-4">Inga kontakter att visa</div>;
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      {contacts.map((c) => {
        const initials = `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase();
        return (
          <div key={c.id} className="mac-card p-4 shadow rounded-xl bg-white">
            <div className="mac-avatar mb-2">{initials}</div>
            <h2 className="text-lg font-bold">{c.first_name} {c.last_name}</h2>
            <p className="text-sm text-gray-600">{c.email}</p>
            <p className="text-sm text-gray-700">Företag: {c.company}</p>
            <p className="text-sm text-gray-700">Bokningar: {c.booking_count}</p>
          </div>
        );
      })}
    </div>
  );
}