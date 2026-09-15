// FitTrackr — Free nutrition & fitness tracker
// APIs: USDA FoodData Central + Open Food Facts (both free)
// Persistence: window.storage (artifact-native cross-session storage)
// Stack: React, Recharts, Lucide-react

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Home, BookOpen, Dumbbell, TrendingUp, Settings,
  Plus, Search, X, Trash2, ChevronLeft, ChevronRight,
  Droplets, Check, Scale, Zap, Camera, Activity,
  Timer, ChefHat, Download, BarChart2, Utensils, HelpCircle,
} from "lucide-react";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const MEAL_ICONS = ["☕", "🌤️", "🌙", "🍎"];

const IF_WINDOWS = [
  { label: "12:12", hours: 12 },
  { label: "14:10", hours: 14 },
  { label: "16:8",  hours: 16 },
  { label: "18:6",  hours: 18 },
  { label: "20:4",  hours: 20 },
  { label: "OMAD",  hours: 23 },
];

const ACTIVITY = {
  sedentary: { label: "Sedentary (desk job, little/no exercise)", mult: 1.2 },
  light:     { label: "Lightly active (1–3 days/week)", mult: 1.375 },
  moderate:  { label: "Moderately active (3–5 days/week)", mult: 1.55 },
  active:    { label: "Very active (6–7 days/week)", mult: 1.725 },
  extreme:   { label: "Extremely active (physical job + daily training)", mult: 1.9 },
};

const DEFAULT_MACROS = { carbs: 50, protein: 20, fat: 30 };

const EXERCISES = [
  { name: "Walking (moderate, 3 mph)", met: 3.5 },
  { name: "Walking (brisk, 4 mph)", met: 4.3 },
  { name: "Running (5 mph)", met: 8.0 },
  { name: "Running (6 mph)", met: 9.8 },
  { name: "Running (8 mph)", met: 11.8 },
  { name: "Cycling (moderate)", met: 6.8 },
  { name: "Cycling (vigorous)", met: 10.0 },
  { name: "Swimming (moderate)", met: 5.8 },
  { name: "Elliptical trainer", met: 5.0 },
  { name: "Jump rope", met: 11.0 },
  { name: "HIIT / Circuit training", met: 8.0 },
  { name: "Yoga", met: 2.5 },
  { name: "Pilates", met: 3.0 },
  { name: "Weight training", met: 3.5 },
  { name: "Basketball", met: 6.5 },
  { name: "Tennis", met: 7.3 },
  { name: "Soccer", met: 7.0 },
  { name: "Dancing", met: 5.0 },
  { name: "Hiking", met: 5.3 },
  { name: "Rowing machine", met: 7.0 },
  { name: "Stair climbing", met: 8.8 },
  { name: "Stretching / flexibility", met: 2.3 },
  { name: "Martial arts", met: 9.8 },
  { name: "Rock climbing", met: 7.5 },
  { name: "Kayaking / canoeing", met: 5.0 },
];

// ─────────────────────────────────────────────
// CALORIE MATH  (Mifflin-St Jeor)
// ─────────────────────────────────────────────

const toKg = (w, unit) => unit === "lb" ? w * 0.453592 : w;
const toCm = (h, unit) => unit === "in" ? h * 2.54 : h;

const calcBMR = ({ sex, age, weight, weightUnit, height, heightUnit }) => {
  const wKg = toKg(weight, weightUnit);
  const hCm = toCm(height, heightUnit);
  const base = 10 * wKg + 6.25 * hCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
};

const calcGoalCals = (profile) => {
  const tdee = calcBMR(profile) * (ACTIVITY[profile.activityLevel]?.mult || 1.375);
  const delta = (profile.weeklyPace || 1) * 500;
  const raw = profile.goal === "lose" ? tdee - delta : profile.goal === "gain" ? tdee + delta : tdee;
  return Math.round(Math.max(raw, profile.sex === "male" ? 1500 : 1200));
};

const calcMacroGrams = (cals, pct = DEFAULT_MACROS) => ({
  carbs:   Math.round((cals * pct.carbs   / 100) / 4),
  protein: Math.round((cals * pct.protein / 100) / 4),
  fat:     Math.round((cals * pct.fat     / 100) / 9),
});

// Correct formula per Compendium of Physical Activities (Ainsworth et al.)
// 1 MET = 3.5 mL O2/kg/min; 1 L O2 ≈ 5 kcal → cal/min = MET × 3.5 × kg / 200
const calcExerciseCals = (met, weightKg, minutes) =>
  Math.round((met * 3.5 * weightKg * minutes) / 200);

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// MICRONUTRIENT CONSTANTS
// ─────────────────────────────────────────────

const MICRO_IDS = {
  vitaminD:   1110,
  calcium:    1087,
  iron:       1089,
  magnesium:  1090,
  potassium:  1092,
  zinc:       1095,
  vitaminB12: 1178,
  vitaminC:   1162,
};

const MICRO_INFO = [
  { key:'vitaminD',   label:'Vitamin D',   unit:'mcg', drv:20,    color:'#F59E0B' },
  { key:'calcium',    label:'Calcium',     unit:'mg',  drv:1300,  color:'#6366F1' },
  { key:'iron',       label:'Iron',        unit:'mg',  drv:18,    color:'#EF4444' },
  { key:'magnesium',  label:'Magnesium',   unit:'mg',  drv:420,   color:'#10B981' },
  { key:'potassium',  label:'Potassium',   unit:'mg',  drv:4700,  color:'#8B5CF6' },
  { key:'zinc',       label:'Zinc',        unit:'mg',  drv:11,    color:'#3B82F6' },
  { key:'vitaminB12', label:'Vitamin B12', unit:'mcg', drv:2.4,   color:'#EC4899' },
  { key:'vitaminC',   label:'Vitamin C',   unit:'mg',  drv:90,    color:'#F97316' },
];
// ─────────────────────────────────────────────

const haptic = {
  light:     () => navigator.vibrate?.(50),
  double:    () => navigator.vibrate?.([50, 60, 50]),
  milestone: () => navigator.vibrate?.(200),
};

// ─────────────────────────────────────────────
// GREETING HELPERS
// ─────────────────────────────────────────────

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const getDayMessage = (diary, goalCals, consumed) => {
  const entries = Object.values(diary || {}).flat();
  const logged  = Object.entries(diary || {}).filter(([,v])=>v?.length>0).map(([k])=>k);
  const h       = new Date().getHours();
  if (consumed >= goalCals && goalCals > 0) return "Daily goal reached! 🎉";
  if (entries.length === 0) return "Nothing logged yet — tap a meal to start";
  if (h < 11 && !logged.includes("Breakfast")) return "Don't forget breakfast!";
  if (h >= 12 && h < 15 && !logged.includes("Lunch")) return "Time for lunch?";
  if (h >= 17 && !logged.includes("Dinner")) return "Dinner still to log";
  const rem = goalCals - consumed;
  return rem > 0 ? `${rem} kcal left for today` : "You're right on track";
};

// ─────────────────────────────────────────────
// COMPONENT: Sparkline — 7-day calorie trend strip
// ─────────────────────────────────────────────

const Sparkline = ({ data = [], goal = 0, color = "#10B981", height = 48, compact = false }) => {
  const w   = compact ? 120 : 220;
  const h   = height;
  const max = Math.max(...data, goal, 100);
  const pts = data.map((v, i) => ({
    x: data.length < 2 ? w/2 : (i / (data.length - 1)) * w,
    y: h - (v / max) * (h - 6) - 3,
    v,
  }));
  const path = pts.map((p,i) => `${i===0?'M':'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const goalY = h - (goal / max) * (h - 6) - 3;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{overflow:'visible'}}>
      {/* Goal line */}
      {goal > 0 && (
        <line x1={0} y1={goalY} x2={w} y2={goalY}
          stroke="rgba(0,0,0,0.12)" strokeWidth={1} strokeDasharray="4 3"/>
      )}
      {/* Trend line */}
      {pts.length > 1 && (
        <path d={path} fill="none" stroke={color} strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" opacity={0.9}/>
      )}
      {/* Dots */}
      {pts.map((p,i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.v>0?3:2}
          fill={p.v>0?color:'rgba(0,0,0,0.12)'}/>
      ))}
    </svg>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: MilestoneModal — streak milestone celebration
// ─────────────────────────────────────────────

const MILESTONE_DATA = {
  7:   { emoji:"🔥", title:"7-Day Streak!",   msg:"You've logged every day for a week. Consistency is everything." },
  14:  { emoji:"💪", title:"14-Day Streak!",  msg:"Two weeks of daily logging. You're building a real habit." },
  30:  { emoji:"🏆", title:"30-Day Streak!",  msg:"A full month of consistency. That's genuinely impressive." },
  60:  { emoji:"⚡", title:"60-Day Streak!",  msg:"Two months in. You're not just tracking — you're transforming." },
  100: { emoji:"👑", title:"100-Day Streak!", msg:"100 consecutive days. Elite level commitment." },
};

const MilestoneModal = ({ streak, onClose }) => {
  const m = MILESTONE_DATA[streak] || MILESTONE_DATA[7];
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-3xl p-8 text-center max-w-xs w-full shadow-2xl"
        style={{animation:'sheet-up .4s cubic-bezier(.22,1,.36,1) forwards'}}>
        <div className="text-7xl mb-4 block"
          style={{animation:'flame-dance 1.5s ease-in-out infinite',display:'inline-block'}}>
          {m.emoji}
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">{m.title}</h2>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">{m.msg}</p>
        <button onClick={onClose}
          className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-emerald-200">
          Keep it up! 🚀
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────

// Local date helpers — deliberately avoid toISOString() which returns UTC,
// causing entries logged in the evening to appear on the wrong date for
// users in US timezones (UTC-4 to UTC-8).
const localDateStr = (d = new Date()) => {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const todayStr = () => localDateStr();

const shiftDate = (dateStr, n) => {
  // Parse as local date components to avoid any UTC shift
  const [y, m, day] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, day);  // local midnight
  dt.setDate(dt.getDate() + n);
  return localDateStr(dt);
};

const fmtDate = (dateStr) => {
  if (dateStr === todayStr()) return "Today";
  if (dateStr === shiftDate(todayStr(), -1)) return "Yesterday";
  const [y, m, day] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

const fmtShort = (dateStr) => {
  const [y, m, day] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// ─────────────────────────────────────────────
// STORAGE  (dual-write: localStorage → window.storage fallback)
//
// When deployed as a standalone PWA, localStorage persists data on the
// device even when the browser is closed. Inside the Claude artifact
// sandbox, localStorage is blocked, so window.storage catches everything.
// Both are written on every save so there are always two copies.
// ─────────────────────────────────────────────

const store = {
  get: async (key) => {
    // 1. Try localStorage (works in deployed app, blocked in Claude artifact)
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return JSON.parse(v);
    } catch {}

    // 2. Fall back to window.storage (Claude artifact cache)
    try {
      const r = await window.storage.get(key);
      return r ? JSON.parse(r.value) : null;
    } catch { return null; }
  },

  set: async (key, value) => {
    const s = JSON.stringify(value);

    // Write to localStorage (device-persistent when deployed)
    try { localStorage.setItem(key, s); } catch {}

    // Also write to window.storage (artifact cache, always available here)
    try { await window.storage.set(key, s); } catch {}
  },
};

// ─────────────────────────────────────────────
// FOOD API  (USDA + Open Food Facts)
// ─────────────────────────────────────────────

const parseUSDA = (item) => {
  const n = item.foodNutrients || [];
  const g = (kw) => { const f = n.find(x => x.nutrientName?.toLowerCase().includes(kw)); return f ? f.value || 0 : 0; };
  const gId = (id) => { const f = n.find(x => x.nutrientId === id); return f ? (f.value || 0) : 0; };
  // Extract micros — only include keys with non-zero values
  const micros = {};
  Object.entries(MICRO_IDS).forEach(([key, id]) => {
    const v = gId(id);
    if (v > 0) micros[key] = Math.round(v * 100) / 100;
  });
  return {
    id: `usda-${item.fdcId}`,
    name: item.description || "",
    brand: item.brandName || item.brandOwner || "",
    calories: Math.round(g("energy")),
    protein: Math.round(g("protein") * 10) / 10,
    carbs: Math.round(g("carbohydrate") * 10) / 10,
    fat: Math.round(g("total lipid") * 10) / 10,
    fiber: Math.round(g("fiber") * 10) / 10,
    sodium: Math.round(g("sodium")),
    servingSize: item.servingSize || 100,
    servingUnit: item.servingSizeUnit || "g",
    source: "USDA",
    ...(Object.keys(micros).length > 0 && { micros }),
  };
};

const parseOFF = (item) => {
  const nm = item.nutriments || {};
  const kcal = nm["energy-kcal_100g"] || (nm.energy_100g ? nm.energy_100g / 4.184 : 0);
  // OFF uses lowercase_100g naming for micros
  const OFF_MICRO_KEYS = {
    vitaminD:   ['vitamin-d_100g','vitamin_d_100g'],
    calcium:    ['calcium_100g'],
    iron:       ['iron_100g'],
    magnesium:  ['magnesium_100g'],
    potassium:  ['potassium_100g'],
    zinc:       ['zinc_100g'],
    vitaminB12: ['vitamin-b12_100g','vitamin_b12_100g'],
    vitaminC:   ['vitamin-c_100g','vitamin_c_100g'],
  };
  const micros = {};
  Object.entries(OFF_MICRO_KEYS).forEach(([key, keys]) => {
    for (const k of keys) {
      const v = nm[k];
      if (v != null && v > 0) { micros[key] = Math.round(v * 100) / 100; break; }
    }
  });
  return {
    id: `off-${item.code || Date.now()}`,
    name: item.product_name || item.product_name_en || "",
    brand: item.brands || "",
    calories: Math.round(kcal),
    protein: Math.round((nm.proteins_100g || 0) * 10) / 10,
    carbs: Math.round((nm.carbohydrates_100g || 0) * 10) / 10,
    fat: Math.round((nm.fat_100g || 0) * 10) / 10,
    fiber: Math.round((nm.fiber_100g || 0) * 10) / 10,
    sodium: Math.round((nm.sodium_100g || 0) * 1000),
    servingSize: 100,
    servingUnit: "g",
    source: "Open Food Facts",
    ...(Object.keys(micros).length > 0 && { micros }),
  };
};

const searchFoods = async (query) => {
  const results = [];
  await Promise.allSettled([
    // USDA FoodData Central (rate-limited at 50/day on DEMO_KEY)
    fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&api_key=${import.meta.env.VITE_USDA_KEY || "DEMO_KEY"}&pageSize=10`)
      .then(r => r.ok ? r.json() : Promise.reject("usda-err"))
      .then(d => { if (d.foods?.length) results.push(...d.foods.slice(0, 6).map(parseUSDA)); })
      .catch(() => {}),

    // Open Food Facts — relaxed filter, just needs a product name
    fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=10&fields=code,product_name,brands,nutriments`)
      .then(r => r.ok ? r.json() : Promise.reject("off-err"))
      .then(d => {
        if (d.products?.length) {
          results.push(...d.products
            .filter(p => p.product_name?.trim())   // just need a name — no calorie gate
            .slice(0, 6).map(parseOFF));
        }
      })
      .catch(() => {}),
  ]);

  const direct = results.filter(r => r.name?.trim() && r.calories >= 0);
  if (direct.length > 0) return direct;

  // ── Claude API fallback ───────────────────────────────────────────
  // Kicks in when USDA is rate-limited or OFF returns nothing.
  // Handles branded products, restaurant items, generic foods.
  return searchFoodsAI(query);
};

// Claude-powered nutrition lookup — no rate limits, no CORS issues,
// excellent coverage of branded / restaurant / generic foods.
const searchFoodsAI = async (query) => {
  try {
    const res = await fetch("/.netlify/functions/anthropic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are a nutrition database assistant. The user searched for: "${query}"

Return ONLY a valid JSON array (no markdown fences, no explanation) with up to 6 matching food items.
Each item must use this exact shape:
{"name":"full product name","brand":"brand or empty string","calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sodium":0,"servingSize":100,"servingUnit":"g","micros":{"vitaminD":0,"calcium":0,"iron":0,"magnesium":0,"potassium":0,"zinc":0,"vitaminB12":0,"vitaminC":0}}

Rules:
- calories / protein / carbs / fat / fiber are per 100g values (numbers, not strings)
- sodium is in milligrams per 100g
- micros are per 100g: vitaminD (mcg), calcium (mg), iron (mg), magnesium (mg), potassium (mg), zinc (mg), vitaminB12 (mcg), vitaminC (mg)
- Only include a micro key if the value is genuinely non-zero — omit keys with zero values
- servingSize is the typical serving weight in grams (e.g. 55, 85, 100, 28)
- Include specific product variants when relevant
- Be accurate — use real USDA / label data for well-known brands
- If the query is generic (e.g. "chicken"), include a few preparations
- If nothing matches at all, return []`
        }]
      })
    });

    const data = await res.json();
    const raw  = data.content?.[0]?.text?.trim() || "[]";
    // Strip any accidental markdown fences
    const clean = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/,"").trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(f => f.name?.trim())
      .map((f, i) => {
        const micros = {};
        if (f.micros && typeof f.micros === 'object') {
          Object.entries(f.micros).forEach(([k, v]) => {
            if (MICRO_IDS[k] !== undefined && v > 0) micros[k] = Math.round(v * 100) / 100;
          });
        }
        return {
          id:          `ai-${Date.now()}-${i}`,
          name:        f.name        || "",
          brand:       f.brand       || "",
          calories:    Math.round(f.calories    || 0),
          protein:     Math.round((f.protein    || 0) * 10) / 10,
          carbs:       Math.round((f.carbs      || 0) * 10) / 10,
          fat:         Math.round((f.fat        || 0) * 10) / 10,
          fiber:       Math.round((f.fiber      || 0) * 10) / 10,
          sodium:      Math.round(f.sodium      || 0),
          servingSize: f.servingSize || 100,
          servingUnit: f.servingUnit || "g",
          source:      "AI Lookup",
          ...(Object.keys(micros).length > 0 && { micros }),
        };
      });
  } catch { return []; }
};

const lookupBarcode = async (barcode) => {
  try {
    const res  = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      return parseOFF({ ...data.product, code: barcode });
    }
    return null;
  } catch { return null; }
};

// ─────────────────────────────────────────────
// COMPONENT: Barcode Scanner
// Uses native BarcodeDetector (Chrome/Android).
// Falls back to manual numeric entry on unsupported browsers.
// ─────────────────────────────────────────────

const BarcodeScanner = ({ onFound, onClose }) => {
  const INPUT_ID = "nt-barcode-capture";
  const fileRef  = useRef(null);
  const [status,  setStatus]  = useState("idle");
  const [manual,  setManual]  = useState("");
  const [looking, setLooking] = useState(false);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be picked again later
    if (fileRef.current) fileRef.current.value = "";

    if (!supported) { setStatus("unsupported"); return; }

    setStatus("scanning");
    try {
      const bitmap   = await createImageBitmap(file);
      const detector = new BarcodeDetector({ formats: ["ean_13","ean_8","upc_a","upc_e"] });
      const hits     = await detector.detect(bitmap);
      bitmap.close();
      if (hits.length > 0) { await handleCode(hits[0].rawValue); return; }
      setStatus("notfound");
    } catch { setStatus("notfound"); }
  };

  const handleCode = async (code) => {
    setLooking(true);
    setStatus("looking");
    const food = await lookupBarcode(code);
    if (food) { onFound(food); return; }
    setManual(code);
    setStatus("notfound");
    setLooking(false);
  };

  const submitManual = () => { if (manual.trim() && !looking) handleCode(manual.trim()); };

  // Camera trigger label — using <label htmlFor> instead of button+JS click()
  // Labels trigger file inputs natively; works in sandboxed iframes where
  // programmatic fileInput.click() is blocked.
  const CameraLabel = ({ children, className, resetStatus }) => (
    <label
      htmlFor={INPUT_ID}
      onClick={() => { if (resetStatus) setStatus("idle"); }}
      className={`cursor-pointer select-none ${className}`}>
      {children}
    </label>
  );

  return (
    <div className="fixed inset-0 bg-gray-950 z-[60] flex flex-col">

      {/* The real file input — hidden, triggered by labels below */}
      <input
        id={INPUT_ID}
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="sr-only"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 text-white">
        <button onClick={onClose} className="p-1.5"><X size={22} /></button>
        <span className="font-bold text-base">Scan Barcode</span>
        <div className="w-9" />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">

        {status === "idle" && (
          <>
            {/* Tapping the icon itself also opens camera */}
            <CameraLabel className="w-28 h-28 bg-emerald-500/15 rounded-3xl flex items-center justify-center active:bg-emerald-500/25 transition-colors">
              <Camera size={52} className="text-emerald-400" />
            </CameraLabel>
            <div className="text-center">
              <h2 className="text-xl font-extrabold text-white mb-2">Take a Photo</h2>
              <p className="text-white/50 text-sm leading-relaxed">
                Point your camera at the barcode on the package.
                Works best in good lighting with the barcode flat.
              </p>
            </div>
            <CameraLabel className="bg-emerald-500 active:bg-emerald-600 text-white font-bold px-10 py-4 rounded-2xl text-base shadow-lg shadow-emerald-900/40 transition-colors">
              Open Camera
            </CameraLabel>
          </>
        )}

        {(status === "scanning" || status === "looking") && (
          <>
            <div className="w-14 h-14 border-[3px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white/70 text-sm">
              {status === "scanning" ? "Reading barcode from photo…" : "Looking up product…"}
            </p>
          </>
        )}

        {status === "notfound" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search size={30} className="text-yellow-400" />
            </div>
            <p className="text-yellow-400 font-bold mb-1">
              {manual ? "Product not in database" : "No barcode detected"}
            </p>
            <p className="text-white/50 text-sm mb-5 leading-relaxed">
              {manual
                ? "Try searching by product name in the search box."
                : "Make sure the full barcode is in frame and well-lit, then try again."}
            </p>
            <CameraLabel resetStatus className="inline-block bg-white/10 active:bg-white/25 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
              Try Again
            </CameraLabel>
          </div>
        )}

        {status === "unsupported" && (
          <div className="text-center">
            <p className="text-yellow-400 font-bold mb-2">Barcode detection needs Chrome on Android</p>
            <p className="text-white/50 text-sm">Enter the barcode number manually below.</p>
          </div>
        )}
      </div>

      {/* Manual entry — always visible */}
      <div className="bg-gray-900 px-4 pt-4 pb-8">
        <p className="text-xs text-gray-500 mb-2.5">
          {manual && status === "notfound"
            ? `Barcode ${manual} not found — try searching by name.`
            : "Or type the barcode number directly:"}
        </p>
        <div className="flex gap-3">
          <input value={manual} onChange={e => setManual(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitManual()}
            placeholder="e.g. 012345678901"
            type="tel" inputMode="numeric"
            className="flex-1 px-4 py-3 bg-gray-800 text-white rounded-xl text-sm outline-none placeholder-gray-600 focus:ring-2 focus:ring-emerald-500" />
          <button onClick={submitManual} disabled={!manual.trim() || looking}
            className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 text-white rounded-xl font-bold transition-colors min-w-[56px]">
            {looking ? "…" : "Go"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// HOOK: useFade — fade out → swap content → fade in
// Used for date navigation and tab switches within screens
// ─────────────────────────────────────────────

const useFade = (delay = 120) => {
  const [opacity, setOpacity] = useState(1);
  const timer = useRef(null);
  const fade = useCallback((callback) => {
    setOpacity(0);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      callback();
      setOpacity(1);
    }, delay);
  }, [delay]);
  return [opacity, fade];
};
// ─────────────────────────────────────────────

const useAnimatedNumber = (target, duration = 450) => {
  const [display, setDisplay] = useState(target);
  const prev    = useRef(target);
  const frame   = useRef(null);
  useEffect(() => {
    const from = prev.current;
    if (from === target) return;
    const start = performance.now();
    const tick  = (now) => {
      const p     = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else prev.current = target;
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);
  return display;
};

// ─────────────────────────────────────────────
// COMPONENT: Goal confetti burst
// ─────────────────────────────────────────────

const Confetti = () => {
  const COLORS = ['#10B981','#F97316','#3B82F6','#EAB308','#A855F7','#EF4444','#EC4899'];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl" aria-hidden="true">
      {Array.from({length:20}).map((_,i) => {
        const color = COLORS[i % COLORS.length];
        const left  = `${4 + (i * 4.8) % 92}%`;
        const delay = `${(i * 0.06).toFixed(2)}s`;
        const size  = 5 + (i % 4) * 2;
        const shape = i % 3 === 0 ? '50%' : i % 3 === 1 ? '2px' : '0';
        return (
          <div key={i} style={{
            position:'absolute', top:'35%', left,
            width:size, height:size,
            backgroundColor:color,
            borderRadius:shape,
            animation:`confetti-burst .9s ease-out ${delay} forwards`,
            transform:`rotate(${i*18}deg)`,
          }}/>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Calorie Ring — meal segments + animated counter
// ─────────────────────────────────────────────

const CalorieRing = ({ consumed, goal, burned = 0, meals = {} }) => {
  const net       = Math.max(consumed - burned, 0);
  const remaining = Math.max(goal - net, 0);
  const over      = net > goal;
  const goalReached = remaining === 0 && consumed > 0;
  useEffect(() => { if (goalReached) haptic.double(); }, [goalReached]);
  const r = 68, cx = 85, cy = 85, circ = 2 * Math.PI * r;

  const displayNum = useAnimatedNumber(over ? net - goal : remaining);

  // Meal arc segments — graduated emerald shades
  const MEAL_COLORS = ['#059669','#10B981','#34D399','#6EE7B7'];
  const MEAL_KEYS   = ['Breakfast','Lunch','Dinner','Snacks'];
  let cumOffset = 0;
  const segments = MEAL_KEYS.map((m, i) => {
    const cals = (meals[m] || []).reduce((s,e)=>s+e.calories,0);
    const pct  = Math.min(cals / Math.max(goal, 1), 1 - cumOffset);
    const arc  = pct * circ;
    const off  = circ - cumOffset * circ;
    cumOffset += pct;
    return { arc, off, color: over ? '#EF4444' : MEAL_COLORS[i] };
  }).filter(s => s.arc > 0.5);

  return (
    <div className="flex flex-col items-center relative">
      {goalReached && <Confetti/>}
      <svg width="170" height="170" viewBox="0 0 170 170">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="14"/>
        {segments.map((s,i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth="14" strokeLinecap="butt"
            strokeDasharray={`${s.arc} ${circ - s.arc}`}
            strokeDashoffset={s.off}
            transform="rotate(-90 85 85)"
            style={{transition:'stroke-dasharray .55s ease, stroke-dashoffset .55s ease'}}/>
        ))}
        {goalReached && (
          <circle cx={cx} cy={cy} r={r+8} fill="none" stroke="#10B981" strokeWidth="3" opacity=".4"
            style={{animation:'goal-ring-pulse 1.2s ease-out 3'}}/>
        )}
        <text x={cx} y={cy-8} textAnchor="middle"
          fill={over?'#EF4444':goalReached?'#10B981':'#111827'}
          fontSize="30" fontWeight="900" fontFamily="system-ui"
          style={displayNum !== (over?net-goal:remaining) ? {animation:'number-bump .3s ease'} : {}}>
          {over ? `+${displayNum}` : displayNum}
        </text>
        <text x={cx} y={cy+10} textAnchor="middle" fill="#9CA3AF" fontSize="11" fontFamily="system-ui">
          {over ? 'over goal' : goalReached ? '🎉 goal hit!' : 'cal remaining'}
        </text>
      </svg>
      <div className="flex gap-5 text-sm text-gray-400 -mt-1">
        <div className="text-center"><div className="font-black text-gray-800 text-base">{goal}</div><div className="text-xs">goal</div></div>
        <div className="w-px bg-gray-200"/>
        <div className="text-center"><div className="font-black text-gray-800 text-base">{consumed}</div><div className="text-xs">food</div></div>
        {burned>0&&<><div className="w-px bg-gray-200"/><div className="text-center"><div className="font-black text-emerald-500 text-base">{burned}</div><div className="text-xs">exercise</div></div></>}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Macro Doughnut — replaces plain bars
// ─────────────────────────────────────────────

const MacroDoughnut = ({ macros, goals, netCarbs, fiberGoal, sodiumGoal }) => {
  const r = 52, cx = 64, cy = 64, circ = 2 * Math.PI * r;

  const carbCals  = macros.carbs   * 4;
  const protCals  = macros.protein * 4;
  const fatCals   = macros.fat     * 9;
  const totalCals = carbCals + protCals + fatCals;
  const goalCals  = goals.carbs * 4 + goals.protein * 4 + goals.fat * 9;

  let offset = 0;
  const segs = [
    { key:'carbs',   cals:carbCals,  color:'#3B82F6', val:macros.carbs,   goal:goals.carbs,   label:'Carbs'   },
    { key:'protein', cals:protCals,  color:'#F97316', val:macros.protein, goal:goals.protein, label:'Protein' },
    { key:'fat',     cals:fatCals,   color:'#EAB308', val:macros.fat,     goal:goals.fat,     label:'Fat'     },
  ].map(s => {
    const pct = Math.min(s.cals / Math.max(goalCals, 1), 1 - offset);
    const arc = pct * circ;
    const off = circ - offset * circ;
    offset += pct;
    return { ...s, arc, off };
  });

  const animC = useAnimatedNumber(Math.round(macros.carbs));
  const animP = useAnimatedNumber(Math.round(macros.protein));
  const animF = useAnimatedNumber(Math.round(macros.fat));
  const animV = [animC, animP, animF];

  return (
    <div>
      <div className="flex items-center gap-4">
        {/* Donut */}
        <div className="shrink-0 relative">
          <svg width="128" height="128" viewBox="0 0 128 128">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="13"/>
            {segs.map((s,i)=>s.arc>0.5&&(
              <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                stroke={s.val>s.goal?'#EF4444':s.color} strokeWidth="13" strokeLinecap="butt"
                strokeDasharray={`${s.arc} ${circ-s.arc}`}
                strokeDashoffset={s.off}
                transform="rotate(-90 64 64)"
                style={{transition:'stroke-dasharray .5s ease'}}/>
            ))}
            <text x={cx} y={cy-4} textAnchor="middle" fill="#111827" fontSize="16" fontWeight="900" fontFamily="system-ui">
              {Math.round(totalCals)}
            </text>
            <text x={cx} y={cy+11} textAnchor="middle" fill="#9CA3AF" fontSize="8.5" fontFamily="system-ui">
              kcal eaten
            </text>
          </svg>
        </div>

        {/* Bars + numbers */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {segs.map((s,i)=>{
            const pct = Math.min((s.val/Math.max(s.goal,1))*100,100);
            const over = s.val > s.goal;
            return (
              <div key={s.key}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-bold" style={{color:s.color}}>{s.label}</span>
                  <span className="text-xs text-gray-400">
                    <span className="font-bold text-gray-700">{animV[i]}</span>/{s.goal}g
                  </span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{width:`${pct}%`,backgroundColor:over?'#EF4444':s.color,transition:'width .5s ease'}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Micronutrients */}
      <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-sm font-bold text-blue-600">{netCarbs}g</div>
          <div className="text-xs text-gray-400 mt-0.5">Net carbs</div>
        </div>
        <div>
          <div className={`text-sm font-bold ${macros.fiber>=fiberGoal?'text-emerald-600':'text-gray-700'}`}>
            {Math.round(macros.fiber * 10)/10}<span className="text-gray-400 font-normal text-xs">/{fiberGoal}g</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">Fiber</div>
        </div>
        <div>
          <div className={`text-sm font-bold ${macros.sodium>sodiumGoal?'text-red-500':'text-gray-700'}`}>
            {macros.sodium>999?`${(macros.sodium/1000).toFixed(1)}k`:macros.sodium}
            <span className="text-gray-400 font-normal text-xs">mg</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">Sodium</div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: BottomSheet — slide-up modal wrapper
// Uses React state + CSS transition (reliable in all envs)
// ─────────────────────────────────────────────

const BottomSheet = ({ onClose, children, maxHeight = "92dvh", noBackdropClose = false }) => {
  const [visible, setVisible] = useState(false);

  // Trigger slide-up after first paint so transition plays
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="fixed inset-0 z-50">
      {/* Dimmed backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity .25s ease' }}
        onClick={noBackdropClose ? undefined : onClose}
      />
      {/* Sheet — slides up from bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          maxHeight,
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .32s cubic-bezier(.22,1,.36,1)',
        }}
      >
        {/* Drag handle pill */}
        <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-1 shrink-0"/>
        {children}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: FoodRow — swipe-left to reveal Delete
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// COMPONENT: SwipeDeleteRow — generic reusable swipe-to-delete wrapper
// Used for food entries, exercise entries, weight history, recipes
// ─────────────────────────────────────────────

const SwipeDeleteRow = ({ onDelete, onLongPress, label = "Delete", noBorder = false, className = "", children }) => {
  const [dx,       setDx]       = useState(0);
  const [open,     setOpen]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const startX    = useRef(0);
  const pressTimer = useRef(null);
  const THRESHOLD = 65;
  const OPEN_POS  = -112;

  const tStart = (e) => {
    startX.current = e.touches[0].clientX;
    if (!open && onLongPress) {
      pressTimer.current = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(50);
        onLongPress();
      }, 500);
    }
  };
  const tMove = (e) => {
    clearTimeout(pressTimer.current);
    const d = e.touches[0].clientX - startX.current;
    if (open) { if (d > 10) setDx(Math.min(0, OPEN_POS + d)); }
    else       { if (d < 0)  setDx(Math.max(d, OPEN_POS)); }
  };
  const tEnd = () => {
    clearTimeout(pressTimer.current);
    if (open) {
      dx > OPEN_POS / 2 ? (setOpen(false), setDx(0)) : setDx(OPEN_POS);
    } else {
      dx <= -THRESHOLD ? (setOpen(true), setDx(OPEN_POS)) : setDx(0);
    }
  };

  const handleDelete = () => { setDeleting(true); setTimeout(onDelete, 280); };
  const handleClose  = () => { setOpen(false); setDx(0); };

  return (
    <div className={`relative overflow-hidden${noBorder ? '' : ' border-b border-gray-50 last:border-0'}${className ? ' ' + className : ''}`}>
      {/* Red delete zone — user must tap to confirm */}
      <button onClick={handleDelete}
        className="absolute right-0 top-0 bottom-0 w-28 bg-red-500 active:bg-red-700 flex items-center justify-center gap-1.5 transition-colors">
        <Trash2 size={16} className="text-white"/>
        <span className="text-white text-xs font-bold">{label}</span>
      </button>
      {/* Sliding row — bg-white ensures red zone is always hidden at rest */}
      <div
        className="bg-white"
        style={{
          transform:`translateX(${deleting?-300:dx}px)`,
          transition:(dx===0||dx===OPEN_POS||deleting)?'transform .28s ease':'none',
          opacity: deleting ? 0 : 1,
        }}
        onTouchStart={tStart}
        onTouchMove={tMove}
        onTouchEnd={tEnd}
        onTouchCancel={()=>{clearTimeout(pressTimer.current);setDx(open?OPEN_POS:0);}}
        onClick={open ? handleClose : undefined}>
        {/* Pass open state to children via render-prop or just render */}
        {typeof children === 'function' ? children(open) : children}
      </div>
    </div>
  );
};

// FoodRow — uses SwipeDeleteRow
const FoodRow = ({ entry, onRemove, onLongPress }) => (
  <SwipeDeleteRow onDelete={onRemove} onLongPress={onLongPress}>
    {(open) => (
      <div className="flex items-center px-4 py-3 bg-white">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{entry.name}</p>
          <p className="text-xs text-gray-400">
            {entry.logTime && <span className="text-gray-300 mr-1">{entry.logTime} ·</span>}
            {entry.servings}× {entry.servingSize}{entry.servingUnit} · C:{Math.round(entry.carbs)}g P:{Math.round(entry.protein)}g F:{Math.round(entry.fat)}g
          </p>
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          <span className="font-black text-sm text-gray-800">{entry.calories}</span>
          {open ? <X size={13} className="text-gray-300"/> : <ChevronRight size={13} className="text-gray-200"/>}
        </div>
      </div>
    )}
  </SwipeDeleteRow>
);

// ─────────────────────────────────────────────
// COMPONENT: Skeleton loading row
// Uses Tailwind animate-pulse (reliable cross-env)
// ─────────────────────────────────────────────

const SkeletonRow = () => (
  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 animate-pulse">
    <div className="flex-1 flex flex-col gap-2">
      <div className="h-4 bg-gray-200 rounded-lg w-3/4"/>
      <div className="h-3 bg-gray-200 rounded-lg w-1/2"/>
    </div>
    <div className="h-5 bg-gray-200 rounded-lg w-12 shrink-0"/>
  </div>
);

// Keep MacroBar for Progress / Goals screens
const MacroBar = ({ label, consumed, goal, color }) => {
  const pct = Math.min((consumed / Math.max(goal, 1)) * 100, 100);
  const over = consumed > goal;
  return (
    <div className="flex-1">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        <span className="text-xs text-gray-400">{consumed}g<span className="text-gray-300">/{goal}g</span></span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: over ? "#EF4444" : color, transition: "width .5s ease" }} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// AI MEAL SCAN — photo → Claude vision → foods
// ─────────────────────────────────────────────

const fileToBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload  = () => res(r.result.split(",")[1]);
  r.onerror = rej;
  r.readAsDataURL(file);
});

const scanMealPhoto = async (file) => {
  try {
    const b64 = await fileToBase64(file);
    const res = await fetch("/.netlify/functions/anthropic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
            { type: "text", text: `Identify every distinct food item visible in this image and estimate its nutritional content per typical serving.\n\nReturn ONLY a valid JSON array (no markdown, no explanation):\n[{"name":"food name","calories":0,"protein":0,"carbs":0,"fat":0,"servingSize":100,"servingUnit":"g"}]\n\nRules: calories/protein/carbs/fat are per 100g. Be specific (e.g. "Grilled Chicken Breast" not just "Chicken"). If nothing identifiable, return [].` }
          ]
        }]
      })
    });
    const data  = await res.json();
    const raw   = data.content?.[0]?.text?.trim() || "[]";
    const clean = raw.replace(/^```[a-z]*\n?/i,"").replace(/\n?```$/,"").trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(f => f.name).map((f, i) => ({
      id: `scan-${Date.now()}-${i}`,
      name: f.name || "", brand: "",
      calories: Math.round(f.calories || 0),
      protein:  Math.round((f.protein  || 0) * 10) / 10,
      carbs:    Math.round((f.carbs    || 0) * 10) / 10,
      fat:      Math.round((f.fat      || 0) * 10) / 10,
      fiber: 0, sodium: 0,
      servingSize: f.servingSize || 100,
      servingUnit: f.servingUnit || "g",
      source: "Meal Scan",
    }));
  } catch { return []; }
};

// ─────────────────────────────────────────────
// MODAL: AI Meal Scan Screen
// Purple-themed, mirrors the barcode scanner UX
// ─────────────────────────────────────────────

const MealScanModal = ({ onFound, onClose }) => {
  const INPUT_ID = "nt-meal-scan-capture";
  const fileRef  = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | scanning | notfound

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    setStatus("scanning");
    const foods = await scanMealPhoto(file);
    if (foods.length > 0) {
      onFound(foods);
    } else {
      setStatus("notfound");
    }
  };

  const MealCameraLabel = ({ children, className, resetStatus }) => (
    <label
      htmlFor={INPUT_ID}
      onClick={() => { if (resetStatus) setStatus("idle"); }}
      className={`cursor-pointer select-none ${className}`}>
      {children}
    </label>
  );

  return (
    <div className="fixed inset-0 bg-gray-950 z-[60] flex flex-col">
      {/* Hidden file input */}
      <input
        id={INPUT_ID}
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 text-white">
        <button onClick={onClose} className="p-1.5"><X size={22} /></button>
        <span className="font-bold text-base">Scan Your Plate</span>
        <div className="w-9" />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">

        {status === "idle" && (
          <>
            <MealCameraLabel className="w-28 h-28 bg-purple-500/15 rounded-3xl flex items-center justify-center active:bg-purple-500/25 transition-colors">
              <Utensils size={52} className="text-purple-400" />
            </MealCameraLabel>
            <div className="text-center">
              <h2 className="text-xl font-extrabold text-white mb-2">Scan Your Plate</h2>
              <p className="text-white/50 text-sm leading-relaxed">
                Take a photo of your plate. AI will identify each food item and estimate the calories.
              </p>
            </div>
            <MealCameraLabel className="bg-purple-500 active:bg-purple-600 text-white font-bold px-10 py-4 rounded-2xl text-base shadow-lg shadow-purple-900/40 transition-colors">
              Open Camera
            </MealCameraLabel>
          </>
        )}

        {status === "scanning" && (
          <>
            <div className="w-14 h-14 border-[3px] border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white/70 text-sm">AI is analyzing your plate…</p>
          </>
        )}

        {status === "notfound" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search size={30} className="text-yellow-400" />
            </div>
            <p className="text-yellow-400 font-bold mb-1">No food detected</p>
            <p className="text-white/50 text-sm mb-5 leading-relaxed">
              Try a clearer photo with better lighting and distinct food items visible.
            </p>
            <MealCameraLabel resetStatus className="inline-block bg-white/10 active:bg-white/25 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
              Try Again
            </MealCameraLabel>
          </div>
        )}
      </div>
    </div>
  );
};

const FoodSearchModal = ({ meal, onAdd, onClose, recents = [] }) => {
  const [query,         setQuery]         = useState("");
  const [apiResults,    setApiResults]    = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [selected,      setSelected]      = useState(null);
  const [servings,      setServings]      = useState(1);
  const [showScanner,   setShowScanner]   = useState(false);
  const [showMealScan,  setShowMealScan]  = useState(false);
  const [scanStatus,    setScanStatus]    = useState("");
  const [scanning,      setScanning]      = useState(false);
  const [source,        setSource]        = useState("usda"); // usda | off | ai
  const timer = useRef(null);

  const SOURCES = [
    { id: "usda", label: "USDA",             color: "#10B981" },
    { id: "off",  label: "Open Food Facts",  color: "#3B82F6" },
    { id: "ai",   label: "AI Lookup",        color: "#A855F7" },
  ];

  const handleMealScanFound = (foods) => {
    setShowMealScan(false);
    setApiResults(prev => [...foods, ...prev]);
    setQuery("");
  };

  // Re-run search when source changes (if there's an active query)
  useEffect(() => {
    if (query.trim()) {
      setLoading(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => search(query, source), 150);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // ── Instant local matches from recently used foods ────────────
  const localMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recents.slice(0, 10);               // all recents when box is empty
    return recents
      .filter(f =>
        f.name.toLowerCase().includes(q) ||
        (f.brand || "").toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [query, recents]);

  // Merged display: local on top, API below (deduped by id)
  const displayResults = useMemo(() => {
    const seen = new Set(localMatches.map(f => f.id));
    return [...localMatches, ...apiResults.filter(f => !seen.has(f.id))];
  }, [localMatches, apiResults]);

  const search = useCallback(async (q, src = "usda") => {
    if (!q.trim()) { setApiResults([]); setLoading(false); return; }
    let results = [];
    try {
      if (src === "usda") {
        const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&api_key=${import.meta.env.VITE_USDA_KEY || "DEMO_KEY"}&pageSize=10`);
        const d = res.ok ? await res.json() : {};
        if (d.foods?.length) results = d.foods.slice(0, 8).map(parseUSDA);
      } else if (src === "off") {
        const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1&page_size=10&fields=code,product_name,brands,nutriments`);
        const d = res.ok ? await res.json() : {};
        if (d.products?.length) results = d.products.filter(p => p.product_name?.trim()).slice(0, 8).map(parseOFF);
      } else {
        results = await searchFoodsAI(q);
      }
    } catch {}
    setApiResults(results.filter(r => r.name?.trim() && r.calories >= 0));
    setLoading(false);
  }, []);

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    if (q.trim()) setLoading(true);
    else          { setLoading(false); setApiResults([]); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(q, source), 350);
  };

  const handleBarcodeFound = (food) => {
    setShowScanner(false);
    setSelected(food);
    setServings(1);
    setScanStatus("");
  };

  const confirm = () => {
    const f = servings * (selected.servingSize / 100);
    // Scale micros by serving factor — only include keys with non-zero results
    const micros = {};
    if (selected.micros) {
      Object.entries(selected.micros).forEach(([k, v]) => {
        const scaled = Math.round(v * f * 100) / 100;
        if (scaled > 0) micros[k] = scaled;
      });
    }
    onAdd({
      ...selected,
      servings,
      logId: Date.now(),
      logTime: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
      calories: Math.round(selected.calories * f),
      protein:  Math.round(selected.protein  * f * 10) / 10,
      carbs:    Math.round(selected.carbs    * f * 10) / 10,
      fat:      Math.round(selected.fat      * f * 10) / 10,
      fiber:    Math.round(selected.fiber    * f * 10) / 10,
      sodium:   Math.round(selected.sodium   * f),
      ...(Object.keys(micros).length > 0 && { micros }),
      _base: { ...selected },
    });
    onClose();
  };

  const factor   = selected ? servings * (selected.servingSize / 100) : 1;
  const isEmpty  = !query.trim();
  const hasLocal = localMatches.length > 0;
  const noHits   = !loading && !isEmpty && displayResults.length === 0;

  return (
    <BottomSheet onClose={onClose} noBackdropClose maxHeight="98dvh">
      <div className="flex flex-col" style={{ height: "92dvh" }}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 shrink-0">
            <X size={20} className="text-gray-500" />
          </button>
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={query} onChange={handleInput}
              placeholder={`Add food to ${meal}…`}
              className="w-full pl-9 pr-10 py-2.5 bg-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400" />
            {(loading || scanning) && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <button onClick={() => setShowMealScan(true)}
            className="shrink-0 w-10 h-10 flex items-center justify-center bg-purple-500 hover:bg-purple-600 active:bg-purple-700 rounded-xl shadow-sm transition-colors">
            <Utensils size={17} className="text-white"/>
          </button>
          <button onClick={() => setShowScanner(true)}
            className="shrink-0 w-10 h-10 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 rounded-xl shadow-md transition-colors">
            <Camera size={18} className="text-white" />
          </button>
        </div>

        {/* Source selector */}
        <div className="flex items-center gap-5 px-4 py-2.5 border-b border-gray-100 bg-gray-50/50 shrink-0">
          {SOURCES.map(opt => (
            <button key={opt.id} onClick={() => { setSource(opt.id); setApiResults([]); }}
              className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                style={{ borderColor: source === opt.id ? opt.color : "#D1D5DB" }}>
                {source === opt.id && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.color }}/>}
              </div>
              <span className="text-xs font-semibold" style={{ color: source === opt.id ? opt.color : "#9CA3AF" }}>{opt.label}</span>
            </button>
          ))}
        </div>

        {scanStatus === "notfound" && (
          <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100 text-xs text-yellow-700 shrink-0">
            Barcode not in database — search by name or try another product.
          </div>
        )}

        {/* Selected detail */}
        {selected && (
          <div className="border-b border-gray-100 p-4 bg-emerald-50 shrink-0">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{selected.name}</p>
                {selected.brand && <p className="text-xs text-gray-400">{selected.brand}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{selected.servingSize}{selected.servingUnit} / serving · {selected.source}</p>
              </div>
              <button onClick={() => setSelected(null)}><X size={16} className="text-gray-400 mt-0.5" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[["kcal",Math.round(selected.calories*factor),"#111827"],["carbs",`${Math.round(selected.carbs*factor*10)/10}g`,"#3B82F6"],["protein",`${Math.round(selected.protein*factor*10)/10}g`,"#F97316"],["fat",`${Math.round(selected.fat*factor*10)/10}g`,"#EAB308"]].map(([lbl,val,clr])=>(
                <div key={lbl} className="bg-white rounded-xl p-2.5 text-center shadow-sm">
                  <div className="font-bold text-sm" style={{color:clr}}>{val}</div>
                  <div className="text-xs text-gray-400">{lbl}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm text-gray-600">Servings:</span>
              <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden">
                <button onClick={()=>setServings(s=>Math.max(0.25,+(s-0.25).toFixed(2)))} className="px-3 py-2 font-bold text-gray-600 hover:bg-gray-100">−</button>
                <span className="px-4 text-sm font-bold border-x border-gray-300 min-w-[52px] text-center py-2">{servings}</span>
                <button onClick={()=>setServings(s=>+(s+0.25).toFixed(2))} className="px-3 py-2 font-bold text-gray-600 hover:bg-gray-100">+</button>
              </div>
            </div>
            <button onClick={confirm} className="w-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors">Add to {meal}</button>
            {/* Micronutrient preview — only when data available */}
            {selected.micros && Object.keys(selected.micros).length > 0 && (
              <div className="mt-3 pt-3 border-t border-emerald-100">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-2">Micronutrients per serving</p>
                <div className="flex flex-wrap gap-1.5">
                  {MICRO_INFO.filter(m=>(selected.micros?.[m.key]||0)>0).map(m=>{
                    const base = selected.micros[m.key];
                    const f    = servings * (selected.servingSize / 100);
                    const val  = Math.round(base * f * 100) / 100;
                    const display = val < 1 ? val.toFixed(1) : Math.round(val);
                    return (
                      <span key={m.key} className="text-[10px] font-semibold px-2 py-1 rounded-full"
                        style={{background:`${m.color}18`,color:m.color}}>
                        {m.label} {display}{m.unit}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty && !hasLocal && (
            <div className="text-center py-16 text-gray-400">
              <Search size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">{source==="usda"?"Search USDA FoodData Central":source==="off"?"Search Open Food Facts (3M+ products)":"Search with AI — any food or restaurant"}</p>
              <p className="text-xs mt-1 opacity-70">Tap camera icon to scan a barcode</p>
            </div>
          )}
          {hasLocal && (
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{isEmpty?"Recent Foods":"Matches"}</p>
              {!isEmpty&&loading&&<p className="text-xs text-gray-400">Searching more…</p>}
            </div>
          )}
          {displayResults.map((food,idx)=>{
            const isRecent=idx<localMatches.length;
            return (
              <button key={`${food.id}-${idx}`} onClick={()=>{setSelected(food);setServings(1);}}
                className="w-full text-left px-4 py-3.5 border-b border-gray-50 hover:bg-emerald-50 active:bg-emerald-100 transition-colors">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isRecent&&isEmpty&&<span className="shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full leading-none">Recent</span>}
                      <p className="font-medium text-gray-900 text-sm truncate">{food.name}</p>
                    </div>
                    {food.brand&&<p className="text-xs text-gray-400 truncate">{food.brand}</p>}
                    <p className="text-xs text-gray-400">{food.servingSize}{food.servingUnit} · {food.source==="AI Lookup"?<span className="text-purple-500 font-medium">✦ AI estimate</span>:food.source}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-gray-800">{food.calories}</span>
                    <span className="text-xs text-gray-400 ml-0.5">kcal</span>
                    <div className="text-xs text-gray-400">C:{food.carbs}g P:{food.protein}g F:{food.fat}g</div>
                  </div>
                </div>
              </button>
            );
          })}
          {!isEmpty&&loading&&localMatches.length===0&&<>{Array.from({length:5}).map((_,i)=><SkeletonRow key={i}/>)}</>}
          {!isEmpty&&loading&&localMatches.length>0&&(
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 h-px bg-gray-100"/>
              <span className="text-xs text-gray-400 whitespace-nowrap">{source==="usda"?"Searching USDA…":source==="off"?"Searching Open Food Facts…":"Asking AI…"}</span>
              <div className="flex-1 h-px bg-gray-100"/>
            </div>
          )}
          {noHits&&(
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm font-medium">No results for "{query}"</p>
              <p className="text-xs mt-1">Try different terms or switch source above</p>
            </div>
          )}
        </div>
      </div>
      {showScanner&&<BarcodeScanner onFound={handleBarcodeFound} onClose={()=>setShowScanner(false)}/>}
      {showMealScan&&<MealScanModal onFound={handleMealScanFound} onClose={()=>setShowMealScan(false)}/>}
    </BottomSheet>
  );
};

// ─────────────────────────────────────────────
// MODAL: Add Exercise
// ─────────────────────────────────────────────

// Steps-per-minute lookup for common step-based activities
// Steps per minute for each step-based activity.
// Used to AUTO-CALCULATE steps from duration when the user doesn't enter them manually.
// Source: Ainsworth Compendium cadence estimates.
const STEPS_PER_MIN = {
  "Walking (moderate, 3 mph)": 100,
  "Walking (brisk, 4 mph)":    128,
  "Running (5 mph)":           160,
  "Running (6 mph)":           175,
  "Running (8 mph)":           200,
  "Hiking":                     90,
  "Stair climbing":            100,
  "Jump rope":                 130,
  "Dancing":                    90,
  "Martial arts":              100,
  "Basketball":                 95,
  "Soccer":                    110,
  "Tennis":                     80,
};

const ExerciseModal = ({ weightKg, onAdd, onClose }) => {
  const [query,    setQuery]    = useState("");
  const [selected, setSelected] = useState(null);
  const [duration, setDuration] = useState(30);
  const [steps,    setSteps]    = useState("");   // optional steps count

  const filtered = useMemo(() =>
    EXERCISES.filter(e => e.name.toLowerCase().includes(query.toLowerCase())), [query]);

  const isStepBased = useMemo(() =>
    selected && /walking|running|jogging/i.test(selected.name), [selected]);

  const cals = selected ? calcExerciseCals(selected.met, weightKg, duration) : 0;

  const handleStepsChange = (val) => {
    setSteps(val);
    const n = parseInt(val, 10);
    if (!n || !isStepBased) return;
    const spm = STEPS_PER_MIN[selected.name] || 100;
    setDuration(Math.max(5, Math.round(n / spm)));
  };

  const handleSelect = (ex) => {
    setSelected(ex);
    setSteps("");
    setDuration(30);
  };

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={20} className="text-gray-500" /></button>
          <h2 className="font-bold text-gray-900">Log Exercise</h2>
        </div>

        {selected ? (
          <div className="p-4 border-b border-gray-100 bg-orange-50">
            <div className="flex justify-between items-start mb-4">
              <p className="font-bold text-gray-900">{selected.name}</p>
              <button onClick={() => setSelected(null)}><X size={16} className="text-gray-400" /></button>
            </div>

            {/* Steps input — only for walking/running */}
            {isStepBased && (
              <div className="mb-4 bg-white rounded-xl p-3 border border-orange-200">
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  Steps <span className="text-gray-400 font-normal">(optional — auto-sets duration)</span>
                </label>
                <input
                  type="number" inputMode="numeric"
                  value={steps}
                  onChange={e => handleStepsChange(e.target.value)}
                  placeholder="e.g. 4500"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-lg font-bold outline-none focus:border-orange-400 bg-gray-50"
                />
                {steps > 0 && (
                  <p className="text-xs text-orange-600 mt-1.5 font-medium">
                    ≈ {(parseInt(steps)/2000).toFixed(2)} miles · duration set to {duration} min
                  </p>
                )}
              </div>
            )}

            {/* Duration stepper */}
            <div className="flex items-center gap-4 mb-4">
              <span className="text-sm text-gray-600 whitespace-nowrap">Duration (min):</span>
              <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden">
                <button onClick={() => setDuration(d => Math.max(5, d - 5))} className="px-3 py-2 font-bold text-gray-600 hover:bg-gray-100">−</button>
                <span className="px-4 py-2 text-sm font-bold border-x border-gray-300 w-14 text-center">{duration}</span>
                <button onClick={() => setDuration(d => d + 5)} className="px-3 py-2 font-bold text-gray-600 hover:bg-gray-100">+</button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-600">Estimated burn</span>
              <span className="text-3xl font-extrabold text-orange-500">{cals} <span className="text-base font-medium text-orange-400">kcal</span></span>
            </div>
            <p className="text-xs text-gray-400 mb-4">MET × weight × time. Actual burn varies by fitness level.</p>
            <button onClick={() => onAdd({
                ...selected, duration, calories: cals, logId: Date.now(),
                steps: steps ? parseInt(steps, 10) : 0,
              })}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors">
              Log Exercise
            </button>
          </div>
        ) : (
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search exercises…"
                className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
          </div>
        )}

        {!selected && (
          <div className="flex-1 overflow-y-auto">
            {filtered.map(ex => (
              <button key={ex.name} onClick={() => handleSelect(ex)}
                className="w-full text-left px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors flex justify-between items-center">
                <span className="font-medium text-sm text-gray-900">{ex.name}</span>
                <span className="text-xs text-gray-400 shrink-0 ml-2">MET {ex.met}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
};

// ─────────────────────────────────────────────
// SCREEN: Onboarding
// ─────────────────────────────────────────────

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [p, setP] = useState({
    sex: "male", age: 30, height: 70, heightUnit: "in",
    weight: 180, weightUnit: "lb", goalWeight: 165,
    goal: "lose", activityLevel: "light", weeklyPace: 1,
    macroPct: { ...DEFAULT_MACROS }, waterGoal: 64,
  });
  const set = (k, v) => setP(prev => ({ ...prev, [k]: v }));

  const preview = calcGoalCals(p);
  const macros  = calcMacroGrams(preview, p.macroPct);
  const STEPS = 5;

  const steps = [
    /* 0 — Goal */
    <div key="goal" className="flex flex-col gap-3">
      <h2 className="text-2xl font-extrabold text-gray-900 mb-1">What's your goal?</h2>
      {[["lose","🔥","Lose Weight","Calorie deficit to burn fat"],
        ["maintain","⚖️","Maintain Weight","Stay at your current weight"],
        ["gain","💪","Gain Weight / Muscle","Calorie surplus to build mass"]].map(([val,icon,lbl,desc])=>(
        <button key={val} onClick={() => set("goal",val)}
          className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${p.goal===val?"border-emerald-500 bg-emerald-50":"border-gray-200 hover:border-gray-300 bg-white"}`}>
          <span className="text-3xl">{icon}</span>
          <div className="flex-1"><div className="font-bold text-gray-900">{lbl}</div><div className="text-sm text-gray-500">{desc}</div></div>
          {p.goal===val&&<Check size={18} className="text-emerald-500 shrink-0"/>}
        </button>
      ))}
    </div>,

    /* 1 — Activity */
    <div key="activity" className="flex flex-col gap-3">
      <h2 className="text-2xl font-extrabold text-gray-900 mb-1">Activity level</h2>
      <p className="text-gray-500 text-sm">Doesn't include planned exercise — just your baseline daily movement.</p>
      {Object.entries(ACTIVITY).map(([key,{label}])=>(
        <button key={key} onClick={() => set("activityLevel",key)}
          className={`flex justify-between items-center p-4 rounded-2xl border-2 text-left transition-all ${p.activityLevel===key?"border-emerald-500 bg-emerald-50":"border-gray-200 hover:border-gray-300 bg-white"}`}>
          <span className="text-sm font-medium text-gray-800">{label}</span>
          {p.activityLevel===key&&<Check size={16} className="text-emerald-500 shrink-0 ml-3"/>}
        </button>
      ))}
    </div>,

    /* 2 — Personal */
    <div key="personal" className="flex flex-col gap-5">
      <h2 className="text-2xl font-extrabold text-gray-900 mb-1">About you</h2>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Biological sex</label>
        <div className="flex gap-3">
          {["male","female"].map(s=>(
            <button key={s} onClick={() => set("sex",s)}
              className={`flex-1 py-3 rounded-xl border-2 font-semibold transition-all ${p.sex===s?"border-emerald-500 bg-emerald-50 text-emerald-700":"border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              {s==="male"?"♂ Male":"♀ Female"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Age</label>
        <input type="number" min="16" max="99" value={p.age || ""} onChange={e=>set("age",+e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold outline-none focus:border-emerald-500" />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Height</label>
        <div className="flex gap-3">
          <input type="number" step="0.5" value={p.height || ""} onChange={e=>set("height",+e.target.value)}
            className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold outline-none focus:border-emerald-500" />
          <select value={p.heightUnit} onChange={e=>set("heightUnit",e.target.value)}
            className="px-4 py-3 border-2 border-gray-200 rounded-xl font-semibold bg-white outline-none focus:border-emerald-500">
            <option value="in">in</option><option value="cm">cm</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Current weight</label>
        <div className="flex gap-3">
          <input type="number" step="0.5" value={p.weight || ""} onChange={e=>set("weight",+e.target.value)}
            className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold outline-none focus:border-emerald-500" />
          <select value={p.weightUnit} onChange={e=>set("weightUnit",e.target.value)}
            className="px-4 py-3 border-2 border-gray-200 rounded-xl font-semibold bg-white outline-none focus:border-emerald-500">
            <option value="lb">lb</option><option value="kg">kg</option>
          </select>
        </div>
      </div>
    </div>,

    /* 3 — Pace & targets */
    <div key="pace" className="flex flex-col gap-5">
      <h2 className="text-2xl font-extrabold text-gray-900 mb-1">Your targets</h2>
      {p.goal!=="maintain"&&(
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
            Weekly {p.goal==="lose"?"loss":"gain"} pace ({p.weightUnit}/week)
          </label>
          <div className="flex flex-col gap-2">
            {[0.5,1,1.5,2].map(pace=>(
              <button key={pace} onClick={()=>set("weeklyPace",pace)}
                className={`flex items-center justify-between px-4 py-3.5 rounded-xl border-2 transition-all ${p.weeklyPace===pace?"border-emerald-500 bg-emerald-50":"border-gray-200 hover:border-gray-300"}`}>
                <span className="font-semibold text-sm text-gray-800">{pace} {p.weightUnit}/wk</span>
                <span className="text-xs text-gray-400">{pace*500} cal/day {p.goal==="lose"?"deficit":"surplus"}</span>
                {p.weeklyPace===pace&&<Check size={16} className="text-emerald-500"/>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Goal weight ({p.weightUnit})</label>
        <input type="number" step="0.5" value={p.goalWeight || ""} onChange={e=>set("goalWeight",+e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold outline-none focus:border-emerald-500" />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Daily water goal (oz)</label>
        <input type="number" value={p.waterGoal || ""} onChange={e=>set("waterGoal",+e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold outline-none focus:border-emerald-500" />
      </div>
    </div>,

    /* 4 — Summary */
    <div key="summary" className="flex flex-col gap-4">
      <h2 className="text-2xl font-extrabold text-gray-900 mb-1">Your daily plan</h2>
      <div className="bg-emerald-500 rounded-3xl p-6 text-white text-center shadow-lg shadow-emerald-200">
        <div className="text-6xl font-extrabold tracking-tight">{preview}</div>
        <div className="text-emerald-100 mt-1 font-medium">calories per day</div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[["Carbs",`${macros.carbs}g`,"#3B82F6"],["Protein",`${macros.protein}g`,"#F97316"],["Fat",`${macros.fat}g`,"#EAB308"]].map(([name,val,clr])=>(
          <div key={name} className="bg-gray-50 rounded-2xl p-3 text-center">
            <div className="text-xl font-extrabold" style={{color:clr}}>{val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{name}</div>
          </div>
        ))}
      </div>
      <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-600 space-y-2">
        <div className="flex justify-between"><span>Goal</span><span className="font-semibold text-gray-900 capitalize">{p.goal} weight</span></div>
        <div className="flex justify-between"><span>Activity</span><span className="font-semibold text-gray-900">{ACTIVITY[p.activityLevel]?.label}</span></div>
        {p.goal!=="maintain"&&<div className="flex justify-between"><span>Pace</span><span className="font-semibold text-gray-900">{p.weeklyPace} {p.weightUnit}/wk</span></div>}
      </div>
      <p className="text-xs text-center text-gray-400">Based on Mifflin-St Jeor. Adjust any time in Goals.</p>
    </div>,
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-32">
        <div className="flex items-center gap-2.5 mb-7">
          <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
            <Zap size={20} className="text-white" strokeWidth={2.5}/>
          </div>
          <div>
            <span className="font-black text-gray-900 text-xl tracking-tight leading-none block">FitTrackr</span>
            <span className="text-[10px] text-emerald-500 font-bold tracking-widest uppercase leading-none">Free</span>
          </div>
        </div>
        <div className="flex gap-1.5 mb-8">
          {Array.from({length:STEPS}).map((_,i)=>(
            <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i<=step?"bg-emerald-500":"bg-gray-200"}`} />
          ))}
        </div>
        {steps[step]}
      </div>
      <div className="fixed bottom-0 inset-x-0 px-5 py-5 bg-white border-t border-gray-100 flex gap-3">
        {step>0&&(
          <button onClick={()=>setStep(s=>s-1)}
            className="flex-1 py-4 border-2 border-gray-200 rounded-2xl font-bold text-gray-600 hover:bg-gray-50">
            Back
          </button>
        )}
        <button onClick={()=>step<STEPS-1?setStep(s=>s+1):onComplete(p)}
          className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg rounded-2xl shadow-lg shadow-emerald-200 transition-colors">
          {step<STEPS-1?"Continue":"Get Started →"}
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Intermittent Fasting Card
// ─────────────────────────────────────────────

const IFCard = ({ fasting, onUpdate }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const { start, windowHours = 16 } = fasting;
  const isFasting = !!start;
  const elapsed   = start ? (now - new Date(start).getTime()) / 3600000 : 0;
  const pct       = Math.min(elapsed / windowHours, 1);
  const hrs       = Math.floor(elapsed);
  const mins      = Math.floor((elapsed - hrs) * 60);
  const done      = elapsed >= windowHours;

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-md p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <Timer size={17} className="text-purple-500"/> Fasting
        </h3>
        <select value={windowHours}
          onChange={e => onUpdate({ windowHours: +e.target.value })}
          disabled={isFasting}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none text-gray-600 disabled:opacity-50">
          {IF_WINDOWS.map(w => <option key={w.hours} value={w.hours}>{w.label}</option>)}
        </select>
      </div>

      {isFasting ? (
        <>
          <div className="text-center mb-3">
            <div className={`text-4xl font-extrabold tracking-tight ${done ? "text-emerald-600" : "text-gray-900"}`}>
              {hrs}h {String(mins).padStart(2,"0")}m
            </div>
            <div className="text-xs text-gray-400 mt-1">
              of {windowHours}h goal {done ? "· ✓ Complete!" : ""}
            </div>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct*100}%`, backgroundColor: done ? "#10B981" : "#A855F7" }}/>
          </div>
          <div className="flex gap-2 text-xs text-gray-400 justify-between mb-4">
            <span>Started {new Date(start).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</span>
            <span>Goal: {new Date(new Date(start).getTime()+windowHours*3600000).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</span>
          </div>
          <button onClick={() => onUpdate({ start: null })}
            className="w-full py-3 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 font-bold rounded-xl border border-red-100 transition-colors">
            End Fast
          </button>
        </>
      ) : (
        <>
          <div className="text-center py-3 mb-4">
            <div className="text-4xl mb-2">⏳</div>
            <div className="text-sm text-gray-400">Not currently fasting</div>
            <div className="text-xs text-gray-300 mt-1">{windowHours}h fast · eating window {24-windowHours}h</div>
          </div>
          <button onClick={() => onUpdate({ start: new Date().toISOString() })}
            className="w-full py-3 bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white font-bold rounded-xl transition-colors shadow-md shadow-purple-200">
            Start Fast
          </button>
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// COMPONENT: Recipe Builder Modal
// ─────────────────────────────────────────────

const RecipeModal = ({ onSave, onClose }) => {
  const [name,      setName]      = useState("");
  const [servings,  setServings]  = useState(4);
  const [ingredients, setIngredients] = useState([]);
  const [showFood,  setShowFood]  = useState(false);

  const addIngredient = (entry) => {
    setIngredients(prev => [...prev, { ...entry, logId: Date.now() }]);
    setShowFood(false);
  };
  const removeIngredient = (logId) => setIngredients(prev => prev.filter(e => e.logId !== logId));

  const totals = {
    calories: ingredients.reduce((s,e)=>s+e.calories,0),
    protein:  Math.round(ingredients.reduce((s,e)=>s+(e.protein||0),0)*10)/10,
    carbs:    Math.round(ingredients.reduce((s,e)=>s+(e.carbs||0),0)*10)/10,
    fat:      Math.round(ingredients.reduce((s,e)=>s+(e.fat||0),0)*10)/10,
    fiber:    Math.round(ingredients.reduce((s,e)=>s+(e.fiber||0),0)*10)/10,
    sodium:   Math.round(ingredients.reduce((s,e)=>s+(e.sodium||0),0)),
  };
  const perServing = {
    calories: Math.round(totals.calories / servings),
    protein:  Math.round(totals.protein  / servings * 10)/10,
    carbs:    Math.round(totals.carbs    / servings * 10)/10,
    fat:      Math.round(totals.fat      / servings * 10)/10,
    fiber:    Math.round(totals.fiber    / servings * 10)/10,
    sodium:   Math.round(totals.sodium   / servings),
  };

  const save = () => {
    if (!name.trim() || ingredients.length === 0) return;
    onSave({
      id: `recipe-${Date.now()}`,
      name: name.trim(),
      servings,
      ingredients,
      perServing,
      source: "My Recipes",
      servingSize: 1,
      servingUnit: "serving",
      ...perServing,
    });
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500"/>
          </button>
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <ChefHat size={18} className="text-emerald-500"/> Recipe Builder
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Recipe name */}
          <input value={name} onChange={e=>setName(e.target.value)}
            placeholder="Recipe name…"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base font-semibold outline-none focus:border-emerald-500"/>

          {/* Servings */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-700">Servings:</span>
            <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden">
              <button onClick={()=>setServings(s=>Math.max(1,s-1))} className="px-3 py-2 font-bold text-gray-600 hover:bg-gray-100">−</button>
              <span className="px-4 py-2 text-sm font-bold border-x border-gray-300 w-12 text-center">{servings}</span>
              <button onClick={()=>setServings(s=>s+1)} className="px-3 py-2 font-bold text-gray-600 hover:bg-gray-100">+</button>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-700">Ingredients</span>
              <button onClick={()=>setShowFood(true)}
                className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
                <Plus size={12}/> Add food
              </button>
            </div>
            {ingredients.length === 0 ? (
              <div className="text-center py-6 text-gray-300 border-2 border-dashed border-gray-200 rounded-xl">
                <ChefHat size={28} className="mx-auto mb-1"/>
                <p className="text-xs">Tap "Add food" to build your recipe</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {ingredients.map(ing => (
                  <div key={ing.logId} className="flex items-center gap-3 bg-gray-50 px-3 py-2.5 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{ing.name}</p>
                      <p className="text-xs text-gray-400">{ing.calories} kcal · P:{ing.protein}g C:{ing.carbs}g F:{ing.fat}g</p>
                    </div>
                    <button onClick={()=>removeIngredient(ing.logId)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per serving preview */}
          {ingredients.length > 0 && (
            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
              <p className="text-xs font-bold text-emerald-700 mb-2">Per serving ({servings} servings total)</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[["kcal",perServing.calories,"#111827"],["carbs",`${perServing.carbs}g`,"#3B82F6"],["protein",`${perServing.protein}g`,"#F97316"],["fat",`${perServing.fat}g`,"#EAB308"]].map(([l,v,c])=>(
                  <div key={l} className="bg-white rounded-xl p-2">
                    <div className="font-bold text-sm" style={{color:c}}>{v}</div>
                    <div className="text-xs text-gray-400">{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100">
          <button onClick={save} disabled={!name.trim() || ingredients.length===0}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 text-white font-bold rounded-2xl transition-colors">
            Save Recipe
          </button>
        </div>
      </div>

      {showFood && (
        <FoodSearchModal meal="Recipe" onAdd={addIngredient} onClose={()=>setShowFood(false)}/>
      )}
    </BottomSheet>
  );
};

const TodayScreen = ({ profile, diary, exercise, water, date, onAddFood, onAddWater, streak, stepsToday = 0, fasting, onFastingUpdate, weeklyCalories = [], stepMode = "extra" }) => {
  const goalCals = calcGoalCals(profile);
  const pct       = profile.macroPct || DEFAULT_MACROS;
  const goalMacros= calcMacroGrams(goalCals, pct);

  const entries  = Object.values(diary || {}).flat();
  const consumed = entries.reduce((s,e)=>s+e.calories,0);
  const weightKg = toKg(profile.weight, profile.weightUnit);
  const exerciseBurned = (exercise||[]).reduce((s,e)=>s+e.calories,0);
  // Auto-calculate steps from duration for step-based exercises (same logic as ExerciseScreen)
  const autoExSteps = (exercise||[]).reduce((s,e)=>{
    if (e.steps > 0) return s + e.steps;
    const spm = STEPS_PER_MIN[e.name];
    return s + (spm ? Math.round(spm * e.duration) : 0);
  }, 0);
  // stepMode: "extra" = stepsToday are on top of exercises; "total" = stepsToday is the full day count
  const extraSteps = stepMode === "total"
    ? Math.max(0, stepsToday - autoExSteps)   // total minus exercises, floored at 0
    : stepsToday;
  const manualStepCals = Math.round(extraSteps * 0.04 * (weightKg / 68));
  const burned = profile.addExerciseCals !== false ? (exerciseBurned + manualStepCals) : 0;
  const macros   = {
    carbs:   Math.round(entries.reduce((s,e)=>s+(e.carbs||0),0)),
    protein: Math.round(entries.reduce((s,e)=>s+(e.protein||0),0)),
    fat:     Math.round(entries.reduce((s,e)=>s+(e.fat||0),0)),
    fiber:   Math.round(entries.reduce((s,e)=>s+(e.fiber||0),0)*10)/10,
    sodium:  Math.round(entries.reduce((s,e)=>s+(e.sodium||0),0)),
  };
  const netCarbs = Math.max(0, macros.carbs - macros.fiber);
  // Standard goals: fiber 28g (blended DRI), sodium 2300mg
  const fiberGoal  = profile.sex === "female" ? 25 : 38;
  const sodiumGoal = 2300;

  return (
    <div className="flex flex-col gap-4 p-4 pt-5 pb-24 relative"
      style={{background:'linear-gradient(180deg,rgba(16,185,129,.09) 0%,rgba(249,250,251,1) 38%)'}}>

      {/* Decorative emerald orb behind ring card */}
      <div className="absolute top-0 left-0 right-0 h-56 pointer-events-none"
        style={{
          background:'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(16,185,129,.22) 0%, transparent 70%)',
          zIndex:0,
        }}/>

      {/* ── FitTrackr brand header ──────────────────── */}
      <div className="flex items-center justify-between pt-2 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
            <Zap size={20} className="text-white" strokeWidth={2.5}/>
          </div>
          <div>
            <span className="text-2xl font-black tracking-tight text-gray-900 leading-none">FitTrackr</span>
            <p className="text-[10px] text-emerald-500 font-bold tracking-widest uppercase leading-none mt-0.5">Free</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <div className="flex flex-col items-center bg-orange-50 border border-orange-100 rounded-xl px-3 py-1.5">
              <span style={streak>=7?{animation:'flame-dance 1.6s ease-in-out infinite',display:'inline-block',fontSize:'18px'}:{fontSize:'18px'}}>🔥</span>
              <span className="text-xs font-black text-orange-600 mt-0.5 leading-none">{streak}d</span>
            </div>
          )}
          <div className="text-right">
            <div className="text-sm font-bold text-gray-800">{fmtDate(date)}</div>
            <div className="text-xs text-gray-400">{(([y,m,d])=>new Date(+y,+m-1,+d).toLocaleDateString("en-US",{weekday:"long"}))(date.split('-'))}</div>
          </div>
        </div>
      </div>

      {/* Greeting */}
      <div className="relative z-10 px-1 -mb-1">
        <p className="text-xl font-black text-gray-800">{getGreeting()} 👋</p>
        <p className="text-sm text-gray-400 mt-0.5">{getDayMessage(diary, goalCals, consumed)}</p>
      </div>

      {/* Ring — glassmorphism card */}
      <div className="relative z-10 rounded-3xl p-5 border shadow-lg"
        style={{
          background:'rgba(255,255,255,0.72)',
          backdropFilter:'blur(16px)',
          WebkitBackdropFilter:'blur(16px)',
          borderColor:'rgba(255,255,255,0.7)',
          boxShadow:'0 8px 32px rgba(16,185,129,.12), 0 2px 8px rgba(0,0,0,.06)',
        }}>
        <CalorieRing consumed={consumed} goal={goalCals} burned={burned} meals={diary}/>
      </div>

      {/* Macro Doughnut */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-gray-800">Macros</h3>
          <span className="text-xs text-gray-400 font-semibold">
            {consumed > 0 ? `${Math.round((consumed/goalCals)*100)}% of goal` : "Nothing logged yet"}
          </span>
        </div>
        <MacroDoughnut macros={macros} goals={goalMacros} netCarbs={netCarbs} fiberGoal={fiberGoal} sodiumGoal={sodiumGoal}/>
      </div>

      {/* 7-Day Calorie Trend */}
      {weeklyCalories.some(v=>v>0) && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-md px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-gray-800 text-sm">7-Day Trend</h3>
            <span className="text-xs text-gray-400">
              {goalCals} kcal goal
            </span>
          </div>
          <div className="flex items-end justify-between gap-1">
            <Sparkline data={weeklyCalories} goal={goalCals} color="#10B981" height={52}/>
            <div className="text-right shrink-0 ml-3">
              <div className="text-xs text-gray-400 leading-tight">avg</div>
              <div className="font-black text-gray-800 text-sm">
                {Math.round(weeklyCalories.filter(v=>v>0).reduce((s,v)=>s+v,0)/Math.max(weeklyCalories.filter(v=>v>0).length,1))}
              </div>
              <div className="text-xs text-gray-400">kcal</div>
            </div>
          </div>
          {/* Day labels */}
          <div className="flex justify-between mt-1 px-0.5">
            {['M','T','W','T','F','S','S'].map((d,i)=>(
              <span key={i} className="text-[9px] text-gray-300 font-medium">{d}</span>
            ))}
          </div>
        </div>
      )}

      {/* Quick Add */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800">Add to diary</h3>
          <span className="text-xs text-gray-400">{consumed} kcal logged</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {MEALS.map((meal,i)=>{
            const mealEntries=(diary?.[meal]||[]);
            const mCals=mealEntries.reduce((s,e)=>s+e.calories,0);
            const mProtein=Math.round(mealEntries.reduce((s,e)=>s+(e.protein||0),0));
            const hasEntries = mealEntries.length > 0;
            return (
              <button key={meal} onClick={()=>onAddFood(meal)}
                className={`flex items-center gap-3 p-3.5 rounded-2xl transition-colors text-left border ${hasEntries?"bg-emerald-50 border-emerald-100 hover:bg-emerald-100":"bg-gray-50 border-gray-100 hover:bg-gray-100"}`}>
                <span className="text-2xl">{MEAL_ICONS[i]}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-800">{meal}</div>
                  <div className="text-xs text-gray-400">{hasEntries ? `${mCals} kcal · ${mProtein}g P` : "Tap to add"}</div>
                </div>
                <Plus size={15} className={`shrink-0 ${hasEntries?"text-emerald-400":"text-gray-300"}`}/>
              </button>
            );
          })}
        </div>
      </div>

      {/* Water */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Droplets size={17} className="text-blue-500"/> Water
          </h3>
          <span className="text-sm font-bold text-blue-600">{water}<span className="text-gray-400 font-normal text-xs"> / {profile.waterGoal||64} oz</span></span>
        </div>
        <div className="h-2.5 bg-blue-100 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-blue-400 rounded-full transition-all"
            style={{width:`${Math.min((water/(profile.waterGoal||64))*100,100)}%`}}/>
        </div>
        <div className="flex gap-2">
          {[8,12,16,20].map(amt=>(
            <button key={amt} onClick={()=>onAddWater(amt)}
              className="flex-1 py-2 text-xs font-bold text-blue-600 bg-blue-50 active:bg-blue-100 rounded-xl border border-blue-100 transition-colors">
              +{amt}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise summary */}
      {(exercise?.length>0)&&(
        <div className="bg-orange-50 border border-orange-100 rounded-3xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-orange-900 flex items-center gap-2">
              <Dumbbell size={15}/> Exercise
            </h3>
            <span className="font-bold text-orange-500">{exerciseBurned} kcal</span>
          </div>
          {exercise.map(ex=>(
            <div key={ex.logId} className="flex justify-between text-sm text-orange-800 py-0.5">
              <span>{ex.name}</span>
              <span className="font-semibold">{ex.duration}min{ex.steps>0?` · ${ex.steps.toLocaleString()} steps`:""}</span>
            </div>
          ))}
        </div>
      )}
      {/* Intermittent Fasting card */}
      {fasting !== undefined && (
        <IFCard fasting={fasting} onUpdate={onFastingUpdate}/>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// MODAL: Edit Food Entry (long-press to open)
// ─────────────────────────────────────────────

const EditFoodModal = ({ entry, meal, onSave, onDelete, onClose }) => {
  const base = entry._base; // original per-100g data if available

  const [name,     setName]     = useState(entry.name);
  const [servings, setServings] = useState(entry.servings || 1);
  const [calories, setCalories] = useState(entry.calories);
  const [protein,  setProtein]  = useState(entry.protein  || 0);
  const [carbs,    setCarbs]    = useState(entry.carbs    || 0);
  const [fat,      setFat]      = useState(entry.fat      || 0);
  const [fiber,    setFiber]    = useState(entry.fiber    || 0);
  const [sodium,   setSodium]   = useState(entry.sodium   || 0);

  // When servings changes and base data exists, recalculate macros
  useEffect(() => {
    if (!base) return;
    const f = servings * (base.servingSize / 100);
    setCalories(Math.round(base.calories * f));
    setProtein( Math.round(base.protein  * f * 10) / 10);
    setCarbs(   Math.round(base.carbs    * f * 10) / 10);
    setFat(     Math.round(base.fat      * f * 10) / 10);
    setFiber(   Math.round(base.fiber    * f * 10) / 10);
    setSodium(  Math.round(base.sodium   * f));
  }, [servings, base]);

  const handleSave = () => {
    onSave({ ...entry, name, servings, calories, protein, carbs, fat, fiber, sodium });
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500"/>
          </button>
          <div className="text-center">
            <h2 className="font-bold text-gray-900 text-sm">Edit Food</h2>
            <p className="text-xs text-gray-400">{meal}</p>
          </div>
          <button onClick={() => { onDelete(); onClose(); }}
            className="p-1.5 rounded-full hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
            <Trash2 size={18}/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Food name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500"/>
          </div>

          {/* Servings stepper */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              Servings {base ? `· ${base.servingSize}${base.servingUnit} each` : ""}
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden focus-within:border-emerald-500">
              <button onClick={() => setServings(s => Math.max(0.25, +(s - 0.25).toFixed(2)))}
                className="px-4 py-3 font-bold text-gray-600 hover:bg-gray-100 active:bg-gray-200">−</button>
              <span className="flex-1 text-center py-3 font-bold text-gray-900 border-x-2 border-gray-200">{servings}</span>
              <button onClick={() => setServings(s => +(s + 0.25).toFixed(2))}
                className="px-4 py-3 font-bold text-gray-600 hover:bg-gray-100 active:bg-gray-200">+</button>
            </div>
            {base && <p className="text-xs text-emerald-600 mt-1.5 font-medium">↻ Nutrition below updates automatically</p>}
          </div>

          {/* Nutrition grid */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              Nutrition {base ? "(auto-calculated · tap to override)" : ""}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Calories (kcal)", calories, setCalories, "#111827"],
                ["Protein (g)",     protein,  setProtein,  "#F97316"],
                ["Carbs (g)",       carbs,    setCarbs,    "#3B82F6"],
                ["Fat (g)",         fat,      setFat,      "#EAB308"],
                ["Fiber (g)",       fiber,    setFiber,    "#10B981"],
                ["Sodium (mg)",     sodium,   setSodium,   "#9CA3AF"],
              ].map(([label, val, setter, color]) => (
                <div key={label}>
                  <label className="text-xs font-semibold block mb-1" style={{ color }}>{label}</label>
                  <input
                    type="number" step="any"
                    value={val || ""}
                    onChange={e => setter(+e.target.value || 0)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {entry.logTime && (
            <p className="text-xs text-gray-300 text-center">Logged at {entry.logTime}</p>
          )}
        </div>

        {/* Save */}
        <div className="p-4 border-t border-gray-100">
          <button onClick={handleSave}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base rounded-2xl transition-colors shadow-lg shadow-emerald-200">
            Save Changes
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: MicroCard — daily micronutrient summary
// ─────────────────────────────────────────────

const MicroCard = ({ micros }) => {
  const present = MICRO_INFO.filter(m => (micros?.[m.key] || 0) > 0);
  if (present.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-bold text-gray-800 text-sm">Micronutrients</h3>
        <span className="text-xs text-gray-400">% of daily value</span>
      </div>
      <div className="p-4 grid grid-cols-2 gap-x-5 gap-y-4">
        {present.map(m => {
          const val = micros[m.key];
          const pct = Math.min(Math.round((val / m.drv) * 100), 100);
          const display = val < 1 ? val.toFixed(1) : Math.round(val);
          return (
            <div key={m.key}>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-xs font-semibold text-gray-700">{m.label}</span>
                <span className="text-xs text-gray-400 tabular-nums">{display}{m.unit}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full"
                  style={{width:`${pct}%`,backgroundColor:m.color,transition:'width .5s ease'}}/>
              </div>
              <div className="text-[10px] font-medium mt-0.5"
                style={{color:pct>=100?m.color:'#9CA3AF'}}>
                {pct}%{pct>=100?' ✓':''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const DiaryScreen = ({ diary, exercise, profile, date, onDateChange, onAddFood, onRemoveFood, onUpdateFood, recipes = [], onSaveRecipe, onDeleteRecipe, onAddRecipeToMeal }) => {
  const [showRecipe, setShowRecipe] = useState(false);
  const [editEntry,  setEditEntry]  = useState(null);
  const [editMeal,   setEditMeal]   = useState(null);
  const pressTimer = useRef(null);
  const [contentOpacity, fadeContent] = useFade();
  const handleDateChange = (d) => fadeContent(() => onDateChange(d));

  const dailyMicros = useMemo(() => {
    const totals = {};
    Object.values(diary || {}).flat().forEach(entry => {
      if (!entry.micros) return;
      Object.entries(entry.micros).forEach(([k, v]) => {
        totals[k] = Math.round(((totals[k] || 0) + v) * 100) / 100;
      });
    });
    return totals;
  }, [diary]);

  const startLongPress = (entry, meal) => {
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50); // short haptic pulse on Android
      setEditEntry(entry);
      setEditMeal(meal);
    }, 500);
  };
  const cancelLongPress = () => clearTimeout(pressTimer.current);
  const goalCals   = calcGoalCals(profile);
  const allEntries = Object.values(diary||{}).flat();
  const totalCals  = allEntries.reduce((s,e)=>s+e.calories,0);
  const exCals     = (exercise||[]).reduce((s,e)=>s+e.calories,0);
  const net        = goalCals - totalCals + exCals;

  return (
    <>
    <div className="flex flex-col relative" style={{height:'calc(100dvh - 72px)',overflow:'hidden',background:'linear-gradient(180deg,rgba(99,102,241,.15) 0%,rgba(249,250,251,1) 35%)'}}>
      <div className="absolute top-0 left-0 right-0 h-52 pointer-events-none"
        style={{background:'radial-gradient(ellipse 85% 65% at 50% -8%, rgba(99,102,241,.18) 0%, transparent 70%)',zIndex:0}}/>
      {/* Pinned header — never scrolls */}
      <div className="shrink-0 z-10 flex items-center justify-between px-4 py-4 border-b border-indigo-100/60"
        style={{background:'rgba(255,255,255,0.88)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',boxShadow:'0 3px 10px rgba(0,0,0,0.09)'}}>
        <button onClick={()=>handleDateChange(shiftDate(date,-1))} className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft size={20} className="text-gray-600"/></button>
        <div className="text-center">
          <p className="font-black text-gray-900 text-base leading-tight">{fmtDate(date)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{(([y,m,d])=>new Date(+y,+m-1,+d).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}))(date.split('-'))}</p>
        </div>
        <button onClick={()=>handleDateChange(shiftDate(date,1))} disabled={date>=todayStr()} className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-full disabled:opacity-30 transition-colors"><ChevronRight size={20} className="text-gray-600"/></button>
      </div>
      {/* Scrollable content — slides under pinned header */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="p-4 flex flex-col gap-4 pb-24" style={{opacity:contentOpacity,transition:'opacity .12s ease'}}>
        {/* Glassmorphism summary bar */}
        <div className="rounded-2xl p-4 grid grid-cols-4 gap-1 text-center"
          style={{
            background:'rgba(17,24,39,0.86)',
            backdropFilter:'blur(12px)',
            WebkitBackdropFilter:'blur(12px)',
            boxShadow:'0 8px 24px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.07)',
          }}>
          {[["Goal",goalCals,"text-gray-300"],["Food",totalCals,"text-emerald-400"],["Ex.",exCals,"text-orange-400"],["Net",net,net<0?"text-red-400":"text-white"]].map(([lbl,val,cls])=>(
            <div key={lbl} className="flex flex-col gap-0.5">
              <div className={`text-base font-extrabold ${cls}`}>{val}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">{lbl}</div>
            </div>
          ))}
        </div>

        {/* Micronutrients — only renders when logged foods have micro data */}
        <MicroCard micros={dailyMicros}/>

        {/* Meals */}
        {MEALS.map((meal,mi)=>{
          const entries=(diary?.[meal]||[]);
          const mCals=entries.reduce((s,e)=>s+e.calories,0);
          return (
            <div key={meal} className="bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{MEAL_ICONS[mi]}</span>
                  <span className="font-bold text-gray-800">{meal}</span>
                </div>
                <div className="flex items-center gap-2">
                  {entries.length > 0 && (
                    <span className="text-xs text-gray-400">
                      P:{Math.round(entries.reduce((s,e)=>s+(e.protein||0),0))}g
                      · C:{Math.round(entries.reduce((s,e)=>s+(e.carbs||0),0))}g
                      · F:{Math.round(entries.reduce((s,e)=>s+(e.fat||0),0))}g
                    </span>
                  )}
                  <span className="text-sm font-semibold text-gray-500">{mCals} kcal</span>
                  <button onClick={()=>onAddFood(meal)} className="w-7 h-7 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center shadow-md transition-colors">
                    <Plus size={14} className="text-white"/>
                  </button>
                </div>
              </div>
              {entries.length===0
                ? <p className="px-4 py-4 text-sm text-gray-400 text-center">Tap + to log {meal.toLowerCase()}</p>
                : entries.map(entry=>(
                    <FoodRow key={entry.logId} entry={entry} meal={meal}
                      onRemove={()=>onRemoveFood(meal,entry.logId)}
                      onLongPress={()=>{setEditEntry(entry);setEditMeal(meal);}}
                    />
                  ))
              }
            </div>
          );
        })}
        {/* AI Meal Plan Builder — above Build a Recipe */}
        <MealPlanCard profile={profile} />

        {/* Recipe builder — feature card */}
        <button onClick={() => setShowRecipe(true)}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-4 text-white shadow-lg shadow-amber-200 flex items-center gap-4 active:opacity-90 transition-opacity">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <ChefHat size={26} className="text-white"/>
          </div>
          <div className="text-left flex-1 min-w-0">
            <div className="font-extrabold text-base leading-tight">Build a Recipe</div>
            <div className="text-orange-100 text-xs mt-0.5 leading-snug">Add ingredients → get per-serving nutrition</div>
          </div>
          <ChevronRight size={20} className="text-white/60 shrink-0"/>
        </button>

        {/* My Recipes — below the button */}
        {recipes.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <span className="font-bold text-gray-800 flex items-center gap-2">
                <ChefHat size={15} className="text-emerald-500"/> My Recipes
              </span>
              <span className="text-xs text-gray-400">swipe left to delete</span>
            </div>
            {recipes.map(r => (
              <SwipeDeleteRow key={r.id} onDelete={()=>onDeleteRecipe(r.id)}>
                {()=>(
                  <div className="flex items-center px-4 py-3 bg-white gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.perServing.calories} kcal/serving</p>
                    </div>
                    {MEALS.map(meal => (
                      <button key={meal} onClick={() => onAddRecipeToMeal(meal, r)}
                        className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors font-medium shrink-0">
                        +{meal.slice(0,2)}
                      </button>
                    ))}
                  </div>
                )}
              </SwipeDeleteRow>
            ))}
          </div>
        )}
      </div>
      </div>  {/* end inner scroll */}
    </div>

    {showRecipe && (
      <RecipeModal
        onSave={(recipe) => { onSaveRecipe(recipe); setShowRecipe(false); }}
        onClose={() => setShowRecipe(false)}
      />
    )}

    {editEntry && (
      <EditFoodModal
        entry={editEntry}
        meal={editMeal}
        onSave={(updated) => { onUpdateFood(editMeal, updated); setEditEntry(null); setEditMeal(null); }}
        onDelete={() => { onRemoveFood(editMeal, editEntry.logId); setEditEntry(null); setEditMeal(null); }}
        onClose={() => { setEditEntry(null); setEditMeal(null); }}
      />
    )}
    </>
  );
};

// ─────────────────────────────────────────────
// SCREEN: Exercise
// ─────────────────────────────────────────────

const ExerciseScreen = ({ exercise, date, onDateChange, onAdd, onRemove, profile, stepsToday, onStepsChange, stepMode = "extra", onStepModeChange }) => {
  const [showModal, setShowModal] = useState(false);
  const weightKg      = toKg(profile.weight, profile.weightUnit);
  const [contentOpacity, fadeContent] = useFade();
  const handleDateChange = (d) => fadeContent(() => onDateChange(d));
  const exerciseCals  = (exercise||[]).reduce((s,e)=>s+e.calories,0);
  const exerciseSteps = (exercise||[]).reduce((s,e)=>{
    if (e.steps > 0) return s + e.steps;
    const spm = STEPS_PER_MIN[e.name];
    return s + (spm ? Math.round(spm * e.duration) : 0);
  }, 0);
  const autoCalcCount = (exercise||[]).filter(e =>
    e.steps === 0 && STEPS_PER_MIN[e.name]
  ).length;
  const manualSteps    = stepsToday || 0;
  // stepMode: "extra" = input is steps on top of exercises; "total" = input is full day total
  const extraSteps     = stepMode === "total" ? Math.max(0, manualSteps - exerciseSteps) : manualSteps;
  const totalSteps     = stepMode === "total" ? Math.max(exerciseSteps, manualSteps) : exerciseSteps + manualSteps;
  const manualStepCals = Math.round(extraSteps * 0.04 * (weightKg / 68));
  const totalBurned    = exerciseCals + manualStepCals;
  const stepMiles      = (totalSteps / 2000).toFixed(1);

  return (
    <div className="flex flex-col relative" style={{height:'calc(100dvh - 72px)',overflow:'hidden',background:'linear-gradient(180deg,rgba(249,115,22,.11) 0%,rgba(249,250,251,1) 32%)'}}>
      <div className="absolute top-0 left-0 right-0 h-52 pointer-events-none"
        style={{background:'radial-gradient(ellipse 85% 65% at 50% -8%, rgba(249,115,22,.22) 0%, transparent 70%)',zIndex:0}}/>
      {/* Pinned header — never scrolls */}
      <div className="shrink-0 z-10 flex items-center justify-between px-4 py-4 border-b border-orange-100/60"
        style={{background:'rgba(255,255,255,0.88)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',boxShadow:'0 3px 10px rgba(0,0,0,0.09)'}}>
        <button onClick={()=>handleDateChange(shiftDate(date,-1))} className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft size={20} className="text-gray-600"/></button>
        <div className="text-center">
          <p className="font-black text-gray-900 text-base leading-tight">{fmtDate(date)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{(([y,m,d])=>new Date(+y,+m-1,+d).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}))(date.split('-'))}</p>
        </div>
        <button onClick={()=>handleDateChange(shiftDate(date,1))} disabled={date>=todayStr()} className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-full disabled:opacity-30 transition-colors"><ChevronRight size={20} className="text-gray-600"/></button>
      </div>
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="p-4 flex flex-col gap-4 pb-24" style={{opacity:contentOpacity,transition:'opacity .12s ease'}}>
        {/* Glassmorphism orange banner */}
        <div className="rounded-3xl p-5 text-center text-white"
          style={{
            background:'linear-gradient(135deg,rgba(249,115,22,.94),rgba(234,88,12,.98))',
            backdropFilter:'blur(12px)',
            WebkitBackdropFilter:'blur(12px)',
            boxShadow:'0 0 40px rgba(249,115,22,.45), 0 8px 32px rgba(249,115,22,.3), inset 0 1px 0 rgba(255,255,255,.2)',
          }}>
          <div className="text-5xl font-extrabold">{totalBurned}</div>
          <div className="text-orange-100 mt-1">calories burned</div>
          {manualStepCals > 0 && (
            <div className="mt-2 text-xs text-orange-200">
              {exerciseCals} exercise + {manualStepCals} extra steps
            </div>
          )}
        </div>

        {/* Daily Steps — emerald glassmorphism */}
        <div className="rounded-2xl p-4"
          style={{
            background:'linear-gradient(135deg,rgba(16,185,129,.88),rgba(5,150,105,.94))',
            backdropFilter:'blur(12px)',
            WebkitBackdropFilter:'blur(12px)',
            boxShadow:'0 0 40px rgba(16,185,129,.4), 0 8px 24px rgba(16,185,129,.25), inset 0 1px 0 rgba(255,255,255,.2)',
          }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity size={17} className="text-emerald-200"/>
              <span className="font-bold text-white">Daily Steps</span>
            </div>
            {totalSteps > 0 && (
              <span className="text-xs text-emerald-200">{stepMiles} mi · {totalSteps.toLocaleString()} steps</span>
            )}
          </div>
          <div className="text-center mb-3">
            <span className="text-5xl font-extrabold text-white">{totalSteps.toLocaleString()}</span>
            <span className="text-sm text-emerald-200 ml-2">steps</span>
          </div>
          <div className="mb-2">
            <div className="flex justify-between text-xs text-emerald-200 mb-1">
              <span>Goal: 10,000 steps</span>
              <span>{Math.min(Math.round((totalSteps/10000)*100),100)}%</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.35)'}}>
              <div className="h-full bg-white/80 rounded-full transition-all"
                style={{width:`${Math.min((totalSteps/10000)*100,100)}%`}}/>
            </div>
          </div>
          {exerciseSteps > 0 && (
            <div className="flex items-center gap-2 text-xs text-emerald-100 bg-white/10 rounded-lg px-3 py-2 mt-2">
              <Dumbbell size={12}/>
              <span>
                {exerciseSteps.toLocaleString()} steps from exercises
                {autoCalcCount > 0 && <span className="text-emerald-200 ml-1">({autoCalcCount} auto-calculated)</span>}
              </span>
            </div>
          )}
        </div>

        {/* Log Exercise button — solid orange */}
        <button onClick={()=>setShowModal(true)}
          className="flex items-center justify-center gap-2 py-4 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-2xl text-white font-bold text-base shadow-lg shadow-orange-200 transition-colors">
          <Plus size={22}/> Log Exercise
        </button>

        {(exercise||[]).map(ex=>(
          <SwipeDeleteRow key={ex.logId} onDelete={()=>onRemove(ex.logId)} noBorder
            className="bg-white rounded-2xl border border-gray-100 shadow-md">
            {(open) => (
              <div className="flex items-center p-4 gap-4">
                <div className="w-11 h-11 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <Dumbbell size={19} className="text-orange-600"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{ex.name}</p>
                  <p className="text-xs text-gray-400">
                    {ex.duration} min
                    {ex.steps > 0 && <span className="ml-2 text-emerald-600 font-medium">· {ex.steps.toLocaleString()} steps</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-extrabold text-orange-500">{ex.calories}</div>
                  <div className="text-xs text-gray-400">kcal</div>
                </div>
                {open && <X size={13} className="text-gray-300 ml-1"/>}
              </div>
            )}
          </SwipeDeleteRow>
        ))}

        {(!exercise||exercise.length===0)&&(
          <div className="text-center py-6 text-gray-400">
            <Dumbbell size={36} className="mx-auto mb-2 opacity-20"/>
            <p className="text-sm">No exercise logged yet</p>
          </div>
        )}

        {/* Step mode selector + input */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          {/* Radio selector */}
          <p className="text-sm font-bold text-gray-700 mb-3">Step counting mode</p>
          <div className="flex flex-col gap-2.5 mb-4">
            {[
              { id: "extra", label: "Extra steps", sub: "Steps not captured in a logged exercise" },
              { id: "total", label: "Total steps today", sub: "Your full day count — exercises will be subtracted" },
            ].map(opt => (
              <button key={opt.id} onClick={() => onStepModeChange(opt.id)}
                className="flex items-start gap-3 text-left">
                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                  style={{ borderColor: stepMode === opt.id ? '#10B981' : '#D1D5DB' }}>
                  {stepMode === opt.id && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"/>}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{opt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.sub}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex items-center gap-3">
            {manualStepCals > 0 && (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0">
                +{manualStepCals} kcal
              </span>
            )}
            <input
              type="number" inputMode="numeric"
              value={stepsToday || ""}
              onChange={e => onStepsChange(Math.max(0, parseInt(e.target.value)||0))}
              placeholder={stepMode === "total" ? "Total steps today" : "Extra steps"}
              className="min-w-0 flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-base font-bold outline-none focus:border-emerald-400 placeholder-gray-300 bg-gray-50"
            />
            <span className="shrink-0 text-sm text-gray-400 font-medium">steps</span>
          </div>

          {/* Breakdown for total mode */}
          {stepMode === "total" && manualSteps > 0 && (
            <div className="mt-3 bg-gray-50 rounded-xl px-3 py-2.5 text-xs text-gray-600">
              <div className="flex justify-between mb-1">
                <span>Total entered</span>
                <span className="font-bold">{manualSteps.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span>From exercises</span>
                <span className="font-bold text-orange-500">− {exerciseSteps.toLocaleString()}</span>
              </div>
              <div className="h-px bg-gray-200 my-1"/>
              <div className="flex justify-between font-bold">
                <span>Extra steps credited</span>
                <span className={extraSteps > 0 ? "text-emerald-600" : "text-gray-400"}>
                  {extraSteps.toLocaleString()}
                  {extraSteps === 0 && manualSteps < exerciseSteps && (
                    <span className="text-xs font-normal text-gray-400 ml-1">(exercises exceed total)</span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>  {/* end inner scroll */}

      {showModal&&<ExerciseModal weightKg={weightKg} onAdd={ex=>{onAdd(ex);setShowModal(false);}} onClose={()=>setShowModal(false)}/>}
    </div>
  );
};

// ─────────────────────────────────────────────
// SCREEN: Progress
// ─────────────────────────────────────────────

const ProgressScreen = ({ profile, weightLog, onAddWeight, onDeleteWeight, diary = {}, exercise = {} }) => {
  const [newWeight, setNewWeight] = useState(profile.weight);
  const [view, setView] = useState("weight");
  const [tabOpacity, fadeTab] = useFade();
  const changeView = (v) => fadeTab(() => setView(v));
  const unit = profile.weightUnit;

  const sorted  = useMemo(()=>[...weightLog].sort((a,b)=>a.date.localeCompare(b.date)),[weightLog]);
  const chart   = sorted.slice(-30).map(e=>({ date: fmtShort(e.date), weight: e.weight }));
  const first   = sorted.length>0 ? sorted[0].weight   : profile.weight;
  const current = sorted.length>0 ? sorted[sorted.length-1].weight : profile.weight;
  const change  = Math.round((current-first)*10)/10;
  const toGoal  = Math.round((profile.goalWeight-current)*10)/10;

  const goalCals = calcGoalCals(profile);

  // Build last-7-days data for weekly report
  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = shiftDate(todayStr(), -(6 - i));
      const entries = Object.values(diary[d] || {}).flat();
      const exEntries = exercise[d] || [];
      return {
        date: fmtShort(d),
        calories: entries.reduce((s,e)=>s+e.calories,0),
        protein:  Math.round(entries.reduce((s,e)=>s+(e.protein||0),0)),
        carbs:    Math.round(entries.reduce((s,e)=>s+(e.carbs||0),0)),
        fat:      Math.round(entries.reduce((s,e)=>s+(e.fat||0),0)),
        burned:   exEntries.reduce((s,e)=>s+e.calories,0),
        logged:   entries.length > 0,
      };
    });
  }, [diary, exercise]);

  const loggedDays = last7.filter(d => d.logged);
  const avgCals  = loggedDays.length ? Math.round(loggedDays.reduce((s,d)=>s+d.calories,0)/loggedDays.length) : 0;
  const avgProtein = loggedDays.length ? Math.round(loggedDays.reduce((s,d)=>s+d.protein,0)/loggedDays.length) : 0;
  const daysUnder  = last7.filter(d => d.logged && d.calories <= goalCals).length;
  const daysOver   = last7.filter(d => d.logged && d.calories > goalCals).length;

  // Top foods insight
  const allEntries = Object.values(diary).flatMap(d => Object.values(d).flat());
  const foodFreq = {};
  allEntries.forEach(e => { foodFreq[e.name] = (foodFreq[e.name]||0) + e.calories; });
  const topFoods = Object.entries(foodFreq).sort((a,b)=>b[1]-a[1]).slice(0,5);

  return (
    <div className="flex flex-col gap-4 p-4 pt-5 pb-24 relative"
      style={{background:'linear-gradient(180deg,rgba(16,185,129,.09) 0%,rgba(249,250,251,1) 30%)'}}>
      <div className="absolute top-0 left-0 right-0 h-44 pointer-events-none"
        style={{background:'radial-gradient(ellipse 80% 60% at 50% -5%, rgba(16,185,129,.15) 0%, transparent 70%)',zIndex:0}}/>
      <h1 className="text-2xl font-extrabold text-gray-900 relative z-10">Progress</h1>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
        {[["weight","Weight"],["weekly","Weekly Report"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>changeView(id)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${view===id?"bg-white text-gray-900 shadow-md":"text-gray-400"}`}>
            {lbl}
          </button>
        ))}
      </div>

      <div style={{opacity:tabOpacity,transition:'opacity .12s ease'}}>
        {view === "weight" && (<>
        <div className="grid grid-cols-3 gap-3">
          {[["Start",sorted.length>0?sorted[0].weight:profile.weight],["Current",sorted.length>0?sorted[sorted.length-1].weight:profile.weight],["Goal",profile.goalWeight]].map(([lbl,val])=>(
            <div key={lbl} className="bg-white border border-gray-100 rounded-2xl p-3 text-center shadow-md">
              <div className="text-xl font-extrabold text-gray-900">{val}</div>
              <div className="text-xs text-gray-400">{unit}</div>
              <div className="text-xs text-gray-500 mt-0.5 font-medium">{lbl}</div>
            </div>
          ))}
        </div>

        <div className={`rounded-2xl p-4 text-center ${change<0?"bg-emerald-50":change>0?"bg-orange-50":"bg-gray-50"}`}>
          <span className={`text-lg font-bold ${change<0?"text-emerald-600":change>0?"text-orange-500":"text-gray-600"}`}>
            {change>0?"+":""}{change} {unit} total change
          </span>
          <div className="text-xs text-gray-400 mt-1">{toGoal>0?`${toGoal} ${unit} to goal`:toGoal<0?`${Math.abs(toGoal)} ${unit} past goal`:"Goal reached! 🎉"}</div>
        </div>

        {chart.length>1&&(
          <div className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
            <h3 className="font-bold text-gray-800 mb-3">Weight Chart</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"#9CA3AF"}} tickLine={false}/>
                <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#9CA3AF"}} tickLine={false} axisLine={false}/>
                <Tooltip formatter={v=>[`${v} ${unit}`,"Weight"]} contentStyle={{borderRadius:12,border:"none",boxShadow:"0 4px 20px rgba(0,0,0,.12)"}}/>
                <Line type="monotone" dataKey="weight" stroke="#10B981" strokeWidth={2.5} dot={false} activeDot={{r:5,fill:"#10B981"}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Scale size={16}/> Log Weight</h3>
          <div className="flex items-center gap-2">
            <input type="number" step="0.1" value={newWeight || ""} onChange={e=>setNewWeight(+e.target.value)}
              className="min-w-0 flex-1 px-3 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold outline-none focus:border-emerald-500"/>
            <span className="shrink-0 text-gray-500 font-medium text-sm">{unit}</span>
            <button onClick={()=>onAddWeight({date:todayStr(),weight:newWeight})}
              className="shrink-0 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors">
              Log
            </button>
          </div>
        </div>

        {sorted.length>0&&(
          <div className="bg-white border border-gray-100 rounded-2xl shadow-md overflow-hidden">
            <h3 className="font-bold text-gray-800 p-4 border-b border-gray-100">History
              <span className="text-xs font-normal text-gray-400 ml-2">swipe left to delete</span>
            </h3>
            {[...sorted].reverse().slice(0,10).map(entry=>(
              <SwipeDeleteRow key={entry.date} onDelete={()=>onDeleteWeight(entry.date)}>
                {()=>(
                  <div className="flex justify-between px-4 py-3 bg-white text-sm">
                    <span className="text-gray-500">{fmtDate(entry.date)}</span>
                    <span className="font-bold text-gray-900">{entry.weight} {unit}</span>
                  </div>
                )}
              </SwipeDeleteRow>
            ))}
          </div>
        )}
        </>)}

      {view === "weekly" && (<>
        {/* 7-day sparkline strip */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-md px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-800">7-Day Trend</span>
            <span className="text-xs text-gray-400">goal {goalCals} kcal</span>
          </div>
          <Sparkline data={last7.map(d=>d.calories)} goal={goalCals} color="#10B981" height={56}/>
          <div className="flex justify-between mt-1 px-0.5">
            {last7.map((d,i)=><span key={i} className="text-[9px] text-gray-300 font-medium">{d.date.slice(0,3)}</span>)}
          </div>
        </div>

        {/* 7-day calorie bar chart */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800">7-Day Calories</h3>
            <span className="text-xs text-gray-400">Goal: {goalCals} kcal</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={last7} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
              <XAxis dataKey="date" tick={{fontSize:10,fill:"#9CA3AF"}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fontSize:10,fill:"#9CA3AF"}} tickLine={false} axisLine={false} domain={[0,"auto"]}/>
              <Tooltip contentStyle={{borderRadius:12,border:"none",boxShadow:"0 4px 20px rgba(0,0,0,.12)"}}
                formatter={(v,n)=>[`${v} kcal`,n==="calories"?"Eaten":"Burned"]}/>
              <Bar dataKey="calories" fill="#10B981" radius={[6,6,0,0]}
                label={false}/>
              <Bar dataKey="burned" fill="#F97316" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 justify-center mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block"/>Eaten</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block"/>Burned</span>
          </div>
        </div>

        {/* Weekly stats */}
        <div className="grid grid-cols-2 gap-4">
          {[
            ["Avg calories/day", avgCals ? `${avgCals} kcal` : "—", "#10B981"],
            ["Avg protein/day",  avgProtein ? `${avgProtein}g` : "—", "#F97316"],
            ["Days on target",   `${daysUnder} of ${loggedDays.length}`, "#3B82F6"],
            ["Days over goal",   daysOver > 0 ? `${daysOver} day${daysOver>1?"s":""}` : "None 🎉", daysOver > 0 ? "#EF4444" : "#10B981"],
          ].map(([lbl,val,clr])=>(
            <div key={lbl} className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
              <div className="text-base font-extrabold" style={{color:clr}}>{val}</div>
              <div className="text-xs text-gray-500 mt-0.5">{lbl}</div>
            </div>
          ))}
        </div>

        {/* Top foods by calories */}
        {topFoods.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-md overflow-hidden">
            <h3 className="font-bold text-gray-800 p-4 border-b border-gray-100 flex items-center gap-2">
              <BarChart2 size={16} className="text-emerald-500"/> Top Calorie Sources
            </h3>
            {topFoods.map(([name, cals], i) => (
              <div key={name} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">{i+1}</span>
                <span className="flex-1 text-sm text-gray-800 truncate">{name}</span>
                <span className="text-sm font-bold text-gray-600">{Math.round(cals)} kcal</span>
              </div>
            ))}
          </div>
        )}

        {loggedDays.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <BarChart2 size={36} className="mx-auto mb-2 opacity-20"/>
            <p className="text-sm">Log food for a week to see your report</p>
          </div>
        )}
      </>)}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// SCREEN: Goals / Settings
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// COMPONENT: AI Meal Plan Builder
// ─────────────────────────────────────────────

const MealPlanCard = ({ profile }) => {
  const [plan,      setPlan]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [dietType,  setDietType]  = useState("balanced");

  const DIET_TYPES = [
    { value:"balanced",      label:"Balanced"       },
    { value:"low-carb",      label:"Low-Carb"       },
    { value:"keto",          label:"Keto"           },
    { value:"high-protein",  label:"High Protein"   },
    { value:"mediterranean", label:"Mediterranean"  },
    { value:"vegan",         label:"Vegan"          },
    { value:"vegetarian",    label:"Vegetarian"     },
    { value:"paleo",         label:"Paleo"          },
  ];

  const goalCals = calcGoalCals(profile);

  const generate = async () => {
    setLoading(true);
    setPlan(null);
    try {
      const res = await fetch("/.netlify/functions/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `Create a realistic 7-day meal plan for someone with these goals:
- Daily calorie target: ${goalCals} kcal
- Diet type: ${dietType}
- Macros: ~${Math.round(goalCals*.5/4)}g carbs, ~${Math.round(goalCals*.2/4)}g protein, ~${Math.round(goalCals*.3/9)}g fat

Return ONLY valid JSON, no markdown:
{
  "days": [
    {
      "day": "Monday",
      "meals": {
        "Breakfast": { "name": "meal name", "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
        "Lunch":     { "name": "meal name", "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
        "Dinner":    { "name": "meal name", "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
        "Snacks":    { "name": "meal name", "calories": 0, "protein": 0, "carbs": 0, "fat": 0 }
      },
      "total": 0
    }
  ]
}
Use real, specific meal names. Keep each day within 100 kcal of the target.`
          }]
        })
      });
      const data  = await res.json();
      const raw   = data.content?.[0]?.text?.trim() || "{}";
      const clean = raw.replace(/^```[a-z]*\n?/i,"").replace(/\n?```$/,"").trim();
      setPlan(JSON.parse(clean));
    } catch { setPlan(null); }
    setLoading(false);
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
      <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
        <Utensils size={15} className="text-emerald-500"/> AI Meal Plan Builder
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        Generate a personalized 7-day meal plan based on your calorie goal and diet preference. Free — MFP charges $99.99/year for this.
      </p>

      <div className="flex gap-2 mb-3">
        <select value={dietType} onChange={e=>setDietType(e.target.value)}
          className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500 bg-white">
          {DIET_TYPES.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button onClick={generate} disabled={loading}
          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-bold rounded-xl transition-colors text-sm whitespace-nowrap">
          {loading ? "Generating…" : "Generate Plan"}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-3 py-6 text-gray-400">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"/>
          <span className="text-sm">Building your 7-day plan…</span>
        </div>
      )}

      {plan?.days && (
        <div className="flex flex-col gap-3 mt-2">
          {plan.days.map(d => (
            <div key={d.day} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 flex justify-between items-center">
                <span className="font-bold text-sm text-gray-800">{d.day}</span>
                <span className="text-xs font-semibold text-emerald-600">{d.total} kcal</span>
              </div>
              {Object.entries(d.meals).map(([meal, info]) => (
                <div key={meal} className="flex items-start gap-2 px-3 py-2 border-t border-gray-50">
                  <span className="text-xs font-bold text-gray-400 w-16 shrink-0 pt-0.5">{meal.slice(0,4)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{info.name}</p>
                    <p className="text-xs text-gray-400">{info.calories} kcal · P:{info.protein}g C:{info.carbs}g F:{info.fat}g</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Help & FAQ accordion
// ─────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "How are my daily calories calculated?",
    a: "FitTrackr uses the Mifflin-St Jeor equation to estimate your Basal Metabolic Rate (BMR), then multiplies by your activity level to get your Total Daily Energy Expenditure (TDEE). Your goal (lose/maintain/gain) and weekly pace adjust this up or down by up to 1,000 kcal/day. Minimum floors: 1,200 kcal for women, 1,500 kcal for men."
  },
  {
    q: "What do carbs, protein, and fat percentages mean?",
    a: "These are your macro splits — how your daily calories are divided between the three macronutrients. The default 50/20/30 split (carbs/protein/fat) is a balanced starting point. Adjust sliders in Profile to customize. They must always add up to 100%."
  },
  {
    q: "What are net carbs?",
    a: "Net carbs = Total carbs minus fiber. Fiber passes through undigested and doesn't raise blood sugar, so many low-carb and keto dieters track net carbs instead of total carbs. FitTrackr shows both on the Today screen."
  },
  {
    q: "How are exercise calories calculated?",
    a: "FitTrackr uses the MET (Metabolic Equivalent of Task) formula from the Ainsworth Compendium of Physical Activities: Calories = (MET × 3.5 × weight in kg × minutes) ÷ 200. This is the same standard used by research labs and major fitness trackers."
  },
  {
    q: "How does the barcode scanner work?",
    a: "Tap the green camera icon in food search, then take a photo of the barcode. FitTrackr looks up the product in Open Food Facts (3M+ items, free). If not found, enter the barcode number manually at the bottom. Camera access works fully when the app is deployed outside of Claude."
  },
  {
    q: "What is the AI Meal Scan?",
    a: "Tap the purple fork icon in food search to open the Scan Your Plate screen. Tap Open Camera, photograph your plate, and Claude's vision AI identifies every food item visible and estimates per-100g nutrition for each. Results appear in the food list labeled 'Meal Scan'. Works best with good lighting and clearly distinct food items. Tap Try Again if nothing is detected."
  },
  {
    q: "How does food search work?",
    a: "When adding food to the diary, three radio buttons appear under the search bar — USDA, Open Food Facts, and AI Lookup. USDA is selected by default and covers generic whole foods and ingredients. Open Food Facts covers 3M+ packaged and branded products. Tap AI Lookup for restaurant items, regional foods, or anything the databases miss. Switching sources instantly re-runs your current search."
  },
  {
    q: "How do I edit a food entry I already logged?",
    a: "In the Diary screen, press and hold any food entry for about half a second. Your phone will vibrate briefly to confirm, then the Edit Food screen opens. You can change the food name, adjust servings (nutrition recalculates automatically if the original food data is available), or manually edit any nutrition value. Tap Save Changes to update, or use the trash icon in the top corner to delete the entry."
  },
  {
    q: "How do I build and log a recipe?",
    a: "Go to Diary → Build a Recipe. Add ingredients using the food search, set the number of servings, and save. Your recipe appears in My Recipes below and can be added to any meal with one tap. Per-serving nutrition is calculated automatically."
  },
  {
    q: "How does the Intermittent Fasting tracker work?",
    a: "Choose your fasting window (12:12 through OMAD) on the Today screen, then tap Start Fast. A countdown timer tracks your progress toward your goal window. Tap End Fast when your eating window begins. Your window setting is saved between sessions."
  },
  {
    q: "What is calorie cycling?",
    a: "Calorie cycling means setting different daily calorie targets for workout days vs rest days — for example, 2,400 kcal when training and 1,800 kcal on rest days. Enable it in Profile under Calorie cycling and enter your two targets."
  },
  {
    q: "How are daily steps counted?",
    a: "Steps come from two sources: exercises (walking and running auto-calculate steps from duration using cadence data) and your manual step entry. In the Exercise tab under 'Step counting mode', choose Extra steps (steps on top of exercises, the default) or Total steps today (your full day count — the app subtracts exercise steps automatically so nothing is double-counted). The Daily Steps card shows your combined total with a breakdown."
  },
  {
    q: "What is the 🔥 streak and what are milestones?",
    a: "The fire badge shows how many consecutive days you've logged at least one food entry. At milestone streaks — 7, 14, 30, 60, and 100 days — a celebration screen appears once to mark the achievement. Each milestone fires only once and is stored so it never repeats. Consistency beats perfection."
  },
  {
    q: "How do I delete food, exercise, or recipe entries?",
    a: "Swipe any entry left to reveal the red Delete button. The row slides open and waits — nothing is deleted until you tap Delete. Tap the row content or swipe back right to cancel without deleting. Works on food diary entries, exercise entries, weight history, and saved recipes."
  },
  {
    q: "What micronutrients does FitTrackr track?",
    a: "FitTrackr tracks 8 key micronutrients: Vitamin D, Calcium, Iron, Magnesium, Potassium, Zinc, Vitamin B12, and Vitamin C. A Micronutrients card appears in the Diary tab when logged foods have nutrient data — nutrients with no data are never shown as zero. When adding a food, available micros appear as colored badges in the detail panel before you log. Data comes from USDA and Open Food Facts; coverage is best for whole foods and packaged products."
  },
  {
    q: "How do I export my data?",
    a: "Go to Profile → Export to CSV. This downloads a spreadsheet containing your full food diary with timestamps, exercise log with step counts, and complete weight history. Opens in Excel, Google Sheets, or any spreadsheet app."
  },
  {
    q: "Is FitTrackr really free?",
    a: "Yes, completely. There are no ads, no entry caps, no paywalls, and no premium tier. Features that MyFitnessPal charges $79.99–$99.99/year for — barcode scanner, custom macros, net carbs, AI meal scan, weekly reports, recipe builder, micronutrient tracking, and the AI Meal Plan Builder — are all free here."
  },
];

const HelpFAQ = () => {
  const [sectionOpen, setSectionOpen] = useState(false);
  const [openIdx,     setOpenIdx]     = useState(null);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-md overflow-hidden">
      {/* Section header — tapping opens/closes the whole FAQ */}
      <button onClick={() => { setSectionOpen(s => !s); setOpenIdx(null); }}
        className="w-full flex items-center justify-between px-4 py-4 text-left">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
            <HelpCircle size={17} className="text-emerald-500"/>
          </div>
          <div>
            <p className="font-bold text-gray-800 text-sm">Help &amp; FAQ</p>
            <p className="text-xs text-gray-400">17 topics covered</p>
          </div>
        </div>
        <ChevronRight size={18} className={`text-gray-400 transition-transform duration-200 ${sectionOpen ? "rotate-90" : ""}`}/>
      </button>

      {sectionOpen && (
        <div className="border-t border-gray-100">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="border-b border-gray-50 last:border-0">
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full flex items-start justify-between px-4 py-3.5 text-left gap-3">
                <span className="text-sm font-semibold text-gray-800 leading-snug">{item.q}</span>
                <ChevronRight size={15}
                  className={`text-gray-300 shrink-0 mt-0.5 transition-transform duration-200 ${openIdx === i ? "rotate-90" : ""}`}/>
              </button>
              {openIdx === i && (
                <div className="px-4 pb-4 text-sm text-gray-500 leading-relaxed bg-gray-50">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: MacroSlider
// Custom range slider — controls both filled and unfilled track color
// so the unfilled portion is always white/light regardless of accent hue.
// ─────────────────────────────────────────────

const MacroSlider = ({ value, color, onChange }) => {
  const pct = Math.round(((value - 5) / (70 - 5)) * 100);
  return (
    <div className="relative flex items-center" style={{ height: 28 }}>
      {/* Track */}
      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, transition: "width .15s ease" }}/>
      </div>
      {/* Invisible native input — handles all pointer/touch events */}
      <input type="range" min="5" max="70" step="5" value={value}
        onChange={onChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
      {/* Styled thumb */}
      <div className="absolute w-5 h-5 rounded-full border-[3px] border-white shadow-md pointer-events-none"
        style={{ left: `calc(${pct}% - 10px)`, backgroundColor: color }}/>
    </div>
  );
};

const GoalsScreen = ({ profile, onSave, onExportCSV }) => {
  const [p, setP] = useState({...profile});
  const set = (k,v) => setP(prev=>({...prev,[k]:v}));
  const setMacro = (k,v) => setP(prev=>({...prev,macroPct:{...prev.macroPct,[k]:v}}));

  const preview    = calcGoalCals(p);
  const pct        = p.macroPct || DEFAULT_MACROS;
  const macros     = calcMacroGrams(preview, pct);
  const macroTotal = pct.carbs + pct.protein + pct.fat;

  return (
    <div className="flex flex-col gap-4 p-4 pt-5 pb-32 relative"
      style={{background:'linear-gradient(180deg,rgba(16,185,129,.06) 0%,rgba(249,250,251,1) 28%)'}}>
      <div className="absolute top-0 left-0 right-0 h-36 pointer-events-none"
        style={{background:'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(16,185,129,.13) 0%, transparent 70%)',zIndex:0}}/>
      <h1 className="text-2xl font-extrabold text-gray-900 relative z-10">Goals &amp; Profile</h1>

      <div className="relative z-10 rounded-3xl p-5 text-white text-center"
        style={{
          background:'linear-gradient(135deg,rgba(16,185,129,.92),rgba(5,150,105,.96))',
          backdropFilter:'blur(12px)',
          WebkitBackdropFilter:'blur(12px)',
          boxShadow:'0 8px 32px rgba(16,185,129,.28), inset 0 1px 0 rgba(255,255,255,.18)',
        }}>
        <div className="text-5xl font-extrabold">{preview}</div>
        <div className="text-emerald-100 mt-1">calories per day</div>
        {macroTotal!==100&&<div className="text-yellow-200 text-xs mt-2">⚠ Macros total {macroTotal}% — must equal 100%</div>}
      </div>

      {/* Goal */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
        <h3 className="font-bold text-gray-800 mb-3">Goal</h3>
        <div className="flex gap-2 mb-3">
          {[["lose","🔥 Lose"],["maintain","⚖️ Maintain"],["gain","💪 Gain"]].map(([val,lbl])=>(
            <button key={val} onClick={()=>set("goal",val)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${p.goal===val?"bg-emerald-500 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {lbl}
            </button>
          ))}
        </div>
        {p.goal!=="maintain"&&(
          <>
            <p className="text-xs text-gray-500 mb-2">Pace ({p.weightUnit}/week)</p>
            <div className="flex gap-2">
              {[0.5,1,1.5,2].map(pace=>(
                <button key={pace} onClick={()=>set("weeklyPace",pace)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${p.weeklyPace===pace?"bg-emerald-500 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {pace}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Activity */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
        <h3 className="font-bold text-gray-800 mb-3">Activity Level</h3>
        {Object.entries(ACTIVITY).map(([key,{label}])=>(
          <button key={key} onClick={()=>set("activityLevel",key)}
            className={`w-full flex justify-between items-center px-3.5 py-3 mb-2 rounded-xl text-sm text-left transition-all border-2 ${p.activityLevel===key?"border-emerald-400 bg-emerald-50":"border-transparent bg-gray-50 hover:border-gray-200"}`}>
            <span className="text-gray-800">{label}</span>
            {p.activityLevel===key&&<Check size={15} className="text-emerald-500 shrink-0"/>}
          </button>
        ))}
      </div>

      {/* Macros */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
        <h3 className="font-bold text-gray-800 mb-1">Macro Split</h3>
        <p className="text-xs text-gray-400 mb-4">Must add up to 100%. Drag sliders to customize.</p>
        {[["carbs","Carbs","#3B82F6"],["protein","Protein","#F97316"],["fat","Fat","#EAB308"]].map(([key,lbl,clr])=>(
          <div key={key} className="mb-4">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-sm font-semibold text-gray-700">{lbl}</span>
              <span className="text-sm font-bold" style={{color:clr}}>{pct[key]}% = {macros[key]}g</span>
            </div>
            <MacroSlider value={pct[key]} color={clr} onChange={e=>setMacro(key,+e.target.value)}/>
          </div>
        ))}
        {macroTotal!==100&&<p className="text-xs text-red-500 font-medium">Total: {macroTotal}% (needs to be 100%)</p>}
      </div>

      {/* Personal info */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
        <h3 className="font-bold text-gray-800 mb-3">Personal Info</h3>
        <div className="space-y-3">
          {[["Age","age","number",1],["Weight","weight","number",0.5],["Height","height","number",0.5],["Daily water goal (oz)","waterGoal","number",1]].map(([lbl,key,type,step])=>(
            <div key={key}>
              <label className="text-xs text-gray-500 font-medium block mb-1">{lbl}</label>
              <input type={type} step={step} value={p[key]||""} onChange={e=>set(key,+e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500"/>
            </div>
          ))}
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">Goal weight ({p.weightUnit})</label>
            <input type="number" step="0.5" value={p.goalWeight||""} onChange={e=>set("goalWeight",+e.target.value)}
              className="w-full px-3.5 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500"/>
          </div>
        </div>
      </div>

      {/* Exercise calorie toggle */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-800">Add exercise to calorie budget</p>
            <p className="text-xs text-gray-400 mt-0.5">When off, exercise is logged but doesn't change your remaining calories</p>
          </div>
          <button onClick={() => set("addExerciseCals", p.addExerciseCals === false ? true : false)}
            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ml-3 ${p.addExerciseCals !== false ? "bg-emerald-500" : "bg-gray-300"}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${p.addExerciseCals !== false ? "translate-x-6" : "translate-x-0.5"}`}/>
          </button>
        </div>
      </div>

      {/* Calorie cycling */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-gray-800">Calorie cycling</p>
            <p className="text-xs text-gray-400">Different targets for workout vs rest days</p>
          </div>
          <button onClick={() => set("cycleEnabled", !p.cycleEnabled)}
            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ml-3 ${p.cycleEnabled ? "bg-emerald-500" : "bg-gray-300"}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${p.cycleEnabled ? "translate-x-6" : "translate-x-0.5"}`}/>
          </button>
        </div>
        {p.cycleEnabled && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Workout day (kcal)</label>
              <input type="number" value={p.workoutCals||""} onChange={e=>set("workoutCals",+e.target.value)}
                placeholder={String(preview)}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Rest day (kcal)</label>
              <input type="number" value={p.restCals||""} onChange={e=>set("restCals",+e.target.value)}
                placeholder={String(Math.max(preview-300,1200))}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500"/>
            </div>
          </div>
        )}
      </div>

      <button onClick={()=>onSave(p)} disabled={macroTotal!==100}
        className="py-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-bold text-lg rounded-2xl shadow-lg shadow-emerald-200 transition-colors">
        Save Changes
      </button>

      {/* CSV Export */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-md p-4">
        <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2"><Download size={15}/> Export Data</h3>
        <p className="text-xs text-gray-400 mb-3">Download your diary, exercise, and weight history as a CSV spreadsheet.</p>
        <button onClick={onExportCSV}
          className="w-full flex items-center justify-center gap-2 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl font-semibold text-sm text-gray-700 transition-colors">
          <Download size={15}/> Export to CSV
        </button>
      </div>

      {/* Help & FAQ */}
      <HelpFAQ />
    </div>
  );
};

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────

export default function App() {
  const [loading,    setLoading]    = useState(true);
  const [profile,    setProfile]    = useState(null);
  const [screen,        setScreen]        = useState("today");
  const [displayScreen, setDisplayScreen] = useState("today");
  const [fadeOpacity,   setFadeOpacity]   = useState(1);
  const [date,       setDate]       = useState(todayStr());
  const [diary,      setDiary]      = useState({});
  const [exercise,   setExercise]   = useState({});
  const [water,      setWater]      = useState({});
  const [steps,      setSteps]      = useState({});
  const [recents,    setRecents]    = useState([]);
  const [weightLog,  setWeightLog]  = useState([]);
  const [foodModal,  setFoodModal]  = useState(null);
  const [toast,      setToast]      = useState("");
  const [fasting,    setFasting]    = useState({ start: null, windowHours: 16 });
  const [recipes,    setRecipes]    = useState([]);
  const [stepMode,   setStepMode]   = useState("extra"); // "extra" | "total"
  const [milestone,  setMilestone]  = useState(null); // streak milestone to celebrate

  // ── Load from storage ──
  useEffect(()=>{
    (async()=>{
      const [p,d,ex,w,st,wl,rc,fa,rv,ms,sm]=await Promise.all([
        store.get("nt-profile"), store.get("nt-diary"),
        store.get("nt-exercise"), store.get("nt-water"),
        store.get("nt-steps"), store.get("nt-weightlog"),
        store.get("nt-recents"), store.get("nt-fasting"),
        store.get("nt-recipes"), store.get("nt-milestones"),
        store.get("nt-stepmode"),
      ]);
      if(p)  setProfile(p);
      if(d)  setDiary(d);
      if(ex) setExercise(ex);
      if(w)  setWater(w);
      if(st) setSteps(st);
      if(wl) setWeightLog(wl);
      if(rc) setRecents(rc);
      if(fa) setFasting(fa);
      if(rv) setRecipes(rv);
      if(sm) setStepMode(sm);
      setLoading(false);
    })();
  },[]);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(""),2200); };

  // ── Handlers ──
  const handleOnboarding = (p) => {
    setProfile(p);
    store.set("nt-profile",p);
    const initial=[{date:todayStr(),weight:p.weight}];
    setWeightLog(initial);
    store.set("nt-weightlog",initial);
  };

  const handleAddFood = useCallback((meal,entry)=>{
    setDiary(prev=>{
      const next={...prev,[date]:{...(prev[date]||{}),[meal]:[...(prev[date]?.[meal]||[]),entry]}};
      store.set("nt-diary",next);
      return next;
    });
    haptic.light();
    // Save original food to recents (dedupe by id, cap at 30)
    const base = entry._base || entry;
    setRecents(prev=>{
      const next=[base,...prev.filter(f=>f.id!==base.id)].slice(0,30);
      store.set("nt-recents",next);
      return next;
    });
    setFoodModal(null);
  },[date]);

  const handleRemoveFood = useCallback((meal,logId)=>{
    setDiary(prev=>{
      const next={...prev,[date]:{...(prev[date]||{}),[meal]:(prev[date]?.[meal]||[]).filter(e=>e.logId!==logId)}};
      store.set("nt-diary",next);
      return next;
    });
  },[date]);

  const handleUpdateFood = useCallback((meal, updatedEntry) => {
    setDiary(prev => {
      const next = {
        ...prev,
        [date]: {
          ...(prev[date] || {}),
          [meal]: (prev[date]?.[meal] || []).map(e =>
            e.logId === updatedEntry.logId ? updatedEntry : e
          ),
        }
      };
      store.set("nt-diary", next);
      return next;
    });
    showToast("Entry updated ✓");
  }, [date]);

  const handleAddExercise = useCallback((ex)=>{
    setExercise(prev=>{
      const next={...prev,[date]:[...(prev[date]||[]),ex]};
      store.set("nt-exercise",next);
      return next;
    });
    haptic.light();
  },[date]);

  const handleRemoveExercise = useCallback((logId)=>{
    setExercise(prev=>{
      const next={...prev,[date]:(prev[date]||[]).filter(e=>e.logId!==logId)};
      store.set("nt-exercise",next);
      return next;
    });
  },[date]);

  const handleAddWater = useCallback((oz)=>{
    setWater(prev=>{
      const next={...prev,[date]:(prev[date]||0)+oz};
      store.set("nt-water",next);
      return next;
    });
  },[date]);

  const handleStepsChange = useCallback((n)=>{
    setSteps(prev=>{
      const next={...prev,[date]:n};
      store.set("nt-steps",next);
      return next;
    });
  },[date]);

  const handleStepModeChange = useCallback((mode) => {
    setStepMode(mode);
    store.set("nt-stepmode", mode);
  }, []);

  const handleAddWeight = useCallback((entry)=>{
    setWeightLog(prev=>{
      const next=[...prev.filter(e=>e.date!==entry.date),entry].sort((a,b)=>a.date.localeCompare(b.date));
      store.set("nt-weightlog",next);
      return next;
    });
    showToast("Weight logged ✓");
  },[]);

  const handleDeleteWeight = useCallback((date)=>{
    setWeightLog(prev=>{
      const next=prev.filter(e=>e.date!==date);
      store.set("nt-weightlog",next);
      return next;
    });
    showToast("Entry removed");
  },[]);

  const handleSaveGoals = (p) => {
    setProfile(p);
    store.set("nt-profile",p);
    haptic.light();
    showToast("Goals saved ✓");
  };

  const handleFastingUpdate = useCallback((update) => {
    setFasting(prev => {
      const next = { ...prev, ...update };
      store.set("nt-fasting", next);
      return next;
    });
  }, []);

  const handleSaveRecipe = useCallback((recipe) => {
    setRecipes(prev => {
      const next = [...prev, recipe];
      store.set("nt-recipes", next);
      return next;
    });
    showToast("Recipe saved ✓");
  }, []);

  const handleDeleteRecipe = useCallback((id) => {
    setRecipes(prev => {
      const next = prev.filter(r => r.id !== id);
      store.set("nt-recipes", next);
      return next;
    });
    showToast("Recipe deleted");
  }, []);

  const handleAddRecipeToMeal = useCallback((meal, recipe) => {
    const entry = {
      ...recipe.perServing,
      id: recipe.id,
      name: recipe.name,
      brand: "",
      servings: 1,
      logId: Date.now(),
      logTime: new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true}),
      servingSize: 1,
      servingUnit: "serving",
      source: "My Recipes",
      _base: recipe.perServing,
    };
    setDiary(prev => {
      const next = {...prev,[date]:{...(prev[date]||{}),[meal]:[...(prev[date]?.[meal]||[]),entry]}};
      store.set("nt-diary",next);
      return next;
    });
    showToast(`${recipe.name} added to ${meal} ✓`);
  }, [date]);

  // CSV export
  const handleExportCSV = useCallback(() => {
    const lines = ["Date,Meal,Food,Calories,Protein(g),Carbs(g),Fat(g),Fiber(g),Sodium(mg),Time"];
    Object.entries(diary).forEach(([d,meals]) => {
      Object.entries(meals).forEach(([meal,entries]) => {
        (entries||[]).forEach(e => {
          lines.push(`${d},"${meal}","${e.name.replace(/"/g,'""')}",${e.calories},${e.protein||0},${e.carbs||0},${e.fat||0},${e.fiber||0},${e.sodium||0},${e.logTime||""}`);
        });
      });
    });
    lines.push("\nDate,Exercise,Duration(min),Calories,Steps");
    Object.entries(exercise).forEach(([d,entries]) => {
      (entries||[]).forEach(e => {
        lines.push(`${d},"${e.name}",${e.duration},${e.calories},${e.steps||0}`);
      });
    });
    lines.push("\nDate,Weight");
    weightLog.forEach(e => lines.push(`${e.date},${e.weight}`));
    const blob = new Blob([lines.join("\n")],{type:"text/csv"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.download=`FitTrackr-${todayStr()}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast("CSV exported ✓");
  }, [diary, exercise, weightLog]);

  // ── Fade transition when switching screens ───────────────────
  const fadeTimer = useRef(null);
  useEffect(() => {
    if (screen === displayScreen) return;
    setFadeOpacity(0);
    clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      setDisplayScreen(screen);
      setFadeOpacity(1);
    }, 140);
    return () => clearTimeout(fadeTimer.current);
  }, [screen]);

  // ── Streak — MUST be before early returns (Rules of Hooks) ──────
  // Counts consecutive days that have at least one food entry.
  const streak = useMemo(() => {
    let count = 0;
    let d = shiftDate(todayStr(), -1);
    while (count <= 365) {
      if (Object.values(diary[d] || {}).flat().length === 0) break;
      count++;
      d = shiftDate(d, -1);
    }
    // Count today too if something was already logged
    if (Object.values(diary[date] || {}).flat().length > 0) count++;
    return count;
  }, [diary, date]);

  // ── Streak milestones — fire once per milestone ─────────────────
  const MILESTONES = [7, 14, 30, 60, 100];
  useEffect(() => {
    if (!MILESTONES.includes(streak) || !profile) return;
    store.get("nt-milestones").then(shown => {
      const seen = new Set(shown || []);
      if (!seen.has(streak)) {
        setMilestone(streak);
        haptic.milestone();
      }
    });
  }, [streak]);

  const handleMilestoneClose = useCallback(async () => {
    const shown = await store.get("nt-milestones");
    const next  = [...(shown || []), milestone];
    store.set("nt-milestones", next);
    setMilestone(null);
  }, [milestone]);

  // ── 7-day calorie data for sparklines ──────────────────────────
  const weeklyCalories = useMemo(() =>
    Array.from({length:7}, (_,i) => {
      const d = shiftDate(todayStr(), -(6-i));
      return Object.values(diary[d]||{}).flat().reduce((s,e)=>s+e.calories,0);
    }), [diary]);

  // ── Loading ──
  if(loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  // ── Onboarding ──
  if(!profile) return <Onboarding onComplete={handleOnboarding}/>;

  const todayDiary    = diary[date]    || {};
  const todayExercise = exercise[date] || [];
  const todayWater    = water[date]    || 0;
  const todaySteps    = steps[date]    || 0;

  const NAV = [
    { id:"today",    icon:Home,      label:"Today"    },
    { id:"diary",    icon:BookOpen,  label:"Diary"    },
    { id:"exercise", icon:Dumbbell,  label:"Exercise" },
    { id:"progress", icon:TrendingUp,label:"Progress" },
    { id:"goals",    icon:Settings,  label:"Profile"  },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto relative">
      {/* ── Global CSS animations ─────────────────── */}
      <style>{`
        @keyframes shimmer{0%{background-position:-400% 0}100%{background-position:400% 0}}
        .skeleton-pulse{background:linear-gradient(90deg,#f3f4f6 25%,#e9eaec 50%,#f3f4f6 75%);background-size:400% 100%;animation:shimmer 1.5s ease-in-out infinite;border-radius:8px}
        @keyframes flame-dance{0%,100%{transform:scale(1) rotate(-3deg);filter:drop-shadow(0 0 3px rgba(251,146,60,.5))}33%{transform:scale(1.18) rotate(3deg);filter:drop-shadow(0 0 10px rgba(251,146,60,.9))}66%{transform:scale(1.06) rotate(-1deg);filter:drop-shadow(0 0 6px rgba(251,146,60,.7))}}
        @keyframes confetti-burst{0%{transform:translateY(0) rotate(0deg) scale(1);opacity:1}100%{transform:translateY(90px) rotate(540deg) scale(.4);opacity:0}}
        @keyframes goal-ring-pulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.5);opacity:0}}
        @keyframes number-bump{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
      `}</style>
      <div className="flex-1 w-full overflow-x-hidden"
        style={{
          overflowY: (displayScreen==='diary'||displayScreen==='exercise') ? 'hidden' : 'auto',
          paddingBottom: (displayScreen==='diary'||displayScreen==='exercise') ? 0 : 72,
          opacity: fadeOpacity,
          transition: 'opacity .14s ease',
        }}>
        {displayScreen==="today"    && <TodayScreen    profile={profile} diary={todayDiary} exercise={todayExercise} water={todayWater} date={date} onAddFood={setFoodModal} onAddWater={handleAddWater} streak={streak} stepsToday={todaySteps} fasting={fasting} onFastingUpdate={handleFastingUpdate} weeklyCalories={weeklyCalories} stepMode={stepMode}/>}
        {displayScreen==="diary"    && <DiaryScreen    diary={todayDiary} exercise={todayExercise} profile={profile} date={date} onDateChange={setDate} onAddFood={setFoodModal} onRemoveFood={handleRemoveFood} onUpdateFood={handleUpdateFood} recipes={recipes} onSaveRecipe={handleSaveRecipe} onDeleteRecipe={handleDeleteRecipe} onAddRecipeToMeal={handleAddRecipeToMeal}/>}
        {displayScreen==="exercise" && <ExerciseScreen exercise={todayExercise} date={date} onDateChange={setDate} onAdd={handleAddExercise} onRemove={handleRemoveExercise} profile={profile} stepsToday={todaySteps} onStepsChange={handleStepsChange} stepMode={stepMode} onStepModeChange={handleStepModeChange}/>}
        {displayScreen==="progress" && <ProgressScreen profile={profile} weightLog={weightLog} onAddWeight={handleAddWeight} onDeleteWeight={handleDeleteWeight} diary={diary} exercise={exercise}/>}
        {displayScreen==="goals"    && <GoalsScreen    profile={profile} onSave={handleSaveGoals} onExportCSV={handleExportCSV}/>}
      </div>

      {/* Toast */}
      {toast&&(
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-xl z-50 whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-100 flex z-40 shadow-[0_-2px_12px_rgba(0,0,0,.06)]">
        {NAV.map(({id,icon:Icon,label})=>(
          <button key={id} onClick={()=>setScreen(id)}
            className={`flex-1 flex flex-col items-center pt-2 pb-3 gap-0.5 transition-colors ${screen===id?"text-emerald-500":"text-gray-400"}`}>
            <div className={`p-1.5 rounded-xl transition-all ${screen===id?"bg-emerald-50":""}`}>
              <Icon size={20} strokeWidth={screen===id?2.5:1.8}/>
            </div>
            <span className={`text-[10px] ${screen===id?"font-bold text-emerald-500":"font-medium text-gray-400"}`}>{label}</span>
          </button>
        ))}
      </div>

      {/* Milestone celebration */}
      {milestone && <MilestoneModal streak={milestone} onClose={handleMilestoneClose}/>}

      {/* Food Modal */}
      {foodModal&&(
        <FoodSearchModal meal={foodModal} onAdd={entry=>handleAddFood(foodModal,entry)} onClose={()=>setFoodModal(null)} recents={recents}/>
      )}
    </div>
  );
}