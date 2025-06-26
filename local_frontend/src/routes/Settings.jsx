import React, { useEffect, useState } from "react";

export default function Settings() {
  const [bookingSettings, setBookingSettings] = useState({});
  const [tableMetadata, setTableMetadata] = useState([]);
  const [activeTab, setActiveTab] = useState("booking");

  useEffect(() => {
    fetch("http://localhost:8000/booking-settings")
      .then(res => res.json())
      .then(data => setBookingSettings(data));
    fetch("http://localhost:8000/table-metadata")
      .then(res => res.json())
      .then(data => setTableMetadata(data));
  }, []);

  const saveBookingSetting = (key, value) => {
    fetch(`http://localhost:8000/booking-settings/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  };

  const saveFieldMetadata = (table, field, newDescription) => {
    fetch(`http://localhost:8000/table-metadata/${table}/${field}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: newDescription }),
    });
  };

  const formatLabel = (str) =>
    str.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

  // Gruppindelning av bokningsinställningar
  const settingGroups = {
    "Standardinställningar": [
      "default_language", "default_meeting_subject", "default_meeting_length_atclient",
      "default_meeting_length_atoffice", "default_meeting_length_digital",
      "default_home_address", "default_office_address", "timezone"
    ],
    "Tillgänglighet & regler": [
      "open_time", "close_time", "lunch_start", "lunch_end", "max_days_in_advance",
      "max_weekly_booking_minutes", "buffer_between_meetings", "block_weekends",
      "block_holidays", "meeting_types", "meeting_digital", "available_meeting_room",
      "room_priority_atoffice", "require_approval", "required_fields", "allowed_atclient_meeting_days"
    ],
    "Reselogik & restid": [
      "fallback_travel_time_minutes", "travel_time_window_start", "travel_time_window_end",
      "include_map_link"
    ],
    "E-post & inbjudningar": [
      "ms_sender_email", "email_invite_template", "email_signature",
      "email_subject_templates", "email_body_templates"
    ],
    "System & cache": [
      "analytics_enabled", "cache_ttl_minutes"
    ]
  };

  return (
    <>
      <div className="flex gap-4 mb-6">
        <button
          className={`px-4 py-2 rounded ${activeTab === "booking" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("booking")}
        >
          Bokningsregler
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "metadata" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("metadata")}
        >
          Fältbeskrivningar
        </button>
      </div>

      {activeTab === "booking" && (
        <div className="bg-white/70 backdrop-blur p-6 rounded-xl shadow-md mb-10 border border-blue-100">
          <h2 className="mac-h2 mb-4">Bokningsregler</h2>
          {Object.entries(settingGroups).map(([groupLabel, keys]) => (
            <details key={groupLabel} className="mb-4 border border-gray-300 rounded">
              <summary className="cursor-pointer bg-gray-100 px-4 py-2 font-medium">{groupLabel}</summary>
              <div className="grid gap-4 px-4 py-2">
                {keys.map((key) => (
                  key in bookingSettings && (
                    <div key={key}>
                      <label className="mac-body block mb-1">{formatLabel(key)}</label>
                      <input
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={bookingSettings[key]}
                        onChange={(e) =>
                          setBookingSettings((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        onBlur={(e) => saveBookingSetting(key, e.target.value)}
                      />
                    </div>
                  )
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {activeTab === "metadata" && (
        <div className="bg-white/70 backdrop-blur p-6 rounded-xl shadow-md mb-10 border border-blue-100">
          <h2 className="text-xl font-semibold mb-4">Fältbeskrivningar</h2>
          <div className="overflow-auto max-h-[60vh] border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Tabell</th>
                  <th className="px-4 py-2">Fält</th>
                  <th className="px-4 py-2">Beskrivning</th>
                </tr>
              </thead>
              <tbody>
                {tableMetadata.map((row, i) => (
                  <tr key={`table-${row.table_name}__field-${row.field}`}>
                    <td className="px-4 py-2">{row.table_name}</td>
                    <td className="px-4 py-2">{row.field}</td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        defaultValue={row.description}
                        onBlur={(e) =>
                          saveFieldMetadata(row.table_name, row.field, e.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}