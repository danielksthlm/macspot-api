

import React from "react";

export default function ContactSidebar() {
  return (
    <aside className="w-20 bg-white border-r flex flex-col items-center py-4 shadow-sm">
      <div className="w-10 h-10 bg-gray-300 rounded-full mb-6" />
      <nav className="space-y-6">
        <button className="w-8 h-8 bg-blue-500 rounded-full" title="Kontakter" />
        <button className="w-8 h-8 bg-gray-300 rounded-full" title="Bokningar" />
        <button className="w-8 h-8 bg-gray-300 rounded-full" title="Inställningar" />
      </nav>
    </aside>
  );
}