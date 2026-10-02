/* ==========================================================
   attendance.js — attendance + timetable logic.
   Month-aware. Every number in the UI comes from here.
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

function monthlySemStats(sem, ym) {
  const scopeRolls = new Set(studentsOf(sem).map(s => s.rollNo));
  const recs = recordsInMonth(ym).filter(r => scopeRolls.has(r.rollNo));
  const held = recs.length;
  const att  = recs.filter(r => r.status === 'P').length;
  return { held, att, pct: percent(att, held) };
}

function studentStats(roll, ym = null) {
  const st = findStudent(roll);
  const tt = st ? timetableOf(st.semester) : DEFAULT_TIMETABLE;
  const allRecs = RECORDS.filter(r => r.rollNo === roll);
  const recs = ym ? allRecs.filter(r => monthKeyOf(r.date) === ym) : allRecs;

  const held = recs.length;
  const att  = recs.filter(r => r.status === 'P').length;
  const late = recs.filter(r => r.status === 'L').length;
  const bunk = recs.filter(r => r.status === 'B').length;
  const abs  = recs.filter(r => r.status === 'A').length;

  const bySubj = {};
  recs.forEach(r => {
    const slot = (tt[weekdayOf(r.date)] || []).find(s => s.slot === r.slot);
    if (!slot) return;
    const subj = slot.subject;
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

function subjectStatsForSem(sem, ym) {
  const tt = timetableOf(sem);
  const scopeRolls = new Set(studentsOf(sem).map(s => s.rollNo));
  const recs = recordsInMonth(ym).filter(r => scopeRolls.has(r.rollNo));
  const bySubj = {};
  recs.forEach(r => {
    const slot = (tt[weekdayOf(r.date)] || []).find(s => s.slot === r.slot);
    if (!slot) return;
    const subj = slot.subject;
    bySubj[subj] = bySubj[subj] || { total: 0, present: 0 };
    bySubj[subj].total++;
    if (r.status === 'P') bySubj[subj].present++;
  });
  return Object.entries(bySubj).map(([subject, d]) => ({
    subject, ...d, pct: percent(d.present, d.total)
  })).sort((a, b) => a.subject.localeCompare(b.subject));
}

function defaulterList(sem, ym, threshold = ATTENDANCE_THRESHOLD) {
  return studentsOf(sem).map(st => {
    const s = studentStats(st.rollNo, ym);
    return { ...st, ...s };
  }).filter(x => x.held > 0 && x.pct < threshold)
    .sort((a, b) => a.pct - b.pct);
}
