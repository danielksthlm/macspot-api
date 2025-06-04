import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="p-6 text-center">
      <h1 className="text-3xl font-bold text-red-600">404 – Sidan kunde inte hittas</h1>
      <p className="mt-4 text-gray-700">Sidan du letade efter finns inte.</p>
      <Link to="/" className="mt-6 inline-block text-blue-600 underline">
        Gå till startsidan
      </Link>
    </div>
  );
}
