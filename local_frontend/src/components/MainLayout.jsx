import React from "react";

export default function ContactList({ contacts, selectedContact, setSelectedContact }) {
  return (
    <div className="p-4">
      {contacts.map((contact) => (
        <div
          key={contact.id}
          className={`mac-card cursor-pointer hover:bg-gray-50 ${selectedContact?.id === contact.id ? "bg-gray-100" : ""}`}
          onClick={() => setSelectedContact(contact)}
        >
          <h2 className="text-lg font-bold mb-1 hover:font-medium">{contact.firstName} {contact.lastName}</h2>
          <p className="text-sm text-gray-600">{contact.email}</p>
        </div>
      ))}
    </div>
  );
}