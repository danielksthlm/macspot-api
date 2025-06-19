import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  FaIdCard, FaBuilding, FaStar, FaLink,
  FaFlag, FaClock, FaPaperPlane, FaRandom,
  FaFile, FaBriefcase, FaClipboardList,
  FaReceipt, FaDollarSign, FaLayerGroup, FaChartBar, FaPercentage,
  FaRedo, FaCog, FaUpload, FaDownload,
  FaChevronDown, FaChevronRight
} from "react-icons/fa";

const menu = [
  {
    title: "Relationer",
    items: [
      { to: "/contacts", icon: FaIdCard, label: "Kontakter" },
      { to: "/companies", icon: FaBuilding, label: "Företag" },
      { to: "/customers", icon: FaStar, label: "Kunder" },
      { to: "/relations", icon: FaLink, label: "Relationer" },
    ],
  },
  {
    title: "Marknad",
    items: [
      { to: "/prospects", icon: FaFlag, label: "Prospekt" },
      { to: "/kampanjer", icon: FaRandom, label: "Kampanjer" },
      { to: "/utskick", icon: FaPaperPlane, label: "Utskick" },
      { to: "/kommunikationslogg", icon: FaClock, label: "Kommunikationslogg" },
      { to: "/materialbank", icon: FaFile, label: "Materialbank" },
      { to: "/statistik", icon: FaChartBar, label: "Statistik" },
    ],
  },
  {
    title: "Uppdrag",
    items: [
      { to: "/offers", icon: FaFile, label: "Offerter" },
      { to: "/projekt", icon: FaBriefcase, label: "Projekt" },
      { to: "/projektlogg", icon: FaClipboardList, label: "Projektlogg" },
      { to: "/projektfiler", icon: FaPaperPlane, label: "Projektfiler" },
      { to: "/uppdragshistorik", icon: FaClipboardList, label: "Uppdragshistorik" },
    ],
  },
  {
    title: "Ekonomi",
    items: [
      { to: "/fakturor", icon: FaReceipt, label: "Fakturor" },
      { to: "/kundreskontra", icon: FaDollarSign, label: "Kundreskontra" },
      { to: "/verifications", icon: FaReceipt, label: "Verifikationer" },
      { to: "/transaktioner", icon: FaDollarSign, label: "Transaktioner" },
      { to: "/rapporter", icon: FaChartBar, label: "Rapporter" },
      { to: "/momsrapport", icon: FaPercentage, label: "Momsrapport" },
      { to: "/leverantorer", icon: FaBuilding, label: "Leverantörer" },
      { to: "/kontoplan", icon: FaLayerGroup, label: "Kontoplan" },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/settings", icon: FaCog, label: "Inställningar" }, // inkl behörigheter, Testdata/Sandbox, Backup/Restore
      { to: "/workflow", icon: FaRedo, label: "Workflow" },
      { to: "/import", icon: FaUpload, label: "Import" },
      { to: "/export", icon: FaDownload, label: "Export" },
    ],
  },
];

// Färg för inaktiv text (standard)
const navTextColor = "text-[var(--KLR_Whitesmoke)]";

// Hover-färg för text
const navTextColorHover = "hover:text-[var(--KLR_Orange)]";

// Stil för menytext som inline style
const navTextStyle = {
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '0.1em'
};

// Positionering för ikoner i menyobjekt
const navIconPosition = "absolute left-[12px] top-1/2 -translate-y-1/2";

// Samlad ikonstil (inkl. storlek)
const navIconStyle = `${navIconPosition} text-[16px]`;

// Vertikalt avstånd mellan menyobjekt
const navItemSpacing = "mb-[6px]";

// Grundlayout för varje menyobjekt
const navBaseClass = `relative flex items-center gap-[12px] rounded-lg px-[34px] focus:outline-none ${navItemSpacing}`;

// Klass för inaktivt menyobjekt (färg + ingen kant)
const navInactiveClass = `${navTextColor} border-l-[3px] border-transparent`;

// Hover-effekter (färg och vänsterkant)
const navHoverClass = `${navTextColorHover} hover:border-l-[3px] hover:border-[var(--KLR_Orange)]`;

// Klass för aktivt menyobjekt (bakgrund, färg och vänsterkant)
const navActiveClass = "bg-white/20 text-[var(--KLR_Orange)] border-l-[3px] border-[var(--KLR_Orange)]";

export default function Sidebar() {
  const groupTitleStyle = {
    fontWeight: 800,
    fontSize: '14px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--KLR_Whitesmoke)',
    marginBottom: '4px'
  };

  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(menu.map(group => [group.title, true]))
  );

  const toggleGroup = (title) => {
    setOpenGroups(prev => {
      const updated = {};
      Object.keys(prev).forEach(key => {
        updated[key] = key === title ? !prev[title] : false;
      });
      return updated;
    });
  };

  return (
    <div className="mac-sidebar">
      {/* Rubrik med bildbakgrund */}
      <div className="font-heading text-center mb-[-8px]">
        <span
          style={{
            borderStyle: "solid",
            borderWidth: "10px",
            fontWeight: "800",
            fontSize: "30px",
            padding: "20px",
            borderColor: "rgba(255, 255, 255, 0.5)",
            lineHeight: "20px",
            display: "inline-block"
          }}
          className="text-[var(--KLR_Whitesmoke)]"
        >
          Northlight
        </span>
        <div
          style={{
            fontSize: "9px",
            color: "rgba(255, 255, 255, 0.5)",
            marginTop: "-12px",
            fontWeight: "800",
            fontStyle: "italic",
            lineHeight: "11px",
            letterSpacing: "0.5px"
          }}
        >
          – navigate your business
        </div>
      </div>

      <div className="flex flex-col" style={{gap: '12px', marginTop: '0px'}}>
        {menu.map((group, index) => (
          <div key={index} className={group.title === "System" ? "mt-auto" : undefined}>
            <div
              style={groupTitleStyle}
              className="cursor-pointer flex items-center justify-between pr-2"
              onClick={() => toggleGroup(group.title)}
            >
              {group.title}
              {openGroups[group.title] ? (
                <FaChevronDown className="text-[10px] ml-2 text-[var(--KLR_Whitesmoke)]" />
              ) : (
                <FaChevronRight className="text-[10px] ml-2 text-[var(--KLR_Whitesmoke)]" />
              )}
            </div>
            {openGroups[group.title] && group.items.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) =>
                `${navBaseClass} ${isActive ? navActiveClass : navInactiveClass} ${navHoverClass}`}>
                <Icon className={navIconStyle} />
                <span style={navTextStyle}>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
