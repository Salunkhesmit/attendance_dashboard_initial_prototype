/* ==========================================================
   data.js — per-semester students, timetables, and records.
   Each semester has its OWN students + timetable.
   Persisted in localStorage. Backend-ready.
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

/* ---------- CO3 timetable — VES Polytechnic, Third Sem, P10, 2026-27 ---------- */
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
    /* Friday 16:00-17:00 OOP(TU) skipped — app grid stops at 4:00 */
  ],
  Saturday: [
    { slot: '09:15-10:15', subject: 'DMS (TU)', type: 'Theory' },
    { slot: '10:15-11:15', subject: 'DMS (TU)', type: 'Theory' },
    { slot: '11:30-13:30', subject: 'DSU / DMS / OOP', type: 'Lab', batches: { A: 'DSU', B: 'DMS', C: 'OOP' } },
    { slot: '14:00-16:00', subject: 'DSU / DMS / OOP', type: 'Lab', batches: { A: 'DSU', B: 'DMS', C: 'OOP' } }
  ]
};

/* ---------- CO5 timetable — VES Polytechnic, Fifth Sem, P17, 2026-27 ---------- */
const DEFAULT_TIMETABLE = {
  Monday: [
    { slot: '09:15-10:15', subject: 'STE',  type: 'Theory' },
    { slot: '10:15-11:15', subject: 'ENDS', type: 'Theory' },
    { slot: '11:30-13:30', subject: 'OSY / ENDS / DAN',  type: 'Lab', batches: { A: 'OSY', B: 'ENDS', C: 'DAN' } },
    { slot: '14:00-15:00', subject: 'OSY',  type: 'Theory' },
    { slot: '15:00-16:00', subject: 'DAN',  type: 'Theory' }
  ],
  Tuesday: [
    { slot: '09:15-10:15', subject: 'STE',  type: 'Theory' },
    { slot: '10:15-11:15', subject: 'SPI',  type: 'Theory' },
    { slot: '11:30-13:30', subject: 'DAN / OSY / ENDS',  type: 'Lab', batches: { A: 'DAN', B: 'OSY', C: 'ENDS' } },
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

/* ---------- CO5 students ---------- */
const CO5_STUDENT_NAMES = [
  'TUPE SHUBHAM SANJAY','SAPAT BHAVIK BHAU','SINGH YUVRAJ PRITESH','BANKAR SIDDHI MAHESH',
  'MANANI AARYA AMIT','LUND VARUN SUNIL','GANGARAMANI RHEA DILIP','NAVANI PRATEEK RAVI',
  'BAJAJ MAYANK NARESH','SHAH TANIYA SANJESH','DINK VIVA NARESH','PAHUJA TAMANNA ANIL',
  'PARPIANI YASH HARESH','TOLANI PIYUSH JEETENDER','NATHWANI DAKSH PREMCHAND','DAKSH BHAGWAAN TEJAANI',
  'ASNANI BHAVISHA DINESH','MAHADIK AARYA SUSHANT','PATANGRAO JUI SURESH','PALAK VIPIN NARKHEDE',
  'PATIL PRATHAM GANESH','WADHWA DIMPLE MANOHAR','PINGLE JAIT GANESH','TURSHANI ESHITA HIRALAL',
  'LUND MOHIT BHAGCHAND','SEVKANI DAKSH ANIL','TEKWANI PIYA PRAKASH','ASHANI NAITIK RAVI',
  'SHAH AAGAM NILESH','SUMBE SHREYA RAMESH','KHAN MOHAMMAD TALHA DANISH','PATALIKADAN DARSH GANESHKUMAR',
  'NANAWARE SAYALI SUHAS','SAGARE SOHAM SANDIP','GALANDE SOHAM PRABHAKAR','BHERE ADITYA ANANT',
  'CHIPPA RITESH LAXMAN','SAWLANI ABHISHEK NITIN','BUDHRANI ADITYA GIRISH','SMIT NILESH SALUNKHE',
  'WANI VIRAJ HEMANT','BODDU AARYA NARENDRA','PHADTARE SRUSHTI BALASAHEB','AUTADE YOGITA DIGAMBAR',
  'CHENDURKAR SANIYA SUBHASH','AZLAN AHMED SIDDIQUI','PATIL YUVRAJ KISHOR','AWASARE ABHINAV MILIND',
  'FERNANDES JORDAN JOHN','SADHWANI PALAK RAJA','RAGHANI RENUKA SUNIL','SONAVANE ARYAN RAHUL',
  'GHARE TANMAY RAMESH','DHONE SANCHIT SANDIP','LOHAR ATHARVA SUNIL','KHARE RUSHITA ASHOK',
  'DHONDPHODE PURVA EKNATH','SHINDE SAIRAJ MILIND','PHADKE AAYUSH ARUN','TANDLEKAR ANJALI SUJIT',
  'VANNE AAMODIT AVIRAJ','CHANDWANI KIRTIKA SUNIL','KATKAR PRACHI SANTOSH','GODSE ADITI RAMESH',
  'AYUSH ANIL KAMBLE','GUPTA SACHIN NARENDRA','KAPADNE SAMIKSHA RAJU','KUSHAL VIJAY PATEL',
  'MIHIR SACHIN AMBEKAR'
];

const CO5_STUDENTS = CO5_STUDENT_NAMES.map((name, i) => ({
  rollNo: 'CO5-' + String(i + 1).padStart(2, '0'),
  name, semester: 5, batch: null
}));

const DEFAULT_DATA = {
  1: { students: [], timetable: clone(DEFAULT_TIMETABLE) },
  3: { students: [], timetable: clone(CO3_TIMETABLE) },
  5: { students: CO5_STUDENTS, timetable: clone(DEFAULT_TIMETABLE) }
};

/* ==========================================================
   September 2026 CO5 attendance — 30 columns (01/09 .. 30/09).
   Char meanings:  P = Present, A = Absent, _ = blank (holiday — no records).
   ========================================================== */
const SEP_2026_ROWS = [
  "PPPP__PAPPP___PPPA__PPPP___PPP",
  "PPPP__PPPPP___AAPA__PPPP___PPP",
  "PPPP__PPPPP___APPA__PPPP___PPP",
  "PPPP__PPPPP___APPA__PPPP___PPP",
  "PPPP__PPPPP___APPA__PPPP___PPP",
  "PPPP__PPPPP___AAAP__PPPP___PPP",
  "PAPP__PPPPP___APAA__PPPP___PPP",
  "PPPP__PPPPP___AAAP__PPPP___PPP",
  "PPAP__PPPPP___PPAA__PPPA___PPP",
  "PPPP__PPPPP___AAAA__PPPP___PPP",
  "PPPP__PPPPP___PPPA__PPPP___PPP",
  "APPA__PPPPP___PPAA__PPPP___PPP",
  "PPPP__APPPP___PPAP__PPPP___PPP",
  "PPAP__APAPP___APAP__PAAA___PPP",
  "PPPA__PPAAP___AAAA__PPAA___PPP",
  "PPPP__PPAPP___AAAA__PPAP___PPP",
  "PPPA__PPPPP___AAPP__PPAP___PPP",
  "PPPP__PPPPP___APPA__PPPP___PPP",
  "PPPP__PPPPP___APPP__PPPP___PPP",
  "PPPP__APPPP___APPP__PPPP___PPP",
  "PPPP__PPPAP___AAAA__PPPP___PPA",
  "PAPA__PAPPP___PPAP__PPPP___PPP",
  "PPPP__PPPPP___APAA__PAPP___PPP",
  "PPPP__PPPPP___AAPA__PPPP___PPP",
  "PPPP__PPPPP___PPAA__PPAP___PPA",
  "PPPA__PPPPP___AAPA__PPAP___PPP",
  "PAPP__PPPPP___APPP__PPPP___PPP",
  "PPPP__PPPPP___PAPA__PPAA___PPP",
  "PPAP__PPPPP___AAPP__PPPP___PPP",
  "PPPP__PPPPP___AAPP__PPPP___PPP",
  "PPPP__PPPPP___PPPP__PPPP___PPP",
  "PPAA__APAPA___AAPA__PPAP___PPP",
  "PPPP__PPPPP___APAP__PPPP___PPP",
  "PPPP__APPPP___AAAA__PPAP___PPP",
  "PPPP__PPPPP___PPAA__PPPP___PPP",
  "PPPP__PAAPA___APPP__PPPP___PPA",
  "PPPP__PPPPP___AAAA__PPAP___PPP",
  "PPAP__PPPPP___APPA__PAPP___PPA",
  "APAP__PPPPP___PPPA__PAPP___PPP",
  "PPPP__PPPPP___PPAP__PPPP___PPP",
  "PPPP__PPPPP___APPA__PPPP___PPP",
  "PPPP__PPPPP___AAAA__PPPP___PPP",
  "PPPP__PPPPP___APAP__PPPP___PPP",
  "PPPP__PPPPP___APAP__PPPP___PPP",
  "PPPP__PPPPP___APAP__PPPP___PPP",
  "PPAP__PPPPP___PPPA__PPPP___PPP",
  "PPAP__PPPPP___PPPA__PAPA___APP",
  "PPPP__PPPPP___APPA__PPPP___PPP",
  "APAP__APAPA___APAA__PPPP___PPP",
  "PAPP__PPPPP___APPP__PPPP___PPP",
  "PPPP__PPPPP___PPPA__PPPP___PPP",
  "PPPP__PPPPP___APAA__PPPP___PPP",
  "PPPP__PPPPA___PPAA__PPPP___PPA",
  "PPPP__PPPPP___PPAA__PPAP___PPP",
  "PPPP__PPPPP___PPPA__PPPP___PPP",
  "PAPP__APPPP___APAA__PPPP___PPP",
  "PPPP__PPPPP___APAA__PPPP___PPP",
  "PPAA__PPPPA___AAAA__PAAA___APP",
  "PPPP__PPPPA___PAAP__PPPP___APP",
  "PPPP__PPPPP___AAAA__PPPP___PPP",
  "PAPP__PPPPP___APPA__PAPP___PPP",
  "PPPP__PPPPP___APAA__PPAP___PPP",
  "PPPP__PPPPP___PPAA__PAAP___PPP",
  "PPPP__PAPPP___PPAA__PAAP___PPP",
  "PPPP__PPPPA___PPAP__PPAP___PPP",
  "PPPA__PPPPP___APPP__PAAP___APP",
  "PPPP__PPPPP___PPAA__PAAP___PPP",
  "PPPA__PAPPP___AAAA__PPAP___PPP",
  "PPPA__APAAA___AAAA__PAAA___PPP"
];

/* ---------- Persistence (v5) ---------- */
const STORAGE_KEY = 'attendance_system_v5';

function loadPersisted() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

const persisted = loadPersisted();
const DATA = persisted && persisted.data ? persisted.data : clone(DEFAULT_DATA);
const RECORDS = persisted && Array.isArray(persisted.records) ? persisted.records : [];

SEMESTERS.forEach(s => { if (!DATA[s]) DATA[s] = clone(DEFAULT_DATA[s]); });

/* ---------- One-time migration: replace all placeholder timetables ---------- */
const TT_MIGRATION_KEY = 'timetables_migrated_v2';
if (localStorage.getItem(TT_MIGRATION_KEY) !== 'done') {
  DATA[1].timetable = clone(DEFAULT_TIMETABLE);
  DATA[3].timetable = clone(CO3_TIMETABLE);
  DATA[5].timetable = clone(DEFAULT_TIMETABLE);
  localStorage.setItem(TT_MIGRATION_KEY, 'done');
  saveAll();
}

function saveAll() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: DATA, records: RECORDS })); } catch {}
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  const fresh = clone(DEFAULT_DATA);
  SEMESTERS.forEach(s => { DATA[s] = fresh[s]; });
  RECORDS.length = 0;
  buildSeptRecords();
  saveAll();
}

const studentsOf  = sem => DATA[sem].students;
const timetableOf = sem => DATA[sem].timetable;

/* ---------- Expand September matrix into slot-based records ---------- */
function buildSeptRecords() {
  const WD = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const sem = 5;
  const studs = studentsOf(sem);
  const tt = timetableOf(sem);

  SEP_2026_ROWS.forEach((row, i) => {
    const st = studs[i];
    if (!st) return;
    for (let d = 0; d < 30; d++) {
      const ch = row[d];
      if (ch !== 'P' && ch !== 'A') continue;
      const day = String(d + 1).padStart(2, '0');
      const date = '2026-09-' + day;
      const wd = WD[new Date(date + 'T00:00:00').getDay()];
      const slots = tt[wd] || [];
      slots.forEach(slot => {
        if (slot.type === 'Library') return;
        RECORDS.push({ rollNo: st.rollNo, date, slot: slot.slot, status: ch });
      });
    }
  });
}

if (!persisted) { buildSeptRecords(); saveAll(); }
else { saveAll(); }
