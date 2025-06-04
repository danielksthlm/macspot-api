

import React from "react";

export default function Dashboard() {
  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Översikt</h1>

      {/* KPI-kort */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-medium text-gray-700">Kontakter</h2>
          <p className="text-3xl font-bold text-blue-600">128</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-medium text-gray-700">Bokningar</h2>
          <p className="text-3xl font-bold text-green-600">43</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-medium text-gray-700">Senaste aktivitet</h2>
          <p className="text-3xl font-bold text-purple-600">7 st</p>
        </div>
      </div>

      {/* Aktivitetspanel */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Senaste aktivitet</h2>
        <ul className="space-y-2">
          <li className="text-sm text-gray-600">📬 Ny kontakt: anna@exempel.se</li>
          <li className="text-sm text-gray-600">📅 Bokning skapad: Möte 13:00</li>
          <li className="text-sm text-gray-600">📌 Kontakt redigerad: Johan Karlsson</li>
        </ul>
      </div>
    </div>
  );
}