import React from "react";

export default function ContactDetail({ contact, onClose }) {
  if (!contact) return null;

  return (
    <div className="p-4 border rounded shadow-sm bg-white">
      <button
        onClick={onClose}
        className="mb-2 text-sm text-blue-500 hover:underline"
      >
        Close
      </button>
      <h2 className="text-xl font-bold mb-2">
        {contact.first_name} {contact.last_name}
      </h2>
      <p className="mb-1"><strong>Email:</strong> {contact.email}</p>
      <p className="mb-1"><strong>Phone:</strong> {contact.phone}</p>
      <p className="mb-1"><strong>Address:</strong> {contact.address}</p>
    </div>
  );
}