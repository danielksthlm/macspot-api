import React from "react";

export default function ContactList({ contacts, onSelectContact }) {
  return (
    <div className="p-4">
      <ul>
        {contacts.map((contact) => (
          <li
            key={contact.id}
            className={`mac-card cursor-pointer hover:bg-gray-50`}
            onClick={() => onSelectContact(contact.id)}
          >
            <h2 className="text-lg font-bold mb-1 hover:font-medium">{contact.name}</h2>
            <p className="text-sm text-gray-600">{contact.email}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}