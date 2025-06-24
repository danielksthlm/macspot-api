import React from "react";

export default function ContactList({ contacts, onSelectContact, viewMode }) {
  if (!contacts || contacts.length === 0) {
    return <div className="text-gray-400 p-4">Inga kontakter att visa</div>;
  }

  if (viewMode === "grid") {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {contacts.map((c) => {
          const initials = `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase();
          return (
            <div
              key={c.id}
              className="mac-card p-4 shadow rounded-xl bg-white cursor-pointer hover:shadow-md transition"
              onClick={() => onSelectContact(c.id)}
            >
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

  if (viewMode === "list") {
    return (
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Namn</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">E-post</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Företag</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bokningar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {contacts.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onSelectContact(c.id)}>
              <td className="px-4 py-2">{c.first_name} {c.last_name}</td>
              <td className="px-4 py-2">{c.email}</td>
              <td className="px-4 py-2">{c.company}</td>
              <td className="px-4 py-2">{c.booking_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return null;
}