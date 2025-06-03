import React from "react";

export default function ContactDetail({ contact }) {
  if (!contact) return null;

  return (
    <div className="mac-panel rounded-xl">
      <p className="mb-1"><strong>Email:</strong> {contact.email}</p>
      <p className="mb-1"><strong>Phone:</strong> {contact.phone}</p>
      <p className="mb-1"><strong>Address:</strong> {contact.address}</p>
    </div>
  );
}