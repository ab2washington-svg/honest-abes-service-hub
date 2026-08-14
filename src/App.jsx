import React, { useState, useEffect, useRef, useMemo } from "react";
import { storageGet, storageSet } from "./lib/storage.js";
import { callAI, checkAIConfigured } from "./lib/ai.js";
import { loginWithPassword, verifySession } from "./lib/auth.js";

// Roles that require a real password (checked server-side in /api/auth).
// Customers are intentionally excluded — they keep the simple demo flow.
const PASSWORD_PROTECTED_ROLES = ["admin", "technician"];

/* ============================================================================
   HONEST ABES SERVICE HUB — ZERO-COST-FIRST BUILD
   ----------------------------------------------------------------------------
   Architecture notes (also surfaced live in Admin → Integrations):
   - "Database": window.storage (shared) — swap-in path: Supabase free tier
     (Postgres, 500MB, free forever tier) with the same job/user shape.
   - "Auth": lightweight demo role login — swap-in path: Supabase Auth
     (free) or Clerk free tier, both offer email/magic-link at $0.
   - "File/photo storage": images resized client-side and stored as data
     URLs inside the job record — swap-in path: Supabase Storage free tier
     (1GB free) once you're off single-user demo storage.
   - "AI (OpenAI)": OFF by default everywhere. Nothing in this app calls
     OpenAI. The toggle in Admin → Integrations only flips a flag and shows
     where a real server route + secret key would plug in.
   - "Payments": no processor wired up. Invoices can be marked Paid manually
     (cash/check/zelle etc). Stripe is a labeled, inert integration point.
   - "Email/SMS": simulated. Actions that would normally fire a notification
     instead log an entry to the in-app Notifications feed, labeled as such.
============================================================================ */

/* ---------------------------- Design tokens ---------------------------- */
const C = {
  ink: "#1B2430",
  paper: "#F6F3EC",
  paperDim: "#EDE8DC",
  steel: "#3D5A80",
  steelDark: "#28405C",
  orange: "#E1601F",
  orangeDark: "#B8490F",
  slate: "#6B7280",
  slateLight: "#9AA1AC",
  green: "#2F7A55",
  amber: "#B5820A",
  red: "#B03A2E",
  purple: "#6247AA",
  line: "#D8D2C2",
  white: "#FFFFFF",
};

const FONTS = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
    .fd { font-family: 'Barlow Condensed', sans-serif; letter-spacing: 0.01em; }
    .fb { font-family: 'Inter', sans-serif; }
    .fm { font-family: 'IBM Plex Mono', monospace; }
    * { box-sizing: border-box; }
    body { -webkit-tap-highlight-color: transparent; }
    .stamp {
      display: inline-block;
      border: 2px solid currentColor;
      border-radius: 4px;
      padding: 2px 10px;
      transform: rotate(-3deg);
      font-family: 'Barlow Condensed', sans-serif;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 11px;
      opacity: 0.92;
      mix-blend-mode: multiply;
    }
    .ticket-edge {
      background-image: radial-gradient(circle at 0 50%, transparent 7px, #F6F3EC 7.5px);
      background-position: left center;
      background-size: 16px 16px;
      background-repeat: repeat-y;
    }
    .scrollbar-none::-webkit-scrollbar { display: none; }
    @keyframes toastIn { from { opacity:0; transform: translateY(8px);} to {opacity:1; transform:translateY(0);} }
    .toast-anim { animation: toastIn 0.22s ease-out; }
    input:focus, textarea:focus, select:focus, button:focus-visible {
      outline: 2px solid ${C.orange};
      outline-offset: 1px;
    }
    @media (prefers-reduced-motion: reduce) {
      .toast-anim { animation: none; }
    }
  `}</style>
);

/* ---------------------------- Service catalog --------------------------- */
/* Pulled from Honest Abes' real 2026 flat-rate price list. */
const CATALOG = [
  {
    id: "hvac_duct",
    label: "HVAC Duct Cleaning",
    tiers: [
      { id: "under2000", label: "Under 2,000 sq ft", price: 575 },
      { id: "2000to3000", label: "2,000–3,000 sq ft", price: 700 },
      { id: "3000to4000", label: "3,000–4,000 sq ft", price: 840 },
    ],
  },
  {
    id: "appliance_repair",
    label: "Appliance Repair",
    tiers: [
      { id: "l1", label: "Level 1 — small appliance", price: 189 },
      { id: "l2", label: "Level 2 — medium appliance", price: 259 },
      { id: "l3", label: "Level 3 — large appliance", price: 379 },
    ],
  },
  {
    id: "dryer_vent",
    label: "Dryer Vent Cleaning",
    tiers: [
      { id: "standalone", label: "Standalone", price: 99 },
      { id: "bundled", label: "Bundled with duct cleaning", price: 50 },
    ],
  },
  {
    id: "drywall",
    label: "Drywall Repair",
    tiers: [
      { id: "small", label: "Small hole", price: 249 },
      { id: "medium", label: "Medium hole", price: 349 },
      { id: "large", label: "Large hole", price: 499 },
    ],
  },
  {
    id: "painting",
    label: "Interior Painting",
    tiers: [
      { id: "small_room", label: "Small room, walls", price: 849 },
      { id: "medium_room", label: "Medium room, walls", price: 1099 },
      { id: "accent_wall", label: "Accent wall", price: 349 },
    ],
  },
  {
    id: "gutters",
    label: "Gutter Cleaning",
    tiers: [
      { id: "one_story", label: "One-story, up to 150 ft", price: 299 },
      { id: "two_story", label: "Two-story, up to 150 ft", price: 449 },
      { id: "reseal", label: "Minor resealing (2 joints)", price: 199 },
    ],
  },
];

const STATUS_META = {
  requested: { label: "Requested", color: C.amber },
  scheduled: { label: "Scheduled", color: C.steel },
  en_route: { label: "En Route", color: C.steel },
  in_progress: { label: "In Progress", color: C.orange },
  completed: { label: "Completed", color: C.green },
  invoiced: { label: "Invoiced", color: C.purple },
  paid: { label: "Paid", color: C.green },
  cancelled: { label: "Cancelled", color: C.red },
};

const STATUS_FLOW = ["requested", "scheduled", "en_route", "in_progress", "completed", "invoiced", "paid"];

/* ------------------------------- Helpers -------------------------------- */
function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
// Generates a short, human-friendly property code for a new customer
// (e.g. "HA-4821") and makes sure it doesn't collide with an existing one.
function generatePropertyCode(existingUsers) {
  const used = new Set(existingUsers.filter((u) => u.propertyCode).map((u) => u.propertyCode));
  let code;
  do {
    const num = Math.floor(1000 + Math.random() * 9000);
    code = `HA-${num}`;
  } while (used.has(code));
  return code;
}
function jobNumber(n) {
  return `WO-${1000 + n}`;
}
function fmtMoney(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function resizeImage(file, maxW = 480, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------------------- Demo data seed ----------------------------- */
function buildDemoUsers() {
  return [
    { id: "u_admin", role: "admin", name: "Adrian Washington", email: "adrian@honestabes.biz", phone: "(509) 370-4628", title: "Owner / Admin" },
    { id: "u_tech1", role: "technician", name: "Mike Ortiz", email: "mike@honestabes.biz", phone: "(509) 555-0132", title: "Lead Technician", skills: ["Appliance Repair", "HVAC", "Drywall"] },
    { id: "u_tech2", role: "technician", name: "Sarah Coleman", email: "sarah@honestabes.biz", phone: "(509) 555-0187", title: "Technician", skills: ["Painting", "Gutters", "Drywall"] },
    { id: "u_cust1", role: "customer", name: "Jane Doe", email: "jane.doe@example.com", phone: "(509) 555-0111", address: "412 W Riverside Ave, Spokane, WA", propertyCode: "HA-1001" },
    { id: "u_cust2", role: "customer", name: "Robert Kim", email: "robert.kim@example.com", phone: "(509) 555-0122", address: "2210 N Monroe St, Spokane, WA", propertyCode: "HA-1002" },
    { id: "u_cust3", role: "customer", name: "Lisa Nguyen", email: "lisa.nguyen@example.com", phone: "(509) 555-0144", address: "9807 E Sprague Ave, Spokane Valley, WA", propertyCode: "HA-1003" },
  ];
}

function buildDemoJobs() {
  const now = Date.now();
  const day = 86400000;
  return [
    {
      id: uid("job"), num: 1000,
      customerId: "u_cust1", technicianId: "u_tech1",
      category: "appliance_repair", tierLabel: "Level 2 — medium appliance",
      title: "Dishwasher not draining", description: "Dishwasher leaves standing water after cycle finishes. Started about a week ago.",
      address: "412 W Riverside Ave, Spokane, WA",
      status: "in_progress",
      price: 259, materialsMarkupPct: 25, materials: [{ desc: "Drain pump", cost: 64 }],
      createdAt: new Date(now - 3 * day).toISOString(),
      scheduledAt: new Date(now - 1 * day + 3600000 * 9).toISOString(),
      photos: [],
      notes: [
        { id: uid("n"), author: "Mike Ortiz", role: "technician", text: "Confirmed drain pump failure, ordering replacement part.", ts: new Date(now - 1 * day).toISOString() },
      ],
      invoice: null,
    },
    {
      id: uid("job"), num: 1001,
      customerId: "u_cust2", technicianId: "u_tech2",
      category: "painting", tierLabel: "Accent wall",
      title: "Accent wall — living room", description: "Repaint the fireplace accent wall, customer supplying color swatch on arrival.",
      address: "2210 N Monroe St, Spokane, WA",
      status: "scheduled",
      price: 349, materialsMarkupPct: 25, materials: [],
      createdAt: new Date(now - 2 * day).toISOString(),
      scheduledAt: new Date(now + 1 * day + 3600000 * 13).toISOString(),
      photos: [],
      notes: [],
      invoice: null,
    },
    {
      id: uid("job"), num: 1002,
      customerId: "u_cust3", technicianId: null,
      category: "drywall", tierLabel: "Medium hole",
      title: "Hallway drywall patch", description: "Doorknob put a hole in the hallway wall, roughly 6 inches across.",
      address: "9807 E Sprague Ave, Spokane Valley, WA",
      status: "requested",
      price: 349, materialsMarkupPct: 25, materials: [],
      createdAt: new Date(now - 0.5 * day).toISOString(),
      scheduledAt: null,
      photos: [],
      notes: [],
      invoice: null,
    },
    {
      id: uid("job"), num: 1003,
      customerId: "u_cust1", technicianId: "u_tech1",
      category: "hvac_duct", tierLabel: "Under 2,000 sq ft",
      title: "Whole-house duct cleaning", description: "Annual duct cleaning, bundling dryer vent while tech is on site.",
      address: "412 W Riverside Ave, Spokane, WA",
      status: "completed",
      price: 575, materialsMarkupPct: 25, materials: [],
      createdAt: new Date(now - 8 * day).toISOString(),
      scheduledAt: new Date(now - 6 * day).toISOString(),
      photos: [],
      notes: [
        { id: uid("n"), author: "Mike Ortiz", role: "technician", text: "Completed full duct run + bundled dryer vent cleaning. Filter was overdue for replacement, flagged for customer.", ts: new Date(now - 6 * day + 3600000 * 3).toISOString() },
      ],
      invoice: null,
    },
    {
      id: uid("job"), num: 1004,
      customerId: "u_cust2", technicianId: "u_tech2",
      category: "gutters", tierLabel: "One-story, up to 150 ft",
      title: "Fall gutter cleaning", description: "Standard seasonal gutter cleaning before winter.",
      address: "2210 N Monroe St, Spokane, WA",
      status: "paid",
      price: 299, materialsMarkupPct: 25, materials: [],
      createdAt: new Date(now - 20 * day).toISOString(),
      scheduledAt: new Date(now - 18 * day).toISOString(),
      photos: [],
      notes: [],
      invoice: { lineItems: [{ desc: "Gutter Cleaning — One-story", amount: 299 }], materialsTotal: 0, total: 299, paidMethod: "Check", paidAt: new Date(now - 15 * day).toISOString() },
    },
  ];
}

const DEFAULT_SETTINGS = {
  aiEnabled: false,
  aiKeyConfigured: false,
  emailEnabled: false,
  smsEnabled: false,
  paymentsEnabled: false,
  businessName: "Honest Abes Appliance and Property Services, LLC",
  businessPhone: "(509) 370-4628",
  businessEmail: "adrian@honestabes.biz",
};

/* ------------------------- Storage I/O -----------------------------------
   Real get/set implementations live in ./lib/storage.js (localStorage for
   this zero-cost MVP; swap that one file for a Supabase client later and
   nothing else in this file needs to change). */

/* -------------------------------------------------------------------------
   SMALL SHARED COMPONENTS
------------------------------------------------------------------------- */
function StatusStamp({ status }) {
  const meta = STATUS_META[status] || { label: status, color: C.slate };
  return (
    <span className="stamp" style={{ color: meta.color }}>
      {meta.label}
    </span>
  );
}

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 999, border: "none",
        background: checked ? C.green : C.line, position: "relative",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: "50%", background: C.white,
        transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
      }} />
    </button>
  );
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: { bg: "#EEECE4", fg: C.slate },
    green: { bg: "#E4F1EA", fg: C.green },
    amber: { bg: "#F7EED8", fg: C.amber },
    orange: { bg: "#FBE6DA", fg: C.orangeDark },
    red: { bg: "#F5E1DE", fg: C.red },
  };
  const t = tones[tone];
  return (
    <span className="fb" style={{
      background: t.bg, color: t.fg, fontSize: 11, fontWeight: 700,
      padding: "3px 8px", borderRadius: 5, letterSpacing: "0.03em", textTransform: "uppercase",
    }}>
      {children}
    </span>
  );
}

function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(27,36,48,0.55)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0,
    }} onClick={onClose}>
      <div
        className="scrollbar-none"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.paper, width: "100%", maxWidth: width, maxHeight: "92vh",
          overflowY: "auto", borderRadius: "16px 16px 0 0", boxShadow: "0 -8px 40px rgba(0,0,0,0.3)",
          animation: "toastIn 0.2s ease-out",
        }}
      >
        <div style={{
          position: "sticky", top: 0, background: C.paper, borderBottom: `1px solid ${C.line}`,
          padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2,
        }}>
          <h2 className="fd" style={{ fontSize: 22, fontWeight: 700, color: C.ink, margin: 0 }}>{title}</h2>
          <button onClick={onClose} className="fb" style={{
            border: "none", background: C.paperDim, width: 32, height: 32, borderRadius: 8,
            fontSize: 16, color: C.ink, cursor: "pointer",
          }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="toast-anim fb" style={{
      position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
      background: C.ink, color: C.white, padding: "10px 18px", borderRadius: 10,
      fontSize: 13, zIndex: 200, boxShadow: "0 6px 20px rgba(0,0,0,0.3)", maxWidth: "90vw",
    }}>
      {toast}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="fb" style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.slate, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.line}`,
  fontSize: 14, fontFamily: "Inter, sans-serif", background: C.white, color: C.ink,
};

/* -------------------------------------------------------------------------
   LOGIN
------------------------------------------------------------------------- */
function Login({ users, onLogin, onSignup }) {
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  // view: "select" (default account list) | "code" (returning customer,
  // signing in with their property code) | "signup" (new customer form)
  const [view, setView] = useState("select");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [signupForm, setSignupForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [signupError, setSignupError] = useState("");
  const [signupResult, setSignupResult] = useState(null); // the newly created customer, shown with their code

  const grouped = {
    admin: users.filter((u) => u.role === "admin"),
    technician: users.filter((u) => u.role === "technician"),
    customer: users.filter((u) => u.role === "customer"),
  };

  const needsPassword = selected && PASSWORD_PROTECTED_ROLES.includes(selected.role);

  function selectUser(u) {
    setSelected(u);
    setPassword("");
    setError("");
  }

  async function handleContinue() {
    if (!selected) return;
    if (!needsPassword) {
      onLogin(selected, null);
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setChecking(true);
    setError("");
    const result = await loginWithPassword(selected.id, password);
    setChecking(false);
    if (result.ok) {
      onLogin(selected, result.token);
    } else {
      setError(result.error || "Incorrect password.");
    }
  }

  function handleCodeSignIn() {
    const code = codeInput.trim().toUpperCase();
    if (!code) {
      setCodeError("Enter your property code.");
      return;
    }
    const match = users.find((u) => u.role === "customer" && (u.propertyCode || "").toUpperCase() === code);
    if (!match) {
      setCodeError("We couldn't find that property code. Double-check it, or sign up below if you're new.");
      return;
    }
    setCodeError("");
    onLogin(match, null);
  }

  async function handleSignupSubmit() {
    const { name, phone, email, address } = signupForm;
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setSignupError("Name, phone, and service address are required.");
      return;
    }
    setSignupError("");
    const newUser = await onSignup({ name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim() });
    setSignupResult(newUser);
  }

  // --- Confirmation screen shown right after signup, with the new property code ---
  if (signupResult) {
    return (
      <div className="fb" style={{ minHeight: "100vh", background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div style={{ background: C.paper, borderRadius: 14, padding: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.35)", textAlign: "center" }}>
            <div className="stamp" style={{ color: C.orange, fontSize: 13, marginBottom: 10 }}>Welcome to Honest Abes</div>
            <h2 className="fd" style={{ fontSize: 22, fontWeight: 800, color: C.ink, margin: "0 0 14px" }}>
              You're all set, {signupResult.name.split(" ")[0]}!
            </h2>
            <p style={{ fontSize: 13.5, color: C.slate, marginBottom: 6 }}>Your property code is</p>
            <div className="fd" style={{
              fontSize: 30, fontWeight: 800, letterSpacing: "0.06em", color: C.orange,
              background: "#FBE6DA", borderRadius: 10, padding: "12px 0", marginBottom: 14,
            }}>
              {signupResult.propertyCode}
            </div>
            <p style={{ fontSize: 12.5, color: C.slate, marginBottom: 20, lineHeight: 1.5 }}>
              Save this code — it's how you'll sign back in next time, no password needed.
              You can also always find it in your account once you're signed in.
            </p>
            <button
              onClick={() => onLogin(signupResult, null)}
              className="fd"
              style={{
                width: "100%", padding: "12px 0", borderRadius: 9, border: "none",
                background: C.orange, color: C.white, fontSize: 16, fontWeight: 700, cursor: "pointer",
              }}
            >
              Continue to my account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fb" style={{ minHeight: "100vh", background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="stamp" style={{ color: C.orange, fontSize: 13, marginBottom: 10 }}>Sign In or Sign Up</div>
          <h1 className="fd" style={{ color: C.paper, fontSize: 40, fontWeight: 800, margin: "6px 0 2px", lineHeight: 1 }}>
            Honest Abes
          </h1>
          <p className="fd" style={{ color: C.slateLight, fontSize: 18, margin: 0, letterSpacing: "0.02em" }}>
            Service Hub Pro
          </p>
        </div>

        <div style={{ background: C.paper, borderRadius: 14, padding: 18, boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}>
          {view === "code" && (
            <div style={{ marginBottom: 16 }}>
              <div className="fd" style={{ fontSize: 13, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Sign in with your property code
              </div>
              <input
                type="text"
                value={codeInput}
                onChange={(e) => { setCodeInput(e.target.value); setCodeError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleCodeSignIn(); }}
                placeholder="e.g. HA-4821"
                autoFocus
                className="fb"
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 9,
                  border: `1.5px solid ${codeError ? C.red || "#C0392B" : C.line}`,
                  fontSize: 14, color: C.ink, boxSizing: "border-box", marginBottom: 8,
                }}
              />
              {codeError && <div className="fb" style={{ color: C.red || "#C0392B", fontSize: 12, marginBottom: 8 }}>{codeError}</div>}
              <button
                onClick={handleCodeSignIn}
                className="fd"
                style={{
                  width: "100%", padding: "11px 0", borderRadius: 9, border: "none",
                  background: C.orange, color: C.white, fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8,
                }}
              >
                Sign in
              </button>
              <button
                onClick={() => { setView("select"); setCodeError(""); setCodeInput(""); }}
                className="fb"
                style={{ width: "100%", padding: "6px 0", background: "transparent", border: "none", color: C.slate, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}
              >
                Back
              </button>
            </div>
          )}

          {view === "signup" && (
            <div style={{ marginBottom: 16 }}>
              <div className="fd" style={{ fontSize: 13, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                New customer sign-up
              </div>
              {[
                ["name", "Full name"],
                ["phone", "Phone number"],
                ["email", "Email (optional)"],
                ["address", "Service address"],
              ].map(([field, label]) => (
                <input
                  key={field}
                  type="text"
                  value={signupForm[field]}
                  onChange={(e) => setSignupForm((f) => ({ ...f, [field]: e.target.value }))}
                  placeholder={label}
                  className="fb"
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 9,
                    border: `1.5px solid ${C.line}`, fontSize: 14, color: C.ink,
                    boxSizing: "border-box", marginBottom: 8,
                  }}
                />
              ))}
              {signupError && <div className="fb" style={{ color: C.red || "#C0392B", fontSize: 12, marginBottom: 8 }}>{signupError}</div>}
              <button
                onClick={handleSignupSubmit}
                className="fd"
                style={{
                  width: "100%", padding: "11px 0", borderRadius: 9, border: "none",
                  background: C.orange, color: C.white, fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8,
                }}
              >
                Create my account
              </button>
              <button
                onClick={() => { setView("select"); setSignupError(""); }}
                className="fb"
                style={{ width: "100%", padding: "6px 0", background: "transparent", border: "none", color: C.slate, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}
              >
                Back
              </button>
            </div>
          )}

          {view === "select" && ["customer", "technician", "admin"].map((role) => (
            <div key={role} style={{ marginBottom: 16 }}>
              <div className="fd" style={{ fontSize: 13, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                {role === "admin" ? "Owner / Admin" : role}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {grouped[role].map((u) => (
                  <button
                    key={u.id}
                    onClick={() => selectUser(u)}
                    className="fb"
                    style={{
                      textAlign: "left", padding: "10px 12px", borderRadius: 9,
                      border: selected?.id === u.id ? `2px solid ${C.orange}` : `1.5px solid ${C.line}`,
                      background: selected?.id === u.id ? "#FBE6DA" : C.white,
                      cursor: "pointer", fontSize: 14, color: C.ink,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{u.name}</span>
                    <span style={{ color: C.slate, fontSize: 12 }}>{u.title || u.email}</span>
                  </button>
                ))}
              </div>
              {role === "customer" && (
                <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                  <button
                    onClick={() => setView("code")}
                    className="fb"
                    style={{ background: "transparent", border: "none", color: C.orange, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
                  >
                    Have a property code? Sign in
                  </button>
                  <button
                    onClick={() => setView("signup")}
                    className="fb"
                    style={{ background: "transparent", border: "none", color: C.orange, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
                  >
                    New customer? Sign up
                  </button>
                </div>
              )}
            </div>
          ))}

          {view === "select" && needsPassword && (
            <div style={{ marginBottom: 14 }}>
              <div className="fd" style={{ fontSize: 13, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Password for {selected.name.split(" ")[0]}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleContinue(); }}
                placeholder="Enter password"
                autoFocus
                className="fb"
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 9,
                  border: `1.5px solid ${error ? C.red || "#C0392B" : C.line}`,
                  fontSize: 14, color: C.ink, boxSizing: "border-box",
                }}
              />
              {error && (
                <div className="fb" style={{ color: C.red || "#C0392B", fontSize: 12, marginTop: 6 }}>{error}</div>
              )}
            </div>
          )}

          {view === "select" && (
            <button
              disabled={!selected || checking}
              onClick={handleContinue}
              className="fd"
              style={{
                width: "100%", padding: "12px 0", marginTop: 4, borderRadius: 9, border: "none",
                background: selected && !checking ? C.orange : C.line, color: C.white, fontSize: 18, fontWeight: 700,
                cursor: selected && !checking ? "pointer" : "not-allowed", letterSpacing: "0.02em",
              }}
            >
              {checking ? "Checking…" : `Continue${selected ? ` as ${selected.name.split(" ")[0]}` : ""}`}
            </button>
          )}
        </div>

        <p className="fb" style={{ color: C.slateLight, fontSize: 11, textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
          New customers can sign up above for a property code — no password
          needed. Admin and technician accounts require the password set up
          in Vercel — see README.md.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   TOP BAR (shared)
------------------------------------------------------------------------- */
function TopBar({ user, onLogout, right }) {
  return (
    <div style={{
      background: C.ink, color: C.white, padding: "12px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      position: "sticky", top: 0, zIndex: 40,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="fd" style={{ fontWeight: 800, fontSize: 20, letterSpacing: "0.01em" }}>
          Honest Abes <span style={{ color: C.orange }}>·</span> <span style={{ fontSize: 15, color: C.slateLight, fontWeight: 600 }}>Service Hub</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {right}
        <div className="fb" style={{ fontSize: 12, color: C.slateLight, textAlign: "right" }}>
          <div style={{ color: C.white, fontWeight: 600 }}>{user.name}</div>
          <div style={{ textTransform: "capitalize" }}>{user.role}</div>
        </div>
        <button onClick={onLogout} className="fb" style={{
          background: "transparent", border: `1.5px solid ${C.slateLight}`, color: C.slateLight,
          borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer",
        }}>
          Switch user
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   JOB TICKET CARD
------------------------------------------------------------------------- */
function JobTicket({ job, users, onOpen, dense }) {
  const customer = users.find((u) => u.id === job.customerId);
  const tech = users.find((u) => u.id === job.technicianId);
  return (
    <button
      onClick={() => onOpen(job)}
      className="ticket-edge fb"
      style={{
        display: "block", width: "100%", textAlign: "left", cursor: "pointer",
        background: C.white, border: `1.5px solid ${C.line}`, borderRadius: 10,
        padding: dense ? "12px 14px 12px 20px" : "16px 18px 16px 24px",
        marginBottom: 10, position: "relative",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="fm" style={{ fontSize: 11, color: C.slate, fontWeight: 600, marginBottom: 3 }}>
            {jobNumber(job.num)}
          </div>
          <div className="fd" style={{ fontSize: 19, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>
            {job.title}
          </div>
          <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3 }}>
            {customer?.name || "Unassigned customer"} {tech ? `· ${tech.name}` : "· No tech assigned"}
          </div>
        </div>
        <StatusStamp status={job.status} />
      </div>
      {!dense && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12.5, color: C.slate }}>
          <span>{job.scheduledAt ? fmtDateTime(job.scheduledAt) : "Not scheduled"}</span>
          <span className="fm" style={{ fontWeight: 600, color: C.ink }}>{fmtMoney(job.price)}</span>
        </div>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------
   REQUEST SERVICE FORM (customer, and admin-on-behalf-of)
------------------------------------------------------------------------- */
function RequestServiceForm({ users, customerId, onSubmit, onCancel, asAdmin }) {
  const [catId, setCatId] = useState(CATALOG[0].id);
  const [tierId, setTierId] = useState(CATALOG[0].tiers[0].id);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState(users.find((u) => u.id === customerId)?.address || "");
  const [preferredDate, setPreferredDate] = useState("");
  const [selCustomer, setSelCustomer] = useState(customerId || "");

  const category = CATALOG.find((c) => c.id === catId);
  const tier = category.tiers.find((t) => t.id === tierId);

  return (
    <div>
      {asAdmin && (
        <Field label="Customer">
          <select style={inputStyle} value={selCustomer} onChange={(e) => setSelCustomer(e.target.value)}>
            <option value="">Select a customer…</option>
            {users.filter((u) => u.role === "customer").map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Service category">
        <select style={inputStyle} value={catId} onChange={(e) => { setCatId(e.target.value); setTierId(CATALOG.find(c=>c.id===e.target.value).tiers[0].id); }}>
          {CATALOG.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Scope / tier">
        <select style={inputStyle} value={tierId} onChange={(e) => setTierId(e.target.value)}>
          {category.tiers.map((t) => <option key={t.id} value={t.id}>{t.label} — {fmtMoney(t.price)}</option>)}
        </select>
      </Field>
      <Field label="Short title">
        <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dishwasher not draining" />
      </Field>
      <Field label="Describe the issue">
        <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything the tech should know before arriving" />
      </Field>
      <Field label="Service address">
        <input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <Field label="Preferred date">
        <input type="date" style={inputStyle} value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
      </Field>

      <div style={{ background: C.paperDim, borderRadius: 9, padding: 12, marginBottom: 16, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>Estimated price</span>
          <span className="fm">{fmtMoney(tier.price)}</span>
        </div>
        <div style={{ color: C.slate, marginTop: 3 }}>Materials, if any, billed separately at 25% markup over cost.</div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} className="fb" style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: `1.5px solid ${C.line}`, background: C.white, cursor: "pointer", fontWeight: 600 }}>
          Cancel
        </button>
        <button
          onClick={() => {
            if (!title.trim() || (asAdmin && !selCustomer)) return;
            onSubmit({
              customerId: asAdmin ? selCustomer : customerId,
              category: catId, tierLabel: tier.label, price: tier.price,
              title: title.trim(), description: description.trim(), address,
              preferredDate,
            });
          }}
          className="fb"
          style={{ flex: 2, padding: "11px 0", borderRadius: 9, border: "none", background: C.orange, color: C.white, fontWeight: 700, cursor: "pointer" }}
        >
          Submit request
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   AI ASSIST BUTTON — only rendered when settings.aiEnabled is true.
   Calls the server-side /api/ai-assist route (see api/ai-assist.js). The
   OpenAI key never touches this file or the browser.
------------------------------------------------------------------------- */
function AIAssistButton({ task, context, label }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setState("loading"); setError("");
    try {
      const text = await callAI(task, context);
      setResult(text);
      setState("done");
    } catch (e) {
      setError(e.message || "AI request failed.");
      setState("error");
    }
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={run} disabled={state === "loading"} className="fb" style={{
        padding: "9px 14px", borderRadius: 8, border: `1.5px solid ${C.purple}`, background: C.white,
        color: C.purple, fontWeight: 700, fontSize: 13, cursor: state === "loading" ? "wait" : "pointer",
      }}>
        {state === "loading" ? "Thinking…" : `✨ ${label}`}
      </button>
      {state === "done" && (
        <div className="fb" style={{ marginTop: 8, background: "#F1EDFA", border: `1px solid ${C.purple}`, borderRadius: 8, padding: 10, fontSize: 13, lineHeight: 1.5, color: C.ink }}>
          {result}
        </div>
      )}
      {state === "error" && (
        <div className="fb" style={{ marginTop: 8, background: "#F5E1DE", border: `1px solid ${C.red}`, borderRadius: 8, padding: 10, fontSize: 12.5, color: C.red }}>
          {error}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   JOB DETAIL — shared, behavior varies by role
------------------------------------------------------------------------- */
function JobDetail({ job, users, currentUser, settings, onUpdateJob, onNotify, onClose }) {
  const [noteText, setNoteText] = useState("");
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const customer = users.find((u) => u.id === job.customerId);
  const tech = users.find((u) => u.id === job.technicianId);
  const technicians = users.filter((u) => u.role === "technician");
  const isAdmin = currentUser.role === "admin";
  const isTech = currentUser.role === "technician";
  const isCustomer = currentUser.role === "customer";

  function patch(fields) {
    onUpdateJob({ ...job, ...fields });
  }

  function setStatus(next) {
    patch({ status: next });
    onNotify(`${settings.emailEnabled ? "Email sent" : "[Simulated] Email"} to ${customer?.name}: job ${jobNumber(job.num)} is now "${STATUS_META[next].label}".`);
  }

  function addNote() {
    if (!noteText.trim()) return;
    const note = { id: uid("n"), author: currentUser.name, role: currentUser.role, text: noteText.trim(), ts: new Date().toISOString() };
    patch({ notes: [...job.notes, note] });
    setNoteText("");
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const newPhotos = [];
      for (const f of files.slice(0, 3)) {
        const dataUrl = await resizeImage(f);
        newPhotos.push({ id: uid("p"), dataUrl, uploadedBy: currentUser.name, ts: new Date().toISOString() });
      }
      patch({ photos: [...job.photos, ...newPhotos] });
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function generateInvoice() {
    const materialsTotal = (job.materials || []).reduce((s, m) => s + m.cost * (1 + (job.materialsMarkupPct || 25) / 100), 0);
    const invoice = {
      lineItems: [{ desc: `${job.title} — ${job.tierLabel || ""}`, amount: job.price }],
      materialsTotal: Math.round(materialsTotal * 100) / 100,
      total: Math.round((job.price + materialsTotal) * 100) / 100,
      paidMethod: null, paidAt: null,
    };
    patch({ status: "invoiced", invoice });
    onNotify(`${settings.emailEnabled ? "Email sent" : "[Simulated] Email"} to ${customer?.name}: invoice ready for ${jobNumber(job.num)} — ${fmtMoney(invoice.total)}.`);
  }

  function markPaid(method) {
    patch({ status: "paid", invoice: { ...job.invoice, paidMethod: method, paidAt: new Date().toISOString() } });
    onNotify(`Job ${jobNumber(job.num)} marked paid via ${method}.`);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div className="fm" style={{ fontSize: 12, color: C.slate }}>{jobNumber(job.num)}</div>
          <div style={{ color: C.slate, fontSize: 13 }}>{customer?.name} · {job.address}</div>
        </div>
        <StatusStamp status={job.status} />
      </div>

      <p className="fb" style={{ fontSize: 14, color: C.ink, lineHeight: 1.5, marginBottom: 14 }}>{job.description}</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16, fontSize: 13 }}>
        <div style={{ background: C.paperDim, borderRadius: 9, padding: 10 }}>
          <div style={{ color: C.slate, fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Scheduled</div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>{job.scheduledAt ? fmtDateTime(job.scheduledAt) : "Not yet"}</div>
        </div>
        <div style={{ background: C.paperDim, borderRadius: 9, padding: 10 }}>
          <div style={{ color: C.slate, fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Price</div>
          <div className="fm" style={{ fontWeight: 700, marginTop: 2 }}>{fmtMoney(job.price)}</div>
        </div>
      </div>

      {/* ADMIN: assignment + scheduling */}
      {isAdmin && (
        <div style={{ border: `1.5px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div className="fd" style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Dispatch</div>
          <Field label="Assign technician">
            <select style={inputStyle} value={job.technicianId || ""} onChange={(e) => {
              patch({ technicianId: e.target.value || null, status: job.status === "requested" ? "scheduled" : job.status });
            }}>
              <option value="">Unassigned</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Scheduled date & time">
            <input type="datetime-local" style={inputStyle}
              value={job.scheduledAt ? job.scheduledAt.slice(0, 16) : ""}
              onChange={(e) => patch({ scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null, status: job.status === "requested" ? "scheduled" : job.status })}
            />
          </Field>
        </div>
      )}

      {/* Status progression — admin + technician */}
      {(isAdmin || isTech) && job.status !== "cancelled" && job.status !== "paid" && (
        <div style={{ marginBottom: 16 }}>
          <div className="fd" style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Update status</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {STATUS_FLOW.filter((s) => s !== "invoiced" && s !== "paid").map((s) => (
              <button key={s} onClick={() => setStatus(s)} className="fb" style={{
                padding: "9px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${job.status === s ? STATUS_META[s].color : C.line}`,
                background: job.status === s ? STATUS_META[s].color : C.white,
                color: job.status === s ? C.white : C.ink,
              }}>
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI diagnostic assist — only shows when enabled in Admin → Integrations */}
      {settings.aiEnabled && (isAdmin || isTech) && (
        <div style={{ marginBottom: 16 }}>
          <div className="fd" style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>AI assist</div>
          <AIAssistButton
            task="diagnostic"
            label="Suggest likely causes"
            context={`Title: ${job.title}\nCategory: ${job.tierLabel || job.category}\nDescription: ${job.description}\nTechnician notes: ${job.notes.map((n) => n.text).join(" | ") || "none yet"}`}
          />
        </div>
      )}

      {/* Photos */}
      <div style={{ marginBottom: 16 }}>
        <div className="fd" style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Photos</div>
        {job.photos.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {job.photos.map((p) => (
              <img key={p.id} src={p.dataUrl} alt="Job" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.line}` }} />
            ))}
          </div>
        )}
        {(isAdmin || isTech) && (
          <>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="fb" style={{
              padding: "9px 14px", borderRadius: 8, border: `1.5px solid ${C.line}`, background: C.white,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              {uploading ? "Uploading…" : "＋ Add photo"}
            </button>
            <div style={{ fontSize: 11, color: C.slateLight, marginTop: 4 }}>
              Stored locally for this demo · production swaps to Supabase Storage (free tier)
            </div>
          </>
        )}
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 16 }}>
        <div className="fd" style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Job notes</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {job.notes.length === 0 && <div style={{ fontSize: 13, color: C.slateLight }}>No notes yet.</div>}
          {job.notes.map((n) => (
            <div key={n.id} style={{ background: C.paperDim, borderRadius: 9, padding: 10, fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{n.author} <span style={{ fontWeight: 400, color: C.slate, textTransform: "capitalize" }}>· {n.role}</span></div>
              <div>{n.text}</div>
              <div style={{ color: C.slateLight, fontSize: 11, marginTop: 3 }}>{fmtDateTime(n.ts)}</div>
            </div>
          ))}
        </div>
        {!isCustomer && (
          <div style={{ display: "flex", gap: 8 }}>
            <input style={inputStyle} placeholder="Add a note…" value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} />
            <button onClick={addNote} className="fb" style={{ padding: "0 16px", borderRadius: 8, border: "none", background: C.steel, color: C.white, fontWeight: 700, cursor: "pointer" }}>Add</button>
          </div>
        )}
      </div>

      {/* Invoice / payment */}
      <div style={{ marginBottom: 4 }}>
        <div className="fd" style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Invoice</div>
        {!job.invoice && isAdmin && job.status === "completed" && (
          <>
            <button onClick={generateInvoice} className="fb" style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: C.purple, color: C.white, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
              Generate invoice
            </button>
            {settings.aiEnabled && (
              <AIAssistButton
                task="summary"
                label="Draft a customer-friendly summary"
                context={`Job: ${job.title}\nTechnician notes: ${job.notes.map((n) => n.text).join(" | ") || "none"}`}
              />
            )}
          </>
        )}
        {!job.invoice && job.status !== "completed" && (
          <div style={{ fontSize: 13, color: C.slateLight }}>Invoice becomes available once the job is marked Completed.</div>
        )}
        {job.invoice && (
          <div style={{ border: `1.5px solid ${C.line}`, borderRadius: 10, padding: 14 }}>
            {job.invoice.lineItems.map((li, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>{li.desc}</span><span className="fm">{fmtMoney(li.amount)}</span>
              </div>
            ))}
            {job.invoice.materialsTotal > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4, color: C.slate }}>
                <span>Materials (incl. 25% markup)</span><span className="fm">{fmtMoney(job.invoice.materialsTotal)}</span>
              </div>
            )}
            <div style={{ borderTop: `1px dashed ${C.line}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>Total due</span><span className="fm">{fmtMoney(job.invoice.total)}</span>
            </div>

            {job.invoice.paidAt ? (
              <div style={{ marginTop: 10 }}><Badge tone="green">Paid via {job.invoice.paidMethod} · {fmtDate(job.invoice.paidAt)}</Badge></div>
            ) : (
              <div style={{ marginTop: 12 }}>
                {isCustomer && (
                  <>
                    <button
                      onClick={() => onNotify(settings.paymentsEnabled
                        ? "Stripe checkout would open here."
                        : "Payments aren't connected yet. Call (509) 370-4628 or pay by check/cash — Admin can mark this invoice paid manually.")}
                      className="fb"
                      style={{ width: "100%", padding: "12px 0", borderRadius: 9, border: "none", background: C.orange, color: C.white, fontWeight: 700, cursor: "pointer" }}
                    >
                      Pay now
                    </button>
                    <div style={{ fontSize: 11, color: C.slateLight, marginTop: 6, textAlign: "center" }}>
                      {settings.paymentsEnabled ? "Stripe connected (test mode)" : "Card payments not connected — payment-ready integration point only"}
                    </div>
                  </>
                )}
                {isAdmin && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {["Cash", "Check", "Zelle"].map((m) => (
                      <button key={m} onClick={() => markPaid(m)} className="fb" style={{
                        flex: 1, padding: "9px 0", borderRadius: 8, border: `1.5px solid ${C.line}`, background: C.white, fontWeight: 600, cursor: "pointer", fontSize: 12.5,
                      }}>Mark paid — {m}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isAdmin && job.status !== "cancelled" && job.status !== "paid" && (
        <button onClick={() => { patch({ status: "cancelled" }); onClose(); }} className="fb" style={{
          marginTop: 16, background: "none", border: "none", color: C.red, fontSize: 12.5, cursor: "pointer", textDecoration: "underline",
        }}>
          Cancel this job
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   CUSTOMER VIEW
------------------------------------------------------------------------- */
function CustomerView({ user, users, jobs, settings, onUpdateJob, onCreateJob, onNotify }) {
  const [openJob, setOpenJob] = useState(null);
  const [showRequest, setShowRequest] = useState(false);
  const myJobs = jobs.filter((j) => j.customerId === user.id).sort((a, b) => b.num - a.num);
  const active = myJobs.filter((j) => !["paid", "cancelled"].includes(j.status));
  const past = myJobs.filter((j) => ["paid", "cancelled"].includes(j.status));

  return (
    <div className="fb" style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="fd" style={{ fontSize: 30, fontWeight: 800, color: C.ink, margin: 0 }}>Welcome, {user.name.split(" ")[0]}</h1>
          <p style={{ color: C.slate, fontSize: 13.5, margin: "3px 0 0" }}>{user.address}</p>
          {user.propertyCode && (
            <p style={{ color: C.slateLight, fontSize: 12, margin: "3px 0 0" }}>
              Property code: <span style={{ fontWeight: 700, color: C.slate }}>{user.propertyCode}</span>
            </p>
          )}
        </div>
        <button onClick={() => setShowRequest(true)} className="fd" style={{
          background: C.orange, color: C.white, border: "none", borderRadius: 9,
          padding: "11px 18px", fontWeight: 700, fontSize: 16, cursor: "pointer", whiteSpace: "nowrap",
        }}>
          ＋ Request service
        </button>
      </div>

      <h2 className="fd" style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Active jobs</h2>
      {active.length === 0 && <div style={{ color: C.slateLight, fontSize: 13.5, marginBottom: 20 }}>Nothing in progress right now.</div>}
      {active.map((j) => <JobTicket key={j.id} job={j} users={users} onOpen={setOpenJob} />)}

      {past.length > 0 && (
        <>
          <h2 className="fd" style={{ fontSize: 18, fontWeight: 700, color: C.ink, margin: "22px 0 8px" }}>History</h2>
          {past.map((j) => <JobTicket key={j.id} job={j} users={users} onOpen={setOpenJob} dense />)}
        </>
      )}

      {openJob && (
        <Modal title={openJob.title} onClose={() => setOpenJob(null)}>
          <JobDetail job={jobs.find((j) => j.id === openJob.id) || openJob} users={users} currentUser={user} settings={settings} onUpdateJob={onUpdateJob} onNotify={onNotify} onClose={() => setOpenJob(null)} />
        </Modal>
      )}
      {showRequest && (
        <Modal title="Request a service" onClose={() => setShowRequest(false)}>
          <RequestServiceForm users={users} customerId={user.id} onCancel={() => setShowRequest(false)} onSubmit={(payload) => { onCreateJob(payload); setShowRequest(false); }} />
        </Modal>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   TECHNICIAN VIEW — mobile-first
------------------------------------------------------------------------- */
function TechnicianView({ user, users, jobs, settings, onUpdateJob, onNotify }) {
  const [openJob, setOpenJob] = useState(null);
  const [tab, setTab] = useState("today");
  const myJobs = jobs.filter((j) => j.technicianId === user.id);
  const today = myJobs.filter((j) => !["paid", "cancelled", "invoiced"].includes(j.status)).sort((a, b) => (a.scheduledAt || "").localeCompare(b.scheduledAt || ""));
  const done = myJobs.filter((j) => ["completed", "invoiced", "paid"].includes(j.status)).sort((a, b) => b.num - a.num);

  return (
    <div className="fb" style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 84 }}>
      <div style={{ padding: "18px 16px 4px" }}>
        <h1 className="fd" style={{ fontSize: 26, fontWeight: 800, color: C.ink, margin: 0 }}>
          {tab === "today" ? "My jobs" : "Completed"}
        </h1>
        <p style={{ color: C.slate, fontSize: 13, margin: "2px 0 14px" }}>
          {tab === "today" ? `${today.length} job${today.length === 1 ? "" : "s"} on your board` : `${done.length} completed`}
        </p>
      </div>

      <div style={{ padding: "0 16px" }}>
        {(tab === "today" ? today : done).length === 0 && (
          <div style={{ color: C.slateLight, fontSize: 13.5, padding: "20px 0" }}>Nothing here yet.</div>
        )}
        {(tab === "today" ? today : done).map((j) => <JobTicket key={j.id} job={j} users={users} onOpen={setOpenJob} />)}
      </div>

      {/* Bottom nav — mobile first */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: C.white,
        borderTop: `1.5px solid ${C.line}`, display: "flex", zIndex: 30,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {[["today", "Jobs"], ["done", "Completed"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className="fb" style={{
            flex: 1, padding: "14px 0", background: "none", border: "none",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
            color: tab === key ? C.orange : C.slate,
            borderTop: tab === key ? `2.5px solid ${C.orange}` : "2.5px solid transparent",
          }}>
            {label}
          </button>
        ))}
      </div>

      {openJob && (
        <Modal title={openJob.title} onClose={() => setOpenJob(null)}>
          <JobDetail job={jobs.find((j) => j.id === openJob.id) || openJob} users={users} currentUser={user} settings={settings} onUpdateJob={onUpdateJob} onNotify={onNotify} onClose={() => setOpenJob(null)} />
        </Modal>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   ADMIN VIEW
------------------------------------------------------------------------- */
function IntegrationRow({ name, tag, tagTone, desc, status, statusTone, toggle }) {
  return (
    <div style={{ border: `1.5px solid ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 10, background: C.white }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="fd" style={{ fontWeight: 700, fontSize: 15.5 }}>{name}</span>
            <Badge tone={tagTone}>{tag}</Badge>
          </div>
          <p className="fb" style={{ fontSize: 12.5, color: C.slate, margin: "5px 0 0", lineHeight: 1.5 }}>{desc}</p>
        </div>
        {toggle}
      </div>
      <div style={{ marginTop: 8 }}><Badge tone={statusTone}>{status}</Badge></div>
    </div>
  );
}

function AdminSettings({ settings, onUpdate, onNotify }) {
  const [serverStatus, setServerStatus] = useState("checking"); // checking | configured | missing | unreachable

  useEffect(() => {
    checkAIConfigured()
      .then((configured) => setServerStatus(configured ? "configured" : "missing"))
      .catch(() => setServerStatus("unreachable"));
  }, []);

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 className="fd" style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Integrations</h2>
      <p className="fb" style={{ fontSize: 13, color: C.slate, marginBottom: 18, lineHeight: 1.5 }}>
        This app runs at $0/month by default. Everything below is clearly labeled — nothing paid turns on without you flipping it here.
      </p>

      <IntegrationRow
        name="Database"
        tag="Free · Active" tagTone="green"
        desc="Job, user, and settings data. Runs on built-in demo storage right now — swaps cleanly to Supabase's free Postgres tier (500MB, no card required) for a real multi-user deployment."
        status="Connected — local demo storage" statusTone="green"
      />
      <IntegrationRow
        name="Authentication"
        tag="Free · Active" tagTone="green"
        desc="Role-based demo login, no password. Swap-in path: Supabase Auth or Clerk, both offer free email/magic-link tiers."
        status="Connected — demo login" statusTone="green"
      />
      <IntegrationRow
        name="Photo / file storage"
        tag="Free · Active" tagTone="green"
        desc="Job photos are resized and stored with the job record. Swap-in path: Supabase Storage free tier (1GB) once you outgrow single-device demo storage."
        status="Connected — local demo storage" statusTone="green"
      />
      <IntegrationRow
        name="Email notifications"
        tag="Optional · Free tier available" tagTone="amber"
        desc="Status changes and invoices would normally email the customer. Right now these are simulated and logged to the Notifications feed instead of actually sending."
        status={settings.emailEnabled ? "Enabled (simulated — no provider connected)" : "Disabled by default"} statusTone={settings.emailEnabled ? "amber" : "slate"}
        toggle={<Toggle checked={settings.emailEnabled} onChange={(v) => { onUpdate({ emailEnabled: v }); onNotify(v ? "Email notifications enabled (simulated)." : "Email notifications disabled."); }} label="Toggle email notifications" />}
      />
      <IntegrationRow
        name="SMS notifications"
        tag="Optional · Requires paid credential" tagTone="orange"
        desc="Text alerts for arrival windows and status updates. Requires a Twilio (or similar) account with per-message cost — not needed for the app to function."
        status={settings.smsEnabled ? "Enabled (simulated — no provider connected)" : "Disabled by default"} statusTone={settings.smsEnabled ? "amber" : "slate"}
        toggle={<Toggle checked={settings.smsEnabled} onChange={(v) => { onUpdate({ smsEnabled: v }); onNotify(v ? "SMS notifications enabled (simulated)." : "SMS notifications disabled."); }} label="Toggle SMS notifications" />}
      />
      <IntegrationRow
        name="Payments (Stripe)"
        tag="Payment-ready · Requires account" tagTone="orange"
        desc="Core app works fully without this — invoices can be marked paid manually (cash/check/Zelle). Toggling this on marks the app as payment-ready; wiring a real Stripe secret key happens server-side, never in this browser."
        status={settings.paymentsEnabled ? "Marked payment-ready (no live processor connected)" : "Disabled — manual payment only"} statusTone={settings.paymentsEnabled ? "amber" : "slate"}
        toggle={<Toggle checked={settings.paymentsEnabled} onChange={(v) => { onUpdate({ paymentsEnabled: v }); onNotify(v ? "Payments marked ready (Stripe not actually connected)." : "Payments disabled — manual only."); }} label="Toggle payments" />}
      />

      <div style={{ border: `1.5px solid ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 10, background: C.white }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="fd" style={{ fontWeight: 700, fontSize: 15.5 }}>AI features (OpenAI)</span>
              <Badge tone="orange">Optional · Costs money to run</Badge>
            </div>
            <p className="fb" style={{ fontSize: 12.5, color: C.slate, margin: "5px 0 0", lineHeight: 1.5 }}>
              Off everywhere by default — nothing in this app calls OpenAI right now. When you're ready, an OpenAI API key must live in a server-side environment variable (never in this browser), behind a backend route this app calls. The field below is a placeholder for that setup, not a live connection.
            </p>
          </div>
          <Toggle checked={settings.aiEnabled} onChange={(v) => { onUpdate({ aiEnabled: v }); onNotify(v ? "AI features enabled — connect a server route + secret key to make them live." : "AI features disabled."); }} label="Toggle AI features" />
        </div>
        {settings.aiEnabled && (
          <div style={{ marginTop: 10, background: C.paperDim, borderRadius: 8, padding: 10 }}>
            <div className="fb" style={{ fontSize: 13, marginBottom: 8 }}>
              {serverStatus === "checking" && <span style={{ color: C.slate }}>Checking for a server-side key…</span>}
              {serverStatus === "configured" && <Badge tone="green">Server key detected — AI calls are live</Badge>}
              {serverStatus === "missing" && <Badge tone="orange">No OPENAI_API_KEY found on the server yet</Badge>}
              {serverStatus === "unreachable" && <Badge tone="orange">Can't reach /api/ai-assist — is this deployed?</Badge>}
            </div>
            <p className="fb" style={{ fontSize: 12, color: C.slate, lineHeight: 1.5, marginBottom: 0 }}>
              To go live: set <code>OPENAI_API_KEY</code> as an environment variable on your host
              (Vercel/Netlify/Cloudflare project settings — never in this code or in git), then redeploy.
              See <code>README.md</code> in the project for exact steps. This screen never collects or stores a real key.
            </p>
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <Badge tone={settings.aiEnabled ? "amber" : "slate"}>{settings.aiEnabled ? "Enabled in-app" : "Disabled by default"}</Badge>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3 className="fd" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Business info</h3>
        <Field label="Business name"><input style={inputStyle} value={settings.businessName} onChange={(e) => onUpdate({ businessName: e.target.value })} /></Field>
        <Field label="Phone"><input style={inputStyle} value={settings.businessPhone} onChange={(e) => onUpdate({ businessPhone: e.target.value })} /></Field>
        <Field label="Email"><input style={inputStyle} value={settings.businessEmail} onChange={(e) => onUpdate({ businessEmail: e.target.value })} /></Field>
      </div>
    </div>
  );
}

function AdminView({ user, users, jobs, settings, notifications, onUpdateJob, onCreateJob, onUpdateSettings, onNotify }) {
  const [tab, setTab] = useState("overview");
  const [openJob, setOpenJob] = useState(null);
  const [showNewJob, setShowNewJob] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  const stats = useMemo(() => {
    const activeCount = jobs.filter((j) => !["paid", "cancelled"].includes(j.status)).length;
    const unassigned = jobs.filter((j) => !j.technicianId && j.status !== "cancelled").length;
    const revenuePaid = jobs.filter((j) => j.status === "paid").reduce((s, j) => s + (j.invoice?.total || j.price), 0);
    const outstanding = jobs.filter((j) => j.status === "invoiced").reduce((s, j) => s + (j.invoice?.total || j.price), 0);
    return { activeCount, unassigned, revenuePaid, outstanding };
  }, [jobs]);

  const filteredJobs = jobs
    .filter((j) => statusFilter === "all" || j.status === statusFilter)
    .sort((a, b) => b.num - a.num);

  const techs = users.filter((u) => u.role === "technician");
  const customers = users.filter((u) => u.role === "customer");

  const NAV = [
    ["overview", "Overview"],
    ["jobs", "Jobs"],
    ["technicians", "Technicians"],
    ["customers", "Customers"],
    ["integrations", "Integrations"],
    ["notifications", "Notifications"],
  ];

  return (
    <div className="fb" style={{ display: "flex", minHeight: "calc(100vh - 57px)" }}>
      {/* Sidebar */}
      <div style={{ width: 190, borderRight: `1.5px solid ${C.line}`, background: C.paperDim, padding: "18px 10px", flexShrink: 0 }}>
        {NAV.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className="fd" style={{
            display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 3,
            borderRadius: 8, border: "none", cursor: "pointer", fontSize: 15.5, fontWeight: 600,
            background: tab === key ? C.ink : "transparent", color: tab === key ? C.white : C.ink,
          }}>
            {label}
          </button>
        ))}
        <button onClick={() => setShowNewJob(true)} className="fd" style={{
          width: "100%", marginTop: 14, padding: "10px 0", borderRadius: 8, border: "none",
          background: C.orange, color: C.white, fontWeight: 700, fontSize: 15, cursor: "pointer",
        }}>
          ＋ New job
        </button>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: "22px 26px", minWidth: 0 }}>
        {tab === "overview" && (
          <div>
            <h1 className="fd" style={{ fontSize: 26, fontWeight: 800, marginBottom: 16 }}>Overview</h1>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
              {[
                ["Active jobs", stats.activeCount, C.steel],
                ["Unassigned", stats.unassigned, stats.unassigned ? C.orange : C.green],
                ["Paid revenue", fmtMoney(stats.revenuePaid), C.green],
                ["Outstanding invoices", fmtMoney(stats.outstanding), C.amber],
              ].map(([label, val, color]) => (
                <div key={label} style={{ background: C.white, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
                  <div className="fb" style={{ fontSize: 11.5, color: C.slate, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.03em" }}>{label}</div>
                  <div className="fm" style={{ fontSize: 26, fontWeight: 700, color, marginTop: 4 }}>{val}</div>
                </div>
              ))}
            </div>
            <h2 className="fd" style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>Needs attention</h2>
            {jobs.filter((j) => j.status === "requested" || (j.status === "completed" && !j.invoice)).length === 0 && (
              <div style={{ color: C.slateLight, fontSize: 13.5 }}>Nothing waiting on you.</div>
            )}
            {jobs.filter((j) => j.status === "requested" || (j.status === "completed" && !j.invoice)).sort((a,b)=>b.num-a.num).map((j) => (
              <JobTicket key={j.id} job={j} users={users} onOpen={setOpenJob} dense />
            ))}
          </div>
        )}

        {tab === "jobs" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h1 className="fd" style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>All jobs</h1>
              <select style={{ ...inputStyle, width: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {filteredJobs.length === 0 && <div style={{ color: C.slateLight, fontSize: 13.5 }}>No jobs match this filter.</div>}
            {filteredJobs.map((j) => <JobTicket key={j.id} job={j} users={users} onOpen={setOpenJob} />)}
          </div>
        )}

        {tab === "technicians" && (
          <div>
            <h1 className="fd" style={{ fontSize: 26, fontWeight: 800, marginBottom: 16 }}>Technicians</h1>
            {techs.map((t) => {
              const load = jobs.filter((j) => j.technicianId === t.id && !["paid", "cancelled"].includes(j.status)).length;
              return (
                <div key={t.id} style={{ background: C.white, border: `1.5px solid ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div className="fd" style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</div>
                    <div style={{ fontSize: 12.5, color: C.slate }}>{t.title} · {t.phone}</div>
                    {t.skills && <div style={{ marginTop: 5, display: "flex", gap: 5, flexWrap: "wrap" }}>{t.skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>}
                  </div>
                  <Badge tone={load ? "orange" : "green"}>{load} active</Badge>
                </div>
              );
            })}
          </div>
        )}

        {tab === "customers" && (
          <div>
            <h1 className="fd" style={{ fontSize: 26, fontWeight: 800, marginBottom: 16 }}>Customers</h1>
            {customers.map((c) => {
              const count = jobs.filter((j) => j.customerId === c.id).length;
              return (
                <div key={c.id} style={{ background: C.white, border: `1.5px solid ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div className="fd" style={{ fontWeight: 700, fontSize: 16 }}>{c.name}</div>
                    <div style={{ fontSize: 12.5, color: C.slate }}>{c.address}</div>
                    <div style={{ fontSize: 12.5, color: C.slate }}>{c.phone} · {c.email}</div>
                    {c.propertyCode && (
                      <div style={{ fontSize: 12, color: C.slateLight, marginTop: 2 }}>
                        Property code: <span style={{ fontWeight: 700 }}>{c.propertyCode}</span>
                      </div>
                    )}
                  </div>
                  <Badge>{count} job{count === 1 ? "" : "s"}</Badge>
                </div>
              );
            })}
          </div>
        )}

        {tab === "integrations" && (
          <AdminSettings settings={settings} onUpdate={onUpdateSettings} onNotify={onNotify} />
        )}

        {tab === "notifications" && (
          <div>
            <h1 className="fd" style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>Notifications</h1>
            <p style={{ fontSize: 13, color: C.slate, marginBottom: 16 }}>Simulated activity feed — this is what would fire as email/SMS once a real provider is connected.</p>
            {notifications.length === 0 && <div style={{ color: C.slateLight, fontSize: 13.5 }}>Nothing yet.</div>}
            {notifications.slice().reverse().map((n) => (
              <div key={n.id} style={{ background: C.white, border: `1.5px solid ${C.line}`, borderRadius: 9, padding: "10px 12px", marginBottom: 8, fontSize: 13 }}>
                <div>{n.text}</div>
                <div style={{ color: C.slateLight, fontSize: 11, marginTop: 3 }}>{fmtDateTime(n.ts)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openJob && (
        <Modal title={openJob.title} onClose={() => setOpenJob(null)}>
          <JobDetail job={jobs.find((j) => j.id === openJob.id) || openJob} users={users} currentUser={user} settings={settings} onUpdateJob={onUpdateJob} onNotify={onNotify} onClose={() => setOpenJob(null)} />
        </Modal>
      )}
      {showNewJob && (
        <Modal title="Create job for a customer" onClose={() => setShowNewJob(false)}>
          <RequestServiceForm users={users} asAdmin onCancel={() => setShowNewJob(false)} onSubmit={(payload) => { onCreateJob(payload); setShowNewJob(false); }} />
        </Modal>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   ROOT APP
------------------------------------------------------------------------- */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    (async () => {
      let u = await storageGet("hasp_users", null);
      let j = await storageGet("hasp_jobs", null);
      let s = await storageGet("hasp_settings", null);
      let n = await storageGet("hasp_notifications", null);

      if (!u || !u.length) { u = buildDemoUsers(); await storageSet("hasp_users", u); }
      if (!j || !j.length) { j = buildDemoJobs(); await storageSet("hasp_jobs", j); }
      if (!s) { s = DEFAULT_SETTINGS; await storageSet("hasp_settings", s); }
      if (!n) { n = []; }

      setUsers(u); setJobs(j); setSettings(s); setNotifications(n);

      // Restore a signed-in admin/technician session, if one is saved and
      // still valid. Verification happens server-side in /api/auth so a
      // tampered localStorage entry can't grant access on its own.
      const session = await storageGet("hasp_session", null);
      if (session && session.userId && session.token) {
        const valid = await verifySession(session.token);
        if (valid) {
          const sessionUser = u.find((x) => x.id === session.userId);
          if (sessionUser) setCurrentUser(sessionUser);
          else await storageSet("hasp_session", null);
        } else {
          await storageSet("hasp_session", null);
        }
      }

      setLoading(false);
    })();
  }, []);

  async function handleLogin(user, token) {
    setCurrentUser(user);
    if (token) {
      await storageSet("hasp_session", { userId: user.id, token });
    }
  }

  // Creates a new customer account with an auto-generated property code.
  // No password/session token involved — the property code itself is what
  // they use to sign back in later (matched client-side against users).
  async function handleCustomerSignup({ name, phone, email, address }) {
    const newUser = {
      id: uid("u_cust"),
      role: "customer",
      name, phone, email, address,
      propertyCode: generatePropertyCode(users),
    };
    const next = [...users, newUser];
    setUsers(next);
    await storageSet("hasp_users", next);
    return newUser;
  }

  async function handleLogout() {
    setCurrentUser(null);
    await storageSet("hasp_session", null);
  }

  function notify(text) {
    const entry = { id: uid("note"), text, ts: new Date().toISOString() };
    setNotifications((prev) => {
      const next = [...prev, entry].slice(-100);
      storageSet("hasp_notifications", next);
      return next;
    });
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  function updateJob(updated) {
    setJobs((prev) => {
      const next = prev.map((j) => (j.id === updated.id ? updated : j));
      storageSet("hasp_jobs", next);
      return next;
    });
  }

  function createJob(payload) {
    setJobs((prev) => {
      const nextNum = (prev.reduce((m, j) => Math.max(m, j.num), 999)) + 1;
      const job = {
        id: uid("job"), num: nextNum,
        customerId: payload.customerId, technicianId: null,
        category: payload.category, tierLabel: payload.tierLabel, price: payload.price,
        title: payload.title, description: payload.description, address: payload.address,
        status: "requested",
        materialsMarkupPct: 25, materials: [],
        createdAt: new Date().toISOString(),
        scheduledAt: payload.preferredDate ? new Date(payload.preferredDate).toISOString() : null,
        photos: [], notes: [], invoice: null,
      };
      const next = [...prev, job];
      storageSet("hasp_jobs", next);
      return next;
    });
    notify(`New request: ${jobNumber((jobs.reduce((m, j) => Math.max(m, j.num), 999)) + 1)} — ${payload.title}`);
  }

  function updateSettings(patch) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      storageSet("hasp_settings", next);
      return next;
    });
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {FONTS}
        <div className="fd" style={{ color: C.paper, fontSize: 20 }}>Loading Service Hub…</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        {FONTS}
        <Login users={users} onLogin={handleLogin} onSignup={handleCustomerSignup} />
      </>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.paper }}>
      {FONTS}
      <TopBar
        user={currentUser}
        onLogout={handleLogout}
        right={!settings.aiEnabled ? null : <Badge tone="amber">AI on</Badge>}
      />
      {currentUser.role === "customer" && (
        <CustomerView user={currentUser} users={users} jobs={jobs} settings={settings} onUpdateJob={updateJob} onCreateJob={createJob} onNotify={notify} />
      )}
      {currentUser.role === "technician" && (
        <TechnicianView user={currentUser} users={users} jobs={jobs} settings={settings} onUpdateJob={updateJob} onNotify={notify} />
      )}
      {currentUser.role === "admin" && (
        <AdminView user={currentUser} users={users} jobs={jobs} settings={settings} notifications={notifications} onUpdateJob={updateJob} onCreateJob={createJob} onUpdateSettings={updateSettings} onNotify={notify} />
      )}
      <Toast toast={toast} />
    </div>
  );
}
