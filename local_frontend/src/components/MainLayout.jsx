import React, { useState } from "react";
import ContactSidebar from "./ContactSidebar";
import ContactPanel from "./ContactPanel";

export default function MainLayout({ children }) {
  const [selectedContact, setSelectedContact] = useState(null);

  return (
    <div className="flex min-h-screen bg-[#f9f9f9] text-gray-900">
      <ContactSidebar />
      <main className="flex-1 flex">
        {React.cloneElement(children, {
          selectedContact,
          setSelectedContact
        })}
        <ContactPanel contact={selectedContact} />
      </main>
    </div>
  );
}