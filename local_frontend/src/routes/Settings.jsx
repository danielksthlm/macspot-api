import React, { useEffect, useState } from "react";

export default function Settings() {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    fetch("http://localhost:8000/settings")
      .then(res => res.json())
      .then(data => setSettings(data));
  }, []);

  const updateValue = (key, newValue) => {
    setSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], value: newValue },
    }));
  };

  const saveSetting = (key) => {
    fetch(`http://localhost:8000/settings/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: settings[key].value }),
    }).then(() => alert("Uppdaterat!"));
  };

  const renderInput = (key, value, type) => {
    if (type === "string") {
      return (
        <input
          className="w-full border p-2 text-sm"
          value={value}
          onChange={(e) => updateValue(key, e.target.value)}
        />
      );
    }

    if (type === "array") {
      return (
        <div className="space-y-1">
          {value.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="number"
                className="border p-1 w-20"
                value={item}
                onChange={(e) => {
                  const newArray = [...value];
                  newArray[i] = parseInt(e.target.value);
                  updateValue(key, newArray);
                }}
              />
              <button
                className="text-red-500"
                onClick={() => {
                  const newArray = value.filter((_, idx) => idx !== i);
                  updateValue(key, newArray);
                }}
              >
                −
              </button>
            </div>
          ))}
          <button
            className="mt-2 text-sm text-blue-600"
            onClick={() => updateValue(key, [...value, 0])}
          >
            + Lägg till värde
          </button>
        </div>
      );
    }

    if (type === "json") {
      return (
        <div className="space-y-1">
          {Object.entries(value).map(([subKey, subVal]) => (
            <div key={subKey}>
              <label className="block text-xs text-gray-600">{subKey}</label>
              <input
                className="w-full border p-1 text-sm"
                value={subVal}
                onChange={(e) => {
                  updateValue(key, { ...value, [subKey]: e.target.value });
                }}
              />
            </div>
          ))}
        </div>
      );
    }

    return <pre>{JSON.stringify(value)}</pre>;
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Systeminställningar</h1>
      <div className="space-y-4">
        {Object.entries(settings).map(([key, obj]) => (
          <div key={key} className="bg-white p-4 shadow rounded">
            <div className="text-sm text-gray-500 mb-1">{key}</div>
            {renderInput(key, obj.value, obj.value_type)}
            <button
              className="mt-2 px-4 py-1 bg-blue-600 text-white rounded"
              onClick={() => saveSetting(key)}
            >
              Spara
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}