/* ==========================================================
   attendance.js — attendance + timetable logic.
   Month + date-range aware. Every number in the UI comes from here.
   ========================================================== */

const STATUS = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', BUNK: 'Bunk', NODATA: 'No Data' };
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function findStudent(rollNo) {
  if (!rollNo) return null;
  for (const sem of SEMESTERS) {
    const st = studentsOf(sem).find(s => s.rollNo === rollNo);
    if (st) return st;
  }
  return null;
}

/* ---------- Date / month helpers ---------- */
const weekdayOf   = d => WEEKDAYS[new Date(d + 'T00:00:00').getDay()];
const todayISO    = () => new Date().toISOString().slice(0, 10);
const currentYM   = () => todayISO().slice(0, 7);
const monthKeyOf  = d => (d || '').slice(0, 7);
const monthLabel  = ym => {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

const getDates       = () => [...new Set(RECORDS.map(r => r.date))].sort();
const getMonths      = () => [...new Set(RECORDS.map(r => monthKeyOf(r.date)))].sort().reverse();
const recordsInMonth = ym => RECORDS.filter(r => monthKeyOf(r.date) === ym);
const datesInMonth   = ym => [...new Set(recordsInMonth(ym).map(r => r.date))].sort();

/* ---------- Date-range helpers ---------- */
const recordsInDates = dates => {
  const set = new Set(dates);
  return RECORDS.filter(r => set.has(r.date));
};

function weekDatesOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return [];
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  const week = [];
  for (let i = 0; i < 6; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    week.push(x.toISOString().slice(0, 10));
  }
  const set = new Set(week);
  return [...new Set(RECORDS.map(r => r.date))].filter(x => set.has(x)).sort();
}

function datesBetween(startISO, endISO) {
  if (!startISO || !endISO) return [];
  const s = new Date(startISO + 'T00:00:00');
  const e = new Date(endISO   + 'T00:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return [];
  const set = new Set();
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    set.add(d.toISOString().slice(0, 10));
  }
  return [...new Set(RECORDS.map(r => r.date))].filter(x => set.has(x)).sort();
}

/* ---------- Lab batch segregation ---------- */
function rollNumberToNum(rollNo) {
  const m = String(rollNo ?? '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}

function labBatchForRoll(rollNo, batchCount) {
  const n = rollNumberToNum(rollNo);
  if (batchCount >= 3) {
    if (n >= 1  && n <= 23) return 'A';
    if (n >= 24 && n <= 46) return 'B';
    if (n >= 47 && n <= 69) return 'C';
  } else if (batchCount === 2) {
    if (n >= 1  && n <= 35) return 'A';
    if (n >= 36 && n <= 69) return 'B';
  }
  return null;
}

function getLabSubjectForStudent(rollNo, slot) {
  if (!slot) return '';
  if (!slot.batches || typeof slot.batches !== 'object') return slot.subject;
  const keys = Object.keys(slot.batches);
  if (!keys.length) return slot.subject;
  if (keys.length === 1) return slot.batches[keys[0]] || slot.subject;
  const batch = labBatchForRoll(rollNo, keys.length);
  if (batch && slot.batches[batch]) return slot.batches[batch];
  return slot.subject;
}

const slotsForDate = (d, sem) => (timetableOf(sem)[weekdayOf(d)] || []);
const slotStart    = s => s.split('-')[0];

/* ---------- Day classification ---------- */
function classifyDay(recs) {
  const missed = recs.filter(r => r.status === 'A').map(r => r.slot);
  if (!recs.length) return { status: STATUS.NODATA, missed: [] };
  if (recs.every(r => r.status === 'P')) return { status: STATUS.PRESENT, missed };
  if (recs.every(r => r.status === 'A')) return { status: STATUS.ABSENT,  missed };
  const sorted = [...recs].sort((a, b) => slotStart(a.slot).localeCompare(slotStart(b.slot)));
  if (sorted[0].status === 'A') return { status: STATUS.LATE, missed };
  return { status: STATUS.BUNK, missed };
}

/* ---------- Day aggregators ---------- */
const getDailyRows = (date, sem = null) => {
  if (!date) return [];
  const byRoll = {};
  const scopeRolls = sem
    ? new Set(studentsOf(sem).map(s => s.rollNo))
    : new Set(SEMESTERS.flatMap(s => studentsOf(s).map(x => x.rollNo)));
  RECORDS.filter(r => r.date === date && scopeRolls.has(r.rollNo)).forEach(r => {
    (byRoll[r.rollNo] = byRoll[r.rollNo] || []).push(r);
  });
  return Object.entries(byRoll).map(([rollNo, recs]) => {
    const st = findStudent(rollNo) || { rollNo, name: rollNo, semester: null };
    return { rollNo, name: st.name, semester: st.semester, records: recs, ...classifyDay(recs) };
  });
};

const getStudentHistory = roll => {
  const byDate = {};
  RECORDS.filter(r => r.rollNo === roll).forEach(r => {
    (byDate[r.date] = byDate[r.date] || []).push(r);
  });
  return Object.entries(byDate).map(([date, recs]) => ({
    date, records: recs, ...classifyDay(recs)
  })).sort((a, b) => a.date.localeCompare(b.date));
};

/* ---------- Statistics ---------- */
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function countByStatus(rows) {
  const c = { Present: 0, Absent: 0, Late: 0, Bunk: 0, 'No Data': 0 };
  rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
  return c;
}

const overallRate = rows => {
  let held = 0, attended = 0;
  rows.forEach(r => r.records.forEach(rec => {
    held++;
    if (rec.status === 'P') attended++;
  }));
  return percent(attended, held);
};

const slotPresentRate = (rows, slot) => {
  const total = rows.length;
  const present = rows.filter(r => {
    const rec = r.records.find(x => x.slot === slot);
    return rec && rec.status === 'P';
  }).length;
  return { present, total, pct: percent(present, total) };
};

/* ---------- Per-student stats (dates-driven) ---------- */
function studentStats(roll, ym = null) {
  if (ym) return studentStatsForDates(roll, datesInMonth(ym));
  return studentStatsForDates(roll, null);   // all time
}

function studentStatsForDates(roll, dates) {
  const dateSet = dates ? new Set(dates) : null;
  const st = findStudent(roll);
  const tt = st ? timetableOf(st.semester) : DEFAULT_TIMETABLE;
  const allRecs = RECORDS.filter(r => r.rollNo === roll);
  const recs = dateSet ? allRecs.filter(r => dateSet.has(r.date)) : allRecs;

  const held = recs.length;
  const att  = recs.filter(r => r.status === 'P').length;
  const late = recs.filter(r => r.status === 'L').length;
  const bunk = recs.filter(r => r.status === 'B').length;
  const abs  = recs.filter(r => r.status === 'A').length;

  const bySubj = {};
  recs.forEach(r => {
    const slot = (tt[weekdayOf(r.date)] || []).find(s => s.slot === r.slot);
    if (!slot) return;
    const subj = getLabSubjectForStudent(roll, slot);
    bySubj[subj] = bySubj[subj] || { total: 0, present: 0 };
    bySubj[subj].total++;
    if (r.status === 'P') bySubj[subj].present++;
  });
  const subjects = Object.entries(bySubj).map(([subject, d]) => ({
    subject, ...d, pct: percent(d.present, d.total)
  })).sort((a, b) => a.subject.localeCompare(b.subject));

  const monthsMap = {};
  allRecs.forEach(r => {
    const k = monthKeyOf(r.date);
    monthsMap[k] = monthsMap[k] || { total: 0, present: 0 };
    monthsMap[k].total++;
    if (r.status === 'P') monthsMap[k].present++;
  });
  const months = Object.entries(monthsMap).map(([ym, d]) => ({
    ym, ...d, pct: percent(d.present, d.total)
  })).sort((a, b) => b.ym.localeCompare(a.ym));

  return { held, att, late, bunk, abs, pct: percent(att, held), subjects, months };
}

/* ---------- Semester-wide stats ---------- */
function monthlySemStats(sem, ym) {
  return semStatsForDates(sem, datesInMonth(ym));
}

function semStatsForDates(sem, dates) {
  const dateSet = new Set(dates);
  const scopeRolls = new Set(studentsOf(sem).map(s => s.rollNo));
  const recs = RECORDS.filter(r => dateSet.has(r.date) && scopeRolls.has(r.rollNo));
  const held = recs.length;
  const att  = recs.filter(r => r.status === 'P').length;
  return { held, att, pct: percent(att, held) };
}

function subjectStatsForSem(sem, ym) {
  return subjectStatsForSemDates(sem, datesInMonth(ym));
}

function subjectStatsForSemDates(sem, dates) {
  const tt = timetableOf(sem);
  const dateSet = new Set(dates);
  const scopeRolls = new Set(studentsOf(sem).map(s => s.rollNo));
  const recs = RECORDS.filter(r => dateSet.has(r.date) && scopeRolls.has(r.rollNo));
  const bySubj = {};
  recs.forEach(r => {
    const slot = (tt[weekdayOf(r.date)] || []).find(s => s.slot === r.slot);
    if (!slot) return;
    const subj = getLabSubjectForStudent(r.rollNo, slot);
    bySubj[subj] = bySubj[subj] || { total: 0, present: 0 };
    bySubj[subj].total++;
    if (r.status === 'P') bySubj[subj].present++;
  });
  return Object.entries(bySubj).map(([subject, d]) => ({
    subject, ...d, pct: percent(d.present, d.total)
  })).sort((a, b) => a.subject.localeCompare(b.subject));
}

/* ---------- Defaulters ---------- */
function defaulterList(sem, ym, threshold = ATTENDANCE_THRESHOLD) {
  return defaulterListForDates(sem, datesInMonth(ym), threshold);
}

function defaulterListForDates(sem, dates, threshold = ATTENDANCE_THRESHOLD) {
  return studentsOf(sem).map(st => {
    const s = studentStatsForDates(st.rollNo, dates);
    return { ...st, ...s };
  }).filter(x => x.held > 0 && x.pct < threshold)
    .sort((a, b) => a.pct - b.pct);
}
