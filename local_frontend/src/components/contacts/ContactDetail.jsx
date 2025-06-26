import React from "react";

export default function ContactDetail({ contact }) {
  if (!contact) return null;

  return (
    <div className="mac-panel rounded-xl">
      {contact.image_base64 && (
        <img
          src={`data:image/png;base64,${contact.image_base64}`}
          alt="Kontaktbild"
          className="mb-4 rounded-full w-32 h-32 object-cover"
        />
      )}
      <p className="mb-1"><strong>Email:</strong> {contact.email}</p>
      <p className="mb-1"><strong>Phone:</strong> {contact.phone}</p>
      <p className="mb-1"><strong>Address:</strong> {contact.address}</p>
    </div>
  );
}