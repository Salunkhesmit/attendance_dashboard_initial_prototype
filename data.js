/* ==========================================================
   data.js — fetches students + attendance from Google Sheet.
   ========================================================== */

const IS_PLACEHOLDER_DATA = false;
const ATTENDANCE_THRESHOLD = 75;
const SEMESTERS = [1, 3, 5];

const SEM_META = {
  1: { code: 'CO1', label: 'Semester 1 (CO1)' },
  3: { code: 'CO3', label: 'Semester 3 (CO3)' },
  5: { code: 'CO5', label: 'Semester 5 (CO5)' }
};

const SESSION = { role: 'hod', user: null, allowedSems: [1, 3, 5] };

/* ---------- App configuration ---------- */
const APP_CONFIG = {
  sessionTTL: 8 * 60 * 60 * 1000,
  courses: [
    { code: 'AO',  name: 'Automobile Engineering',   enabled: false },
    { code: 'CE',  name: 'Computer Engineering',     enabled: false },
    { code: 'ME',  name: 'Mechanical Engineering',   enabled: false },
    { code: 'EE',  name: 'Electrical Engineering',   enabled: false },
    { code: 'EJ',  name: 'Electronics Engineering',  enabled: false },
    { code: 'COA', name: 'Computer Engineering (A)', enabled: false },
    { code: 'COB', name: 'Computer Engineering (B)', enabled: true  }
  ],
  defaultCourse: 'COB',
  defaultSem: 'odd'
};

/* ---------- Authorized users ---------- */
const AUTHORIZED_USERS = [
  { id: 'hod',  name: 'HOD',  role: 'HOD',   password: 'hod@ves2026', course: 'COB' },
  { id: 'smit', name: 'Smit', role: 'STAFF', password: 'salunkhe',    course: 'COB', email: 'co2024.smit' }
];

const SESSION_KEY = 'attendance_session_v1';

function getSession() {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function setSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {} }
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch {} }
function isAuthed() {
  const s = getSession();
  if (!s) return false;
  if (!s.loginTime || (Date.now() - s.loginTime) > APP_CONFIG.sessionTTL) {
    clearSession();
    return false;
  }
  return true;
}

/* ==========================================================
   Batch assignment (used for lab segregation)
     • 3 lab courses in slot →  A: 1–23   B: 24–46   C: 47–69
     • 2 lab courses in slot →  A: 1–35   B: 36–69
   ========================================================== */
function rollNumberToNum(rollNo) {
  const m = String(rollNo ?? '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}
function computeDefaultBatch(rollNo) {
  const n = rollNumberToNum(rollNo);
  if (n >= 1  && n <= 23) return 'A';
  if (n >= 24 && n <= 46) return 'B';
  if (n >= 47 && n <= 69) return 'C';
  return null;
}

/* ==========================================================
   ORIGINAL 6-slot-per-day timetables — DO NOT COLLAPSE.
   Slots shown to match the official VES Polytechnic grid:
     09:15–10:15  |  10:15–11:15
     [Short Break 11:15–11:30]
     11:30–12:30  |  12:30–13:30
     [Lunch Break 13:30–14:00]
     14:00–15:00  |  15:00–16:00
   Labs span two adjacent hours (2-hr block) via 2-hr slot key.
   ========================================================== */

/* ---------- CO3 — VES Polytechnic, Third Sem, P10 ---------- */
const CO3_TIMETABLE = {
  Monday: [
    { slot: '09:15-10:15', subject: 'DSU', type: 'Theory' },
    { slot: '10:15-11:15', subject: 'OOP', type: 'Theory' },
    { slot: '11:30-13:30', subject: 'CGR / DTE', type: 'Lab', batches: { A: 'CGR', B: 'DTE' } },
    { slot: '14:00-16:00', subject: 'DSU / DMS / OOP', type: 'Lab', batches: { A: 'DSU', B: 'DMS', C: 'OOP' } }
  ],
  Tuesday: [
    { slot: '09:15-10:15', subject: 'OOP', type: 'Theory' },
    { slot: '10:15-11:15', subject: 'DMS', type: 'Theory' },
    { slot: '11:30-13:30', subject: 'DTE / CGR', type: 'Lab', batches: { A: 'DTE', B: 'CGR' } },
    { slot: '14:00-15:00', subject: 'OOP (TU)', type: 'Theory' },
    { slot: '15:00-16:00', subject: 'DSU',      type: 'Theory' }
  ],
  Wednesday: [
    { slot: '09:15-10:15', subject: 'OOP', type: 'Theory' },
    { slot: '10:15-11:15', subject: 'DTE', type: 'Theory' },
    { slot: '11:30-12:30', subject: 'EJC', type: 'Theory' },
    { slot: '12:30-13:30', subject: 'DMS', type: 'Theory' },
    { slot: '14:00-16:00', subject: 'DMS / OOP / DSU', type: 'Lab', batches: { A: 'DMS', B: 'OOP', C: 'DSU' } }
  ],
  Thursday: [
    { slot: '09:15-10:15', subject: 'DMS', type: 'Theory' },
    { slot: '10:15-11:15', subject: 'DTE', type: 'Theory' },
    { slot: '11:30-13:30', subject: 'OOP / DSU / DMS', type: 'Lab', batches: { A: 'OOP', B: 'DSU', C: 'DMS' } },
    { slot: '14:00-16:00', subject: 'DMS / OOP / DSU', type: 'Lab', batches: { A: 'DMS', B: 'OOP', C: 'DSU' } }
  ],
  Friday: [
    { slot: '09:15-10:15', subject: 'DSU', type: 'Theory' },
    { slot: '10:15-11:15', subject: 'DTE', type: 'Theory' },
    { slot: '11:30-13:30', subject: 'OOP / DSU / DMS', type: 'Lab', batches: { A: 'OOP', B: 'DSU', C: 'DMS' } },
    { slot: '14:00-15:00', subject: 'DSU (TU)', type: 'Theory' },
    { slot: '15:00-16:00', subject: 'CGR', type: 'Theory' }
  ],
  Saturday: [
    { slot: '09:15-10:15', subject: 'DMS (TU)', type: 'Theory' },
    { slot: '10:15-11:15', subject: 'DMS (TU)', type: 'Theory' },
    { slot: '11:30-13:30', subject: 'DSU / DMS / OOP', type: 'Lab', batches: { A: 'DSU', B: 'DMS', C: 'OOP' } },
    { slot: '14:00-16:00', subject: 'DSU / DMS / OOP', type: 'Lab', batches: { A: 'DSU', B: 'DMS', C: 'OOP' } }
  ]
};

/* ---------- CO5 — VES Polytechnic, Fifth Sem, P17 ---------- */
const DEFAULT_TIMETABLE = {
  Monday: [
    { slot: '09:15-10:15', subject: 'STE',  type: 'Theory' },
    { slot: '10:15-11:15', subject: 'ENDS', type: 'Theory' },
    { slot: '11:30-13:30', subject: 'OSY / ENDS / DAN', type: 'Lab', batches: { A: 'OSY', B: 'ENDS', C: 'DAN' } },
    { slot: '14:00-15:00', subject: 'OSY',  type: 'Theory' },
    { slot: '15:00-16:00', subject: 'DAN',  type: 'Theory' }
  ],
  Tuesday: [
    { slot: '09:15-10:15', subject: 'STE',  type: 'Theory' },
    { slot: '10:15-11:15', subject: 'SPI',  type: 'Theory' },
    { slot: '11:30-13:30', subject: 'DAN / OSY / ENDS', type: 'Lab', batches: { A: 'DAN', B: 'OSY', C: 'ENDS' } },
    { slot: '14:00-15:00', subject: 'DAN',  type: 'Theory' },
    { slot: '15:00-16:00', subject: 'OSY',  type: 'Theory' }
  ],
  Wednesday: [
    { slot: '09:15-11:15', subject: 'STE / STE', type: 'Lab', batches: { A: 'STE', B: 'STE' } },
    { slot: '11:30-12:30', subject: 'LIBRARY HOUR', type: 'Library' },
    { slot: '12:30-13:30', subject: 'OSY', type: 'Theory' },
    { slot: '14:00-15:00', subject: 'DAN', type: 'Theory' },
    { slot: '15:00-16:00', subject: 'STE', type: 'Theory' }
  ],
  Thursday: [
    { slot: '09:15-11:15', subject: 'ENDS / DAN / OSY', type: 'Lab', batches: { A: 'ENDS', B: 'DAN', C: 'OSY' } },
    { slot: '11:30-12:30', subject: 'OSY',  type: 'Theory' },
    { slot: '12:30-13:30', subject: 'ENDS', type: 'Theory' },
    { slot: '14:00-15:00', subject: 'DAN',  type: 'Theory' },
    { slot: '15:00-16:00', subject: 'STE',  type: 'Theory' }
  ],
  Friday: [
    { slot: '09:15-10:15', subject: 'OSY', type: 'Theory' },
    { slot: '10:15-11:15', subject: 'STE', type: 'Theory' },
    { slot: '11:30-12:30', subject: 'DAN', type: 'Theory' },
    { slot: '12:30-13:30', subject: 'OSY', type: 'Theory' },
    { slot: '14:00-16:00', subject: 'STE / STE', type: 'Lab', batches: { A: 'STE', B: 'STE' } }
  ],
  Saturday: []
};

const clone = o => JSON.parse(JSON.stringify(o));

const DEFAULT_DATA = {
  1: { students: [], timetable: clone(DEFAULT_TIMETABLE) },
  3: { students: [], timetable: clone(CO3_TIMETABLE) },
  5: { students: [], timetable: clone(DEFAULT_TIMETABLE) }
};

const DATA = clone(DEFAULT_DATA);
const RECORDS = [];

const studentsOf  = sem => DATA[sem].students;
const timetableOf = sem => DATA[sem].timetable;

/* ---------- Persistence ---------- */
const STORAGE_KEY = 'attendance_system_v8';   // bumped to force-refresh timetables

function saveAll() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: DATA, records: RECORDS })); } catch {}
}
function loadPersisted() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  SEMESTERS.forEach(s => {
    DATA[s].students = [];
    DATA[s].timetable = clone(DEFAULT_DATA[s].timetable);
  });
  RECORDS.length = 0;
  saveAll();
}

/* ---------- Hydrate from cache (batch backfilled if missing) ---------- */
(function hydrateFromCache() {
  const cached = loadPersisted();
  if (!cached) return;
  try {
    SEMESTERS.forEach(s => {
      const c = cached.data && cached.data[s];
      if (!c) return;
      if (Array.isArray(c.students)) {
        DATA[s].students = c.students.map(st => ({
          ...st,
          batch: st.batch || computeDefaultBatch(st.rollNo)
        }));
      }
      if (c.timetable) DATA[s].timetable = c.timetable;
    });
    if (Array.isArray(cached.records)) {
      RECORDS.length = 0;
      cached.records.forEach(r => RECORDS.push(r));
    }
  } catch (e) {
    console.warn('Cache hydrate failed:', e);
  }
})();

/* ==========================================================
   Google Sheet source
   ========================================================== */
const SHEET_URL = "https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnT29nxIpr7o5YCsPlCj6d9pe7pUaB3fkWjwQOVCO9OZbxa7l0ra0tnz3wSYvnZF_f4jJ-09CaZnA4L11CzzGoM4ldTWh52P2MM6MJHieNxAfKSwrgSfQU6s7Bb6__48m_MbQjOmTANDnnpApIqRlsqUg_SCtryOCuURgkLymH4rPCZe0Ogvd10EVxyRqtaLz0Vfa0MAyTIM3tZQQTZpn5oVGsVJjDu9uTX609x_seq4ok1VpeSH5ANE43Xm35BTISHiAcIv1jGKjZ8LY1D64GqE0oSTaw&lib=MKx-UhDgu-Hcs8X5yeMtSk_FqzDO4jqHr";

function parseHeaderToDate(h) {
  const s = String(h ?? '').trim();
  if (!s) return null;
  if (/^\d{1,2}$/.test(s)) {
    const d = Number(s);
    if (d >= 1 && d <= 31) return `2026-09-${String(d).padStart(2, '0')}`;
  }
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]);
    let y = Number(m[3]); if (y < 100) y += 2000;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]);
    return `2026-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dt = new Date(s + ' 2026');
  if (!isNaN(dt.getTime())) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  return null;
}

function normalizeStatus(v) {
  const s = String(v ?? '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'P' || s === 'PRESENT' || s === '1') return 'P';
  if (s === 'A' || s === 'ABSENT'  || s === '0') return 'A';
  if (s === 'L' || s === 'LATE')                 return 'L';
  if (s === 'B' || s === 'BUNK')                 return 'B';
  return null;
}

function expandIntoRecords(rollNo, date, status, sem) {
  const slots = (timetableOf(sem)[weekdayOf(date)] || []);
  slots.forEach(slot => {
    if (slot.type === 'Library') return;
    RECORDS.push({ rollNo, date, slot: slot.slot, status });
  });
}

async function loadFromSheets() {
  const res = await fetch(SHEET_URL, { method: 'GET', redirect: 'follow', cache: 'no-store' });
  if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success || !Array.isArray(json.students)) {
    throw new Error('Sheet payload missing { success, students[] }');
  }

  SEMESTERS.forEach(s => { DATA[s].students = []; });
  RECORDS.length = 0;

  let studentCount = 0;
  const before = RECORDS.length;

  json.students.forEach(row => {
    const rollNo = String(row.rollNo ?? '').trim();
    const name   = String(row.name   ?? '').trim();
    if (!rollNo || !name) return;

    let sem = 5;
    const m = rollNo.match(/^CO\s*(\d)/i);
    if (m && SEMESTERS.includes(Number(m[1]))) sem = Number(m[1]);

    const batchFromSheet = String(row.batch ?? '').trim();
    const batch = batchFromSheet || computeDefaultBatch(rollNo);

    DATA[sem].students.push({
      rollNo, name, semester: sem, batch,
      enrollmentNo: String(row.enrollmentNo ?? '').trim()
    });
    studentCount++;

    const att = row.attendance || {};
    Object.keys(att).forEach(header => {
      const date = parseHeaderToDate(header);
      if (!date) return;
      const status = normalizeStatus(att[header]);
      if (!status) return;
      expandIntoRecords(rollNo, date, status, sem);
    });
  });

  const recordCount = RECORDS.length - before;
  saveAll();
  console.log(`[Sheet] ${studentCount} students, ${recordCount} slot records loaded.`);
  return { students: studentCount, records: recordCount };
}
