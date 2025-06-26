import React, { useState } from "react";

export default function ContactList({ contacts, onSelectContact, viewMode }) {
  if (!Array.isArray(contacts)) {
    return <div className="text-gray-400 p-4">Kontakter laddas...</div>;
  }
  const [roleFilter, setRoleFilter] = useState("");

  if (!contacts || contacts.length === 0) {
    return <div className="text-gray-400 p-4">Inga kontakter att visa</div>;
  }

  if (viewMode === "grid") {
    return (
      <>
        <div className="mb-4 flex space-x-2">
          <select
            className="border px-2 py-1 rounded text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">Alla roller</option>
            {Array.from(new Set(contacts.flatMap(c => c.emails?.map(e => e.role).filter(Boolean)))).sort().map((role) => (
              <option key={`role-${role}`} value={role}>{role}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {contacts.filter(c => {
            const roles = c.emails?.map(e => e.role?.toLowerCase()) || [];
            const matchesRole = !roleFilter || roles.includes(roleFilter.toLowerCase());
            return matchesRole;
          }).map((c, i) => {
            const initials = `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase();
            return (
              <div
                key={`${c.id}-${i}`}
                className="mac-card p-4 shadow rounded-xl bg-white cursor-pointer hover:shadow-md transition"
                onClick={() => onSelectContact(c.id)}
              >
                {c.image_base64 ? (
                  <img
                    src={`data:image/png;base64,${c.image_base64}`}
                    alt="Kontaktbild"
                    className="mac-avatar mb-2 rounded-full w-16 h-16 object-cover"
                  />
                ) : (
                  <div className="mac-avatar mb-2">{initials}</div>
                )}
                <h2 className="text-lg font-bold">
                  {c.first_name} {c.last_name}{" "}
                  {c.main_contact && <span title="Huvudkontakt" className="text-yellow-500">★</span>}
                </h2>
                <ul className="text-sm text-gray-600 space-y-1">
                  {c.emails?.map((e, i) => (
                    <li key={i}>
                      {e.label && <span className="mr-1">{e.label}</span>}
                      {e.email}
                      {e.company_name && <> – {e.company_name}</>}
                      {e.main_contact && <span className="ml-1 text-yellow-500" title="Huvudkontakt">★</span>}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-gray-700">Företag: {c.company}</p>
                <p className="text-sm text-gray-700">Bokningar: {c.booking_count}</p>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  if (viewMode === "list") {
    return (
      <>
        <div className="mb-4 flex space-x-2">
          <select
            className="border px-2 py-1 rounded text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">Alla roller</option>
            {Array.from(new Set(contacts.flatMap(c => c.emails?.map(e => e.role).filter(Boolean)))).sort().map((role) => (
              <option key={`role-${role}`} value={role}>{role}</option>
            ))}
          </select>
        </div>
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
            {contacts.filter(c => {
              const roles = c.emails?.map(e => e.role?.toLowerCase()) || [];
              const matchesRole = !roleFilter || roles.includes(roleFilter.toLowerCase());
              return matchesRole;
            }).map((c, i) => (
              <tr key={`${c.id}-${i}`} className="hover:bg-gray-50 cursor-pointer" onClick={() => onSelectContact(c.id)}>
                <td className="px-4 py-2">
                  {c.image_base64 && (
                    <img
                      src={`data:image/png;base64,${c.image_base64}`}
                      alt="Kontaktbild"
                      className="inline-block w-6 h-6 rounded-full mr-2 object-cover"
                    />
                  )}
                  {c.first_name} {c.last_name}{" "}
                  {c.main_contact && <span title="Huvudkontakt" className="text-yellow-500">★</span>}
                </td>
                <td className="px-4 py-2">
                  <ul>
                    {c.emails?.map((e, i) => (
                      <li key={i}>
                        {e.label && <strong>{e.label}</strong>} {e.email}
                        {e.company_name && <> – {e.company_name}</>}
                        {e.main_contact && <span className="ml-1 text-yellow-500" title="Huvudkontakt">★</span>}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-4 py-2">{c.company}</td>
                <td className="px-4 py-2">{c.booking_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  return null;
}