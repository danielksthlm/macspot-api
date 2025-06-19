import React from "react";
import { NavLink } from "react-router-dom";
import {
  FaTachometerAlt, FaIdCard, FaBuilding, FaStar, FaLink,
  FaFlag, FaClock, FaPaperPlane, FaRandom,
  FaFile, FaBriefcase, FaClipboardList,
  FaReceipt, FaDollarSign, FaLayerGroup, FaChartBar, FaPercentage,
  FaRedo, FaUserShield, FaCog, FaUpload, FaDownload
} from "react-icons/fa";

export default function Sidebar() {
  return (
    <div className="mac-sidebar">
      {/* Rubrik med bildbakgrund */}
      <div className="font-heading text-center py-6">
        <span
          style={{
            color: "var(--KLR_Whitesmoke)",
            borderStyle: "solid",
            borderWidth: "10px",
            fontWeight: "800",
            fontSize: "30px",
            padding: "20px",
            borderColor: "rgba(255, 255, 255, 0.5)",
            lineHeight: "20px",
            display: "inline-block"
          }}
        >
          MacSpot
        </span>
        <div
          style={{
            fontSize: "10px",
            color: "white",
            marginTop: "-12px",
            fontWeight: "800",
            fontStyle: "italic",
            lineHeight: "12px",
            letterSpacing: "0.5px"
          }}
        >
          by AnyNode
        </div>
      </div>

      {/* Grupp: Relationer */}
        <div className="text-[10px] uppercase tracking-widest text-KLR_Whitesmoke/60 font-semibold px-3 mb-1">Relationer</div>

        <NavLink to="/contacts" className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium tracking-wide ${
            isActive ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/80'
          }`
        }>
          <FaIdCard className="text-base" />
          <span>Kontakter</span>
        </NavLink>

        <NavLink to="/companies" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 text-white/80 text-sm font-medium tracking-wide">
          <FaBuilding className="text-base" />
          <span>Företag</span>
        </NavLink>

        <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium tracking-wide text-white/40">
          <FaStar className="text-base" />
          <span>Kunder (filter)</span>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium tracking-wide text-white/40">
          <FaLink className="text-base" />
          <span>Relationer (CC)</span>
        </div>

      {/* Grupp: Marknad & Kommunikation */}
      <div className="space-y-1">
        <div className="text-[11px] text-gray-300 tracking-wider uppercase px-3 mb-1">Marknad</div>
        <NavLink to="/prospects" className={({ isActive }) =>
          `flex items-center gap-3 text-base px-3 py-2 rounded ${isActive ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/80'}`
        }>
          <FaFlag className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Prospekt</span>
        </NavLink>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaClock className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Kommunikationslogg</span>
        </div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaPaperPlane className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Utskick</span>
        </div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaRandom className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Kampanjer</span>
        </div>
      </div>

      {/* Grupp: Uppdrag */}
      <div className="space-y-1">
        <div className="text-[11px] text-gray-300 tracking-wider uppercase px-3 mb-1">Uppdrag</div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaFile className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Offerter</span>
        </div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaBriefcase className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Projekt</span>
        </div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaClipboardList className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Projektlogg</span>
        </div>
      </div>

      {/* Grupp: Ekonomi */}
      <div className="space-y-1">
        <div className="text-[11px] text-gray-300 tracking-wider uppercase px-3 mb-1">Ekonomi</div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaReceipt className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Verifikationer</span>
        </div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaDollarSign className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Transaktioner</span>
        </div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaLayerGroup className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Kontoplan</span>
        </div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaChartBar className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Rapporter</span>
        </div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaPercentage className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Momsrapport</span>
        </div>
      </div>

      {/* Grupp: System */}
      <div className="space-y-1 mt-auto">
        <div className="text-[11px] text-gray-300 tracking-wider uppercase px-3 mb-1">System</div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaRedo className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Workflow</span>
        </div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaUserShield className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Roller</span>
        </div>
        <NavLink to="/settings" className={({ isActive }) =>
          `flex items-center gap-3 text-base px-3 py-2 rounded ${isActive ? 'bg-blue-700 text-white' : 'hover:bg-blue-800'}`
        }>
          <FaCog className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Inställningar</span>
        </NavLink>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaUpload className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Import</span>
        </div>
        <div className="flex items-center gap-3 text-base px-3 py-2 text-gray-500">
          <FaDownload className="text-lg" />
          <span className="text-sm font-medium tracking-wide">Export</span>
        </div>
      </div>
    </div>
  );
}
