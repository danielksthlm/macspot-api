import React from "react";

export default function ContactPanel({ contact }) {
  return (
    <aside className="hidden lg:block mac-panel w-[26rem]">
      {!contact ? (
        <p className="text-gray-400">Välj en kontakt för att visa detaljer.</p>
      ) : (
        <>
          <h2 className="text-xl font-bold mb-2">
            {contact.first_name} {contact.last_name}
          </h2>
          <p className="mb-1"><strong>Email:</strong> {contact.email}</p>
          <p className="mb-1"><strong>Telefon:</strong> {contact.phone}</p>
          <p className="mb-1"><strong>Företag:</strong> {contact.company}</p>
        </>
      )}
    </aside>
  );
}