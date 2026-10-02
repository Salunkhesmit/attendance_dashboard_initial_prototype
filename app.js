/* ==========================================================
   app.js — pages, filters, charts, marking, management.
   Plain JavaScript, no framework.
   ========================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate  = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const toMin    = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

const DATES = getDates();
const state = {
  tab: 'dashboard',
  date: DATES.length ? DATES[DATES.length - 1] : todayISO(),
  month: currentYM(),
  semester: 'all',
  status: 'all',
  search: '',
  roll: null,
  analysisView: 'semesters',
  analysisSem: null,
  analysisMonth: currentYM(),
  analysisSearch: '',
  theme: localStorage.getItem('theme') || 'light',
  manageSem: 5, manageTab: 'students', manageDay: 'Monday',
  markSem: 5, markDate: todayISO()
};
let charts = [];

const NAV = [
  ['dashboard', 'grid-1x2-fill', 'Dashboard'],
  ['mark',      'pencil-square', 'Mark Attendance'],
  ['daily',     'calendar-check-fill', 'Daily Attendance'],
  ['timetable', 'calendar3-week-fill', 'Timetable'],
  ['analysis',  'person-badge-fill', 'Student Analysis'],
  ['reports',   'file-earmark-bar-graph-fill', 'Reports'],
  ['import',    'cloud-arrow-up-fill', 'Data Import']
];

const navHTML = () => {
  const groups = [
    { label: 'Overview',  items: NAV.slice(0, 3) },
    { label: 'Academics', items: NAV.slice(3, 5) },
    { label: 'Data',      items: NAV.slice(5) }
  ];
  return groups.map(g => `
    <div class="nav-section-label">${g.label}</div>
    ${g.items.map(([id, icon, label]) =>
      `<a href="#${id}" class="sidebar-link ${state.tab === id ? 'active' : ''}"><i class="bi bi-${icon}"></i><span>${label}</span></a>`
    ).join('')}
  `).join('');
};

const optionsHTML = (items, selected) => items.map(([v, l]) =>
  `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(l)}</option>`).join('');
const dateOptions  = () => optionsHTML(DATES.map(d => [d, fmtDate(d)]), state.date);
const semOptions   = () => optionsHTML([['all', 'All Semesters'], ...SEMESTERS.map(s => [s, SEM_META[s].code])], state.semester);
const statusOptions = () => optionsHTML(
  [['all','All Statuses'], ['Present','Present'], ['Absent','Absent'], ['Late','Late'], ['Bunk','Bunk / Missed']],
  state.status
);
const monthOptions = () => {
  const months = getMonths();
  if (!months.includes(state.month)) months.unshift(state.month);
  return optionsHTML(months.map(m => [m, monthLabel(m)]), state.month);
};

const refSemester = () => state.semester === 'all' ? 5 : +state.semester;

const STATUS_UI = {
  Present: ['present', 'check2-circle', 'Present'],
  Absent:  ['absent',  'x-circle',      'Absent'],
  Late:    ['late',    'clock-history', 'Late'],
  Bunk:    ['bunk',    'exclamation-octagon', 'Bunk / Missed'],
  'No Data': ['secondary', 'dash-circle', 'No Data']
};
const statusBadge = s => {
  const [cls, icon, label] = STATUS_UI[s] || STATUS_UI['No Data'];
  return `<span class="badge badge-${cls} px-2 py-1"><i class="bi bi-${icon} me-1"></i>${label}</span>`;
};
const slotPill = v => {
  const map = { P: ['present','check-circle-fill','P'], A: ['absent','x-circle-fill','A'],
                L: ['late','clock-history','L'],       B: ['bunk','exclamation-octagon','B'] };
  const [cls, icon, label] = map[v] || ['secondary','dash-circle', v || '—'];
  return `<span class="badge badge-${cls} px-2"><i class="bi bi-${icon}"></i> ${label}</span>`;
};

const banner = () => IS_PLACEHOLDER_DATA
  ? `<div class="alert alert-warning small py-2 no-print"><i class="bi bi-exclamation-triangle-fill me-1"></i> Placeholder data loaded. Use <strong>Manage</strong> on the dashboard to edit.</div>`
  : '';
const emptyBox = msg => `<div class="text-center py-5 text-muted"><i class="bi bi-search fs-2 d-block mb-2 text-secondary"></i>${msg}</div>`;

function statCard(label, value, tone, icon, sub, opts = {}) {
  const progressHtml = (opts.progress !== undefined)
    ? `<div class="threshold mt-3">
         <div class="threshold-fill" style="width:${Math.max(0, Math.min(opts.progress, 100))}%"></div>
         <div class="threshold-marker" style="left:${ATTENDANCE_THRESHOLD}%"></div>
       </div>`
    : '';
  return `<div class="col-12 col-sm-6 col-xl-2 anim-in"><div class="stat-card h-100">
    <div class="d-flex align-items-start justify-content-between gap-2">
      <div class="flex-grow-1 min-w-0">
        <span class="stat-label">${label}</span>
        <div class="stat-value fw-bold text-${tone} mt-1">${value}</div>
      </div>
      <div class="stat-icon bg-${tone}-subtle text-${tone}"><i class="bi bi-${icon}"></i></div>
    </div>
    <div class="mt-2 small text-muted">${sub}</div>
    ${progressHtml}
  </div></div>`;
}

function chartColors() {
  const dark = state.theme === 'dark';
  return { text: dark ? '#94a3b8' : '#64748b', grid: dark ? '#1e293b' : '#f1f5f9' };
}

/* ==========================================================
   DASHBOARD
   ========================================================== */
function slotAttendanceSlidesHTML() {
  return SEMESTERS.map(sem => {
    const slots = slotsForDate(state.date, sem);
    const rows  = getDailyRows(state.date, sem);
    return `<div class="carousel-item">
      <h6 class="fw-bold mb-3"><i class="bi bi-clock-history text-primary me-2"></i>Slot Attendance — ${SEM_META[sem].code} — ${state.date ? fmtShort(state.date) : ''}</h6>
      <div class="d-flex flex-column gap-3">
        ${slots.length ? slots.map(s => {
          const r = slotPresentRate(rows, s.slot);
          return `<div class="p-3 rounded border">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="fw-semibold">${esc(s.subject)} <span class="text-muted small">· ${s.slot}</span></span>
              <span class="badge bg-primary">${r.pct}%</span>
            </div>
            <div class="progress my-2" style="height:6px"><div class="progress-bar" style="width:${r.pct}%"></div></div>
            <div class="text-muted small">${r.present} of ${r.total} present • ${r.total - r.present} absent</div>
          </div>`;
        }).join('') : `<p class="text-muted small mb-0">Holiday / no scheduled slots.</p>`}
      </div>
    </div>`;
  }).join('');
}

function renderDashboard() {
  const ym = state.month;
  const dateForDaily = state.date && monthKeyOf(state.date) === ym ? state.date : (datesInMonth(ym).slice(-1)[0] || state.date);

  const scopedRows = () => {
    const rolls = state.semester === 'all'
      ? new Set(SEMESTERS.flatMap(s => studentsOf(s).map(x => x.rollNo)))
      : new Set(studentsOf(+state.semester).map(s => s.rollNo));
    const byRoll = {};
    recordsInMonth(ym).filter(r => rolls.has(r.rollNo)).forEach(r => {
      (byRoll[r.rollNo] = byRoll[r.rollNo] || []).push(r);
    });
    return Object.entries(byRoll).map(([rollNo, recs]) => {
      const st = findStudent(rollNo) || { rollNo, name: rollNo, semester: null };
      return { rollNo, name: st.name, semester: st.semester, records: recs, ...classifyDay(recs) };
    });
  };
  const rows = scopedRows();
  const c = countByStatus(rows);
  const scope = state.semester === 'all' ? 'All semesters' : SEM_META[state.semester].code;
  const refSem = refSemester();
  const rate = overallRate(rows);
  const lastUpdated = DATES.length ? DATES[DATES.length - 1] : todayISO();

  $('#view').innerHTML = `
    <div class="content-card mb-4 anim-in">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <div class="stat-label">Academic Year 2026–27 · Computer Engineering</div>
          <h4 class="fw-bold mb-1 mt-2">Attendance Analytics</h4>
          <p class="text-muted small mb-0">
            <i class="bi bi-calendar3 me-1"></i>${monthLabel(ym)} ·
            <strong>${rows.length}</strong> student-day records ·
            <span class="text-success ms-1"><i class="bi bi-check-circle-fill"></i> Last updated ${fmtShort(lastUpdated)}</span>
          </p>
        </div>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <select id="f-month" class="form-select form-select-sm" style="width:auto">${monthOptions()}</select>
          <select id="f-date"  class="form-select form-select-sm" style="width:auto">${optionsHTML(DATES.map(d => [d, fmtDate(d)]), dateForDaily)}</select>
          <select id="f-sem"   class="form-select form-select-sm" style="width:auto">${semOptions()}</select>
          <button id="btn-manage" class="btn btn-primary btn-sm text-nowrap">
            <i class="bi bi-gear-fill me-1"></i>Manage
          </button>
        </div>
      </div>
    </div>
    ${banner()}
    <div class="row g-3 mb-4">
      ${statCard('Total Students', rows.length, 'primary', 'people-fill', scope)}
      ${statCard('Present', c.Present, 'success', 'check-circle-fill', 'Present in all slots')}
      ${statCard('Absent',  c.Absent,  'danger',  'x-circle-fill',    'Absent all day')}
      ${statCard('Late',    c.Late,    'warning', 'clock-history',    'Missed first slot')}
      ${statCard('Bunk',    c.Bunk,    'bunk',    'exclamation-triangle-fill', 'Missed mid-day slot(s)')}
      ${statCard('Attendance Rate', rate + '%', 'info', 'pie-chart-fill', `Threshold ${ATTENDANCE_THRESHOLD}% · ${monthLabel(ym)}`, { progress: rate })}
    </div>
    <div class="row g-4 mb-4">
      <div class="col-12 col-lg-8 anim-in anim-in-d1"><div class="content-card h-100">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold mb-0"><i class="bi bi-graph-up text-primary me-2"></i>Daily Trend — ${monthLabel(ym)}</h6>
          <span class="badge bg-secondary-subtle text-secondary">${datesInMonth(ym).length} day(s)</span>
        </div>
        <div style="height:280px;position:relative"><canvas id="c-trend"></canvas></div>
      </div></div>
      <div class="col-12 col-lg-4 anim-in anim-in-d2"><div class="content-card h-100 d-flex flex-column">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold mb-0"><i class="bi bi-pie-chart text-info me-2"></i>Status Breakdown</h6>
          <span class="badge bg-secondary-subtle text-secondary">${monthLabel(ym)}</span>
        </div>
        <div style="height:220px;position:relative"><canvas id="c-dist"></canvas></div>
        <div class="row g-2 text-center mt-3">
          <div class="col-3"><div class="p-2 rounded" style="background:var(--bg-body)">
            <div class="fw-bold text-success">${c.Present}</div><div class="stat-label" style="font-size:.6rem">Present</div>
          </div></div>
          <div class="col-3"><div class="p-2 rounded" style="background:var(--bg-body)">
            <div class="fw-bold text-danger">${c.Absent}</div><div class="stat-label" style="font-size:.6rem">Absent</div>
          </div></div>
          <div class="col-3"><div class="p-2 rounded" style="background:var(--bg-body)">
            <div class="fw-bold text-warning">${c.Late}</div><div class="stat-label" style="font-size:.6rem">Late</div>
          </div></div>
          <div class="col-3"><div class="p-2 rounded" style="background:var(--bg-body)">
            <div class="fw-bold text-bunk">${c.Bunk}</div><div class="stat-label" style="font-size:.6rem">Bunk</div>
          </div></div>
        </div>
      </div></div>
    </div>
    <div class="row g-4 mb-4">
      <div class="col-12 col-lg-6 anim-in anim-in-d3"><div class="content-card h-100">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold mb-0"><i class="bi bi-bar-chart-line text-success me-2"></i>Semester-wise — ${monthLabel(ym)}</h6>
          <span class="badge bg-secondary-subtle text-secondary">CO1 vs CO3 vs CO5</span>
        </div>
        <div style="height:250px;position:relative"><canvas id="c-sem"></canvas></div>
      </div></div>
      <div class="col-12 col-lg-6 anim-in anim-in-d4"><div class="content-card h-100">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold mb-0"><i class="bi bi-book text-info me-2"></i>Subject-wise — ${SEM_META[refSem].code}</h6>
          <span class="badge bg-secondary-subtle text-secondary">${monthLabel(ym)}</span>
        </div>
        <div style="height:250px;position:relative"><canvas id="c-subject"></canvas></div>
      </div></div>
    </div>
    <div class="row g-4">
      <div class="col-12 col-lg-6 anim-in anim-in-d5"><div class="content-card h-100">
        <div id="slotCarousel" class="carousel slide" data-bs-ride="carousel">
          <div class="carousel-inner">
            ${(() => {
              const html = slotAttendanceSlidesHTML();
              return html.replace('class="carousel-item"', 'class="carousel-item active"');
            })()}
          </div>
          <button class="carousel-control-prev" type="button" data-bs-target="#slotCarousel" data-bs-slide="prev">
            <span class="carousel-control-prev-icon"></span>
          </button>
          <button class="carousel-control-next" type="button" data-bs-target="#slotCarousel" data-bs-slide="next">
            <span class="carousel-control-next-icon"></span>
          </button>
        </div>
      </div></div>
      <div class="col-12 col-lg-6 anim-in anim-in-d5"><div class="content-card h-100">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold mb-0"><i class="bi bi-exclamation-triangle-fill text-danger me-2"></i>Defaulters (below ${ATTENDANCE_THRESHOLD}%) — ${SEM_META[refSem].code}</h6>
          <span class="badge bg-danger-subtle text-danger">${monthLabel(ym)}</span>
        </div>
        ${(() => {
          const list = defaulterList(refSem, ym);
          if (!list.length) return `<p class="text-muted small mb-0">No defaulters in this month. 🎉</p>`;
          return `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
            <thead><tr><th>Roll No.</th><th>Name</th><th class="text-center">%</th><th class="text-end"></th></tr></thead>
            <tbody>${list.map(x => `<tr class="row-danger">
              <td class="fw-semibold text-primary">${esc(x.rollNo)}</td>
              <td>${esc(x.name)}</td>
              <td class="text-center"><span class="badge bg-danger">${x.pct}%</span></td>
              <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-jump-roll="${esc(x.rollNo)}">View</button></td>
            </tr>`).join('')}</tbody>
          </table></div>`;
        })()}
      </div></div>
    </div>`;

  $('#f-month').onchange = e => { state.month = e.target.value; render(); };
  $('#f-date').onchange  = e => { state.date  = e.target.value; render(); };
  $('#f-sem').onchange   = e => { state.semester = e.target.value; render(); };
  $('#btn-manage').onclick = openManageModal;
  $('#view').querySelectorAll('[data-jump-roll]').forEach(b => {
    b.onclick = () => {
      const st = findStudent(b.dataset.jumpRoll);
      state.roll = b.dataset.jumpRoll;
      state.analysisSem = st ? st.semester : null;
      state.analysisView = 'detail';
      location.hash = '#analysis';
    };
  });

  drawDashboardCharts(c, rows, ym, refSem);
}

function drawDashboardCharts(c, rows, ym, refSem) {
  const { text, grid } = chartColors();
  const base = { responsive: true, maintainAspectRatio: false };
  const monthDates = datesInMonth(ym);
  const scopeRolls = state.semester === 'all'
    ? new Set(SEMESTERS.flatMap(s => studentsOf(s).map(x => x.rollNo)))
    : new Set(studentsOf(+state.semester).map(s => s.rollNo));
  const perDate = monthDates.map(d => getDailyRows(d).filter(r => scopeRolls.has(r.rollNo)));

  const tooltipCommon = {
    backgroundColor: state.theme === 'dark' ? '#0b1120' : '#0f172a',
    titleColor: '#f1f5f9', bodyColor: '#e2e8f0',
    padding: 10, cornerRadius: 8, displayColors: false,
    titleFont: { weight: '600', size: 12 }, bodyFont: { size: 12 }
  };

  charts.push(new Chart($('#c-trend'), {
    type: 'line',
    data: {
      labels: monthDates.map(fmtShort),
      datasets: [
        {
          label: 'Attendance %',
          data: perDate.map(overallRate),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.10)',
          fill: true, tension: 0.35,
          pointRadius: 4, pointHoverRadius: 6,
          pointBackgroundColor: '#3b82f6', pointBorderColor: '#fff', pointBorderWidth: 2,
          borderWidth: 2.4
        },
        {
          label: `Threshold (${ATTENDANCE_THRESHOLD}%)`,
          data: monthDates.map(() => ATTENDANCE_THRESHOLD),
          borderColor: '#ef4444', borderDash: [6, 4], borderWidth: 1.6,
          pointRadius: 0, pointHoverRadius: 0, fill: false, tension: 0
        }
      ]
    },
    options: { ...base,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: text, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: 'line' } },
        tooltip: { ...tooltipCommon, callbacks: {
          label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`
        }}
      },
      scales: {
        x: { grid: { color: grid, drawTicks: false }, ticks: { color: text, font: { size: 11 } } },
        y: { min: 0, max: 100, grid: { color: grid, drawTicks: false },
             ticks: { color: text, font: { size: 11 }, callback: v => v + '%' } }
      }
    }
  }));

  charts.push(new Chart($('#c-dist'), {
    type: 'doughnut',
    data: {
      labels: ['Present', 'Absent', 'Late', 'Bunk'],
      datasets: [{ data: [c.Present, c.Absent, c.Late, c.Bunk],
        backgroundColor: ['#22c55e', '#ef4444', '#f59e0b', '#f97316'],
        borderWidth: 0, hoverOffset: 6 }]
    },
    options: { ...base, cutout: '72%',
      plugins: {
        legend: { position: 'bottom', labels: { color: text, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 14 } },
        tooltip: { ...tooltipCommon, callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.parsed}`
        }}
      } }
  }));

  charts.push(new Chart($('#c-sem'), {
    type: 'bar',
    data: {
      labels: SEMESTERS.map(s => SEM_META[s].code),
      datasets: [{
        label: 'Attendance %',
        data: SEMESTERS.map(s => monthlySemStats(s, ym).pct),
        backgroundColor: ['#60a5fa', '#34d399', '#a78bfa'],
        borderRadius: 8, maxBarThickness: 60
      }]
    },
    options: { ...base,
      plugins: { legend: { display: false },
        tooltip: { ...tooltipCommon, callbacks: { label: ctx => ` Attendance: ${ctx.parsed.y}%` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: text, font: { size: 11 } } },
        y: { min: 0, max: 100, grid: { color: grid, drawTicks: false },
             ticks: { color: text, font: { size: 11 }, callback: v => v + '%' } }
      }
    }
  }));

  const subjects = subjectStatsForSem(refSem, ym);
  charts.push(new Chart($('#c-subject'), {
    type: 'bar',
    data: {
      labels: subjects.map(s => s.subject),
      datasets: [{
        label: 'Attendance %',
        data: subjects.map(s => s.pct),
        backgroundColor: '#6366f1', borderRadius: 8, maxBarThickness: 42
      }]
    },
    options: { ...base,
      plugins: { legend: { display: false },
        tooltip: { ...tooltipCommon, callbacks: { label: ctx => ` Attendance: ${ctx.parsed.y}%` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: text, autoSkip: false, maxRotation: 30, font: { size: 11 } } },
        y: { min: 0, max: 100, grid: { color: grid, drawTicks: false },
             ticks: { color: text, font: { size: 11 }, callback: v => v + '%' } }
      }
    }
  }));
}

/* ==========================================================
   MARK ATTENDANCE
   ========================================================== */
function renderMarkAttendance() {
  const sem = state.markSem;
  const date = state.markDate;
  const day = weekdayOf(date);
  const slots = timetableOf(sem)[day] || [];
  const studs = studentsOf(sem).slice().sort((a, b) =>
    a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));

  const savedMap = {};
  const rollSet = new Set(studs.map(s => s.rollNo));
  RECORDS.filter(r => r.date === date && rollSet.has(r.rollNo))
    .forEach(r => { savedMap[r.rollNo + '|' + r.slot] = r.status; });

  const legendHTML = `
    <div class="att-legend">
      <span class="att-legend-item"><span class="att-legend-chip" data-k="P">P</span>Present</span>
      <span class="att-legend-item"><span class="att-legend-chip" data-k="A">A</span>Absent</span>
      <span class="att-legend-item"><span class="att-legend-chip" data-k="L">L</span>Late</span>
      <span class="att-legend-item"><span class="att-legend-chip" data-k="B">B</span>Bunk</span>
    </div>`;

  $('#view').innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-end mb-4 gap-3 anim-in">
      <div>
        <div class="stat-label">Faculty Tool</div>
        <h4 class="fw-bold mb-1 mt-2">Mark Attendance</h4>
        <p class="text-muted small mb-0">Click a cell to cycle P → A → L → B. Use <strong>All P</strong> on a header to fill the column.</p>
      </div>
      ${slots.length ? `<button id="mk-save" class="btn btn-primary btn-sm"><i class="bi bi-save me-1"></i>Save Attendance</button>` : ''}
    </div>
    ${banner()}
    <div class="content-card mb-4 no-print anim-in anim-in-d1">
      <div class="row g-3 align-items-end">
        <div class="col-12 col-md-3"><label class="form-label small fw-semibold text-muted">Semester</label>
          <select id="mk-sem" class="form-select">${optionsHTML(SEMESTERS.map(s => [s, SEM_META[s].label]), sem)}</select></div>
        <div class="col-12 col-md-3"><label class="form-label small fw-semibold text-muted">Date</label>
          <input type="date" id="mk-date" class="form-control" value="${date}"></div>
        <div class="col-12 col-md-6 d-flex align-items-end justify-content-between gap-3 flex-wrap">
          <span class="text-muted small"><i class="bi bi-calendar-week me-1"></i>${day} • ${slots.length} slot(s) • ${studs.length} student(s)</span>
          ${legendHTML}
        </div>
      </div>
    </div>
    ${slots.length ? `
      <div class="content-card anim-in anim-in-d2">
        <div class="d-flex flex-wrap gap-2 mb-3 align-items-center">
          <div id="mk-summary" class="att-summary">
            <div class="att-summary-item"><span class="val text-success" data-stat="P">0</span><span class="lbl">Present</span></div>
            <div class="att-summary-item"><span class="val text-danger"  data-stat="A">0</span><span class="lbl">Absent</span></div>
            <div class="att-summary-item"><span class="val text-warning" data-stat="L">0</span><span class="lbl">Late</span></div>
            <div class="att-summary-item"><span class="val text-bunk"    data-stat="B">0</span><span class="lbl">Bunk</span></div>
          </div>
          <div class="ms-auto d-flex gap-2 flex-wrap">
            <button id="mk-all-p" class="btn btn-sm btn-outline-success"><i class="bi bi-check-all me-1"></i>Mark all Present</button>
            <button id="mk-clear" class="btn btn-sm btn-outline-secondary"><i class="bi bi-eraser me-1"></i>Clear all</button>
            <button id="mk-save2" class="btn btn-sm btn-primary"><i class="bi bi-save me-1"></i>Save</button>
          </div>
        </div>
        <div class="table-responsive sticky-scroll">
          <table class="table table-sm align-middle att-table">
            <thead><tr>
              <th>Roll No.</th><th>Name</th>
              ${slots.map(s => `<th class="text-center small">
                ${esc(s.subject)}<br><span class="text-muted fw-normal">${s.slot}</span>
                <button class="btn btn-outline-success att-col-all mt-1" data-slot="${esc(s.slot)}">All P</button>
              </th>`).join('')}
            </tr></thead>
            <tbody>
              ${studs.map(st => `<tr>
                <td class="fw-semibold text-primary">${esc(st.rollNo)}</td>
                <td class="fw-medium">${esc(st.name)}</td>
                ${slots.map(s => {
                  const v = savedMap[st.rollNo + '|' + s.slot] || 'P';
                  return `<td class="text-center"><button class="att-cell"
                    data-roll="${esc(st.rollNo)}" data-slot="${esc(s.slot)}"
                    data-status="${v}">${v}</button></td>`;
                }).join('')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : `<div class="content-card">${emptyBox('No slots scheduled for this weekday. Check the timetable for ' + SEM_META[sem].code + '.')}</div>`}`;

  function updateMarkSummary() {
    const el = document.getElementById('mk-summary');
    if (!el) return;
    const counts = { P: 0, A: 0, L: 0, B: 0 };
    $('#view').querySelectorAll('.att-cell').forEach(c => {
      const s = c.dataset.status;
      if (counts[s] !== undefined) counts[s]++;
    });
    el.querySelector('[data-stat="P"]').textContent = counts.P;
    el.querySelector('[data-stat="A"]').textContent = counts.A;
    el.querySelector('[data-stat="L"]').textContent = counts.L;
    el.querySelector('[data-stat="B"]').textContent = counts.B;
  }

  $('#mk-sem').onchange  = e => { state.markSem  = +e.target.value; renderMarkAttendance(); };
  $('#mk-date').onchange = e => { state.markDate = e.target.value;  renderMarkAttendance(); };

  $('#view').querySelectorAll('.att-cell').forEach(btn => {
    btn.onclick = () => {
      const cycle = { P: 'A', A: 'L', L: 'B', B: 'P' };
      const next = cycle[btn.dataset.status] || 'P';
      btn.dataset.status = next;
      btn.textContent = next;
      updateMarkSummary();
    };
  });
  $('#view').querySelectorAll('.att-col-all').forEach(b => {
    b.onclick = () => {
      const slot = b.dataset.slot;
      $('#view').querySelectorAll(`.att-cell[data-slot="${CSS.escape(slot)}"]`).forEach(c => {
        c.dataset.status = 'P'; c.textContent = 'P';
      });
      updateMarkSummary();
    };
  });
  const allP = $('#mk-all-p');
  if (allP) allP.onclick = () => {
    $('#view').querySelectorAll('.att-cell').forEach(c => { c.dataset.status = 'P'; c.textContent = 'P'; });
    updateMarkSummary();
  };
  const clear = $('#mk-clear');
  if (clear) clear.onclick = () => {
    if (!confirm('Clear all selections in this page?')) return;
    $('#view').querySelectorAll('.att-cell').forEach(c => { c.dataset.status = ''; c.textContent = '—'; });
    updateMarkSummary();
  };
  const save = () => {
    const rollSet2 = new Set(studs.map(s => s.rollNo));
    for (let i = RECORDS.length - 1; i >= 0; i--) {
      if (RECORDS[i].date === date && rollSet2.has(RECORDS[i].rollNo)) RECORDS.splice(i, 1);
    }
    let count = 0;
    $('#view').querySelectorAll('.att-cell').forEach(c => {
      const status = c.dataset.status;
      if (!status) return;
      RECORDS.push({ rollNo: c.dataset.roll, date, slot: c.dataset.slot, status });
      count++;
    });
    saveAll();
    alert(`Saved ${count} attendance record(s) for ${date}.`);
    state.date = date;
    state.month = monthKeyOf(date);
    render();
  };
  if ($('#mk-save'))  $('#mk-save').onclick  = save;
  if ($('#mk-save2')) $('#mk-save2').onclick = save;

  updateMarkSummary();
}

/* ==========================================================
   DAILY ATTENDANCE
   ========================================================== */
function getFilteredDaily() {
  const sem = state.semester === 'all' ? null : +state.semester;
  const q = state.search.trim().toLowerCase();
  return getDailyRows(state.date, sem).filter(r =>
    (state.status === 'all' || r.status === state.status) &&
    (!q || r.name.toLowerCase().includes(q) || r.rollNo.toLowerCase().includes(q)));
}

function renderDaily() {
  const refSem = refSemester();
  const daySlots = slotsForDate(state.date, refSem);
  const allRows = getDailyRows(state.date, state.semester === 'all' ? null : +state.semester);
  const sc = countByStatus(allRows);

  $('#view').innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3 anim-in">
      <div>
        <div class="stat-label">Monitoring</div>
        <h4 class="fw-bold mb-1 mt-2">Daily Attendance</h4>
        <p class="text-muted small mb-0">${weekdayOf(state.date)} • ${daySlots.length} slot(s) — ${SEM_META[refSem].code}</p>
      </div>
      <div class="d-flex gap-2 no-print">
        <button id="btn-csv" class="btn btn-outline-secondary btn-sm"><i class="bi bi-filetype-csv me-1"></i>Export CSV</button>
        <button id="btn-print" class="btn btn-outline-secondary btn-sm"><i class="bi bi-printer me-1"></i>Print</button>
      </div>
    </div>
    ${banner()}
    <div class="content-card mb-4 no-print anim-in anim-in-d1">
      <div class="row g-3">
        <div class="col-12 col-md-3"><label class="form-label small fw-semibold text-muted">Date</label>
          <select id="f-date" class="form-select">${dateOptions()}</select></div>
        <div class="col-12 col-md-3"><label class="form-label small fw-semibold text-muted">Semester</label>
          <select id="f-sem" class="form-select">${semOptions()}</select></div>
        <div class="col-12 col-md-3"><label class="form-label small fw-semibold text-muted">Status</label>
          <select id="f-status" class="form-select">${statusOptions()}</select></div>
        <div class="col-12 col-md-3"><label class="form-label small fw-semibold text-muted">Search</label>
          <div class="input-group"><span class="input-group-text"><i class="bi bi-search"></i></span>
          <input id="f-search" type="text" class="form-control" placeholder="Roll No or Name..." value="${esc(state.search)}"></div></div>
      </div>
      <div class="daily-summary mt-3 pt-3" style="border-top:1px solid var(--border-color)">
        <div class="ds-item"><span class="ds-val text-success">${sc.Present}</span><span class="ds-lbl">Present</span></div>
        <div class="ds-item"><span class="ds-val text-danger">${sc.Absent}</span><span class="ds-lbl">Absent</span></div>
        <div class="ds-item"><span class="ds-val text-warning">${sc.Late}</span><span class="ds-lbl">Late</span></div>
        <div class="ds-item"><span class="ds-val text-bunk">${sc.Bunk}</span><span class="ds-lbl">Bunk</span></div>
        <div class="ds-item ms-auto"><span class="ds-val text-primary">${allRows.length}</span><span class="ds-lbl">Total</span></div>
      </div>
    </div>
    <div class="content-card anim-in anim-in-d2">
      <div class="mb-3"><span class="text-muted small" id="daily-count"></span></div>
      <div class="table-responsive sticky-scroll">
        <table class="table table-hover align-middle">
          <thead><tr>
            <th>Roll No.</th><th>Name</th><th>Sem</th>
            ${daySlots.map(s => `<th class="text-center small">${esc(s.subject)}<br><span class="text-muted fw-normal">${s.slot}</span></th>`).join('')}
            <th>Status</th><th>Missed</th><th class="text-end no-print">Actions</th>
          </tr></thead>
          <tbody id="daily-body"></tbody>
        </table>
      </div>
    </div>`;

  $('#f-date').onchange   = e => { state.date = e.target.value; renderDaily(); };
  $('#f-sem').onchange    = e => { state.semester = e.target.value; renderDaily(); };
  $('#f-status').onchange = e => { state.status = e.target.value; updateDaily(); };
  $('#f-search').oninput  = e => { state.search = e.target.value; updateDaily(); };
  $('#btn-print').onclick = () => window.print();
  $('#btn-csv').onclick   = () => exportDailyCSV(getFilteredDaily(), daySlots);
  $('#daily-body').onclick = e => {
    const btn = e.target.closest('[data-roll]');
    if (!btn) return;
    const st = findStudent(btn.dataset.roll);
    state.roll = btn.dataset.roll;
    state.analysisSem = st ? st.semester : null;
    state.analysisView = 'detail';
    location.hash = '#analysis';
  };
  updateDaily();
}

function updateDaily() {
  const refSem = refSemester();
  const daySlots = slotsForDate(state.date, refSem);
  const rows = getFilteredDaily();
  const allRows = getDailyRows(state.date, state.semester === 'all' ? null : +state.semester);
  $('#daily-count').innerHTML = `Showing <strong>${rows.length}</strong> of ${allRows.length} students`;

  if (!rows.length) {
    $('#daily-body').innerHTML = `<tr><td colspan="${5 + daySlots.length}">${emptyBox('No student records match the filters.')}</td></tr>`;
    return;
  }
  $('#daily-body').innerHTML = rows.map(r => {
    const missedNames = r.missed.map(sl => {
      const s = daySlots.find(x => x.slot === sl);
      return s ? s.subject : sl;
    });
    const isIssue = r.status === 'Absent' || r.status === 'Bunk' || r.status === 'Late';
    return `<tr class="${isIssue ? 'row-danger' : ''}">
      <td><span class="fw-semibold text-primary">${esc(r.rollNo)}</span></td>
      <td class="fw-medium">${esc(r.name)}</td>
      <td><span class="badge bg-secondary-subtle text-secondary-emphasis border">S${r.semester}</span></td>
      ${daySlots.map(s => {
        const rec = r.records.find(x => x.slot === s.slot);
        return `<td class="text-center">${rec ? slotPill(rec.status) : '<span class="text-muted">—</span>'}</td>`;
      }).join('')}
      <td>${statusBadge(r.status)}</td>
      <td class="text-muted small">${missedNames.length ? esc(missedNames.join(', ')) : '—'}</td>
      <td class="text-end no-print"><button class="btn btn-sm btn-outline-primary" data-roll="${esc(r.rollNo)}"><i class="bi bi-person-lines-fill me-1"></i> Analysis</button></td>
    </tr>`;
  }).join('');
}

function exportDailyCSV(rows, daySlots) {
  const head = ['Roll No','Name','Semester','Date',
                ...daySlots.map(s => `${s.subject} (${s.slot})`), 'Status','Missed Slots'];
  const body = rows.map(r => {
    const cells = daySlots.map(s => {
      const rec = r.records.find(x => x.slot === s.slot);
      return rec ? rec.status : '';
    });
    return [r.rollNo, r.name, r.semester, state.date, ...cells, r.status, r.missed.join(' / ')];
  });
  downloadCSV([head, ...body], `attendance_${state.date}.csv`);
}

/* ==========================================================
   TIMETABLE — weekly, per-semester
   ========================================================== */
const TT_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const TT_TIME_LABELS = ['09:15–10:15','10:15–11:15','11:30–12:30','12:30–13:30','14:00–15:00','15:00–16:00'];
const TT_START_ROW = { '09:15': 0, '10:15': 1, '11:30': 2, '12:30': 3, '14:00': 4, '15:00': 5 };

function renderTimetable() {
  const sem = refSemester();
  const tt  = timetableOf(sem);
  const occ = {};
  TT_DAYS.forEach(d => {
    occ[d] = {};
    (tt[d] || []).forEach(e => {
      const [start, end] = e.slot.split('-');
      const span = (toMin(end) - toMin(start)) >= 90 ? 2 : 1;
      const row = TT_START_ROW[start];
      if (row === undefined) return;
      occ[d][row] = { entry: e, span };
      for (let k = 1; k < span; k++) occ[d][row + k] = '_';
    });
  });

  const formatSubject = s => String(s).replace(/\s*\/\s*/g, ' · ');
  const batchesHtml = e => {
    if (!e.batches) return '';
    const parts = Object.entries(e.batches).map(([b, s]) =>
      `<span class="tt-batch"><b>${esc(b)}:</b>${esc(s)}</span>`);
    return `<div class="tt-batches">${parts.join('')}</div>`;
  };

  const head = `<tr><th style="width:130px">Time</th>${TT_DAYS.map(d => `<th class="text-center">${d}</th>`).join('')}</tr>`;
  let body = '';
  const rowHTML = row => {
    let out = '<tr>';
    out += `<td class="tt-time">${TT_TIME_LABELS[row]}</td>`;
    TT_DAYS.forEach(d => {
      const c = occ[d][row];
      if (c === '_') return;
      if (!c) { out += `<td class="tt-cell tt-empty" data-day="${d}" data-row="${row}"></td>`; return; }
      const e = c.entry;
      const cls = e.type === 'Lab' ? 'tt-lab'
                : e.type === 'Library' ? 'tt-library'
                : 'tt-theory';
      out += `<td class="tt-cell ${cls}" rowspan="${c.span}" data-day="${d}" data-row="${row}">
        <div class="tt-subject">${esc(formatSubject(e.subject))}</div>
        <div class="tt-meta">${esc(e.type)}${e.type === 'Lab' ? ' · 2 hrs' : e.type === 'Theory' ? ' · 1 hr' : ''}</div>
        ${batchesHtml(e)}
      </td>`;
    });
    out += '</tr>';
    return out;
  };

  body += rowHTML(0) + rowHTML(1);
  body += `<tr class="tt-break"><td class="tt-time">11:15–11:30</td><td colspan="${TT_DAYS.length}" class="text-center small text-muted">Short Break</td></tr>`;
  body += rowHTML(2) + rowHTML(3);
  body += `<tr class="tt-break"><td class="tt-time">13:30–14:00</td><td colspan="${TT_DAYS.length}" class="text-center small text-muted">Lunch Break</td></tr>`;
  body += rowHTML(4) + rowHTML(5);

  $('#view').innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-end mb-4 gap-3 anim-in">
      <div>
        <div class="stat-label">Weekly Schedule</div>
        <h4 class="fw-bold mb-1 mt-2">${SEM_META[sem].label} — Timetable</h4>
        <p class="text-muted small mb-0">Click a cell to change the subject. Use <strong>Manage</strong> for full control.</p>
      </div>
      <div class="d-flex gap-3 align-items-center flex-wrap">
        <div class="tt-legend">
          <span class="tt-legend-item"><span class="tt-dot tt-dot-theory"></span>Theory</span>
          <span class="tt-legend-item"><span class="tt-dot tt-dot-lab"></span>Lab</span>
          <span class="tt-legend-item"><span class="tt-dot tt-dot-library"></span>Library</span>
        </div>
        <select id="f-sem" class="form-select form-select-sm" style="width:auto">${optionsHTML(SEMESTERS.map(s => [s, SEM_META[s].code]), sem)}</select>
        <button id="btn-manage" class="btn btn-primary btn-sm text-nowrap"><i class="bi bi-gear-fill me-1"></i>Manage</button>
      </div>
    </div>
    ${banner()}
    <div class="content-card anim-in anim-in-d1">
      <div class="table-responsive tt-container" id="tt-container">
        <table class="table table-bordered align-middle mb-0 tt-table">
          <thead>${head}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <p class="text-muted small mt-3 mb-0">
        <i class="bi bi-info-circle me-1"></i>
        Labs occupy 2-hour windows: 9:15–11:15, 11:30–1:30, 2:00–4:00. Breaks and Library Hour are not attendance units.
      </p>
    </div>`;

  $('#f-sem').onchange = e => { state.semester = e.target.value; renderTimetable(); };
  $('#btn-manage').onclick = openManageModal;

  $('#tt-container').onclick = e => {
    const td = e.target.closest('.tt-cell');
    if (!td) return;
    const day = td.dataset.day, row = +td.dataset.row;
    const tt2 = timetableOf(refSemester());
    const dayList = tt2[day] || (tt2[day] = []);
    const startLabel = TT_TIME_LABELS[row].replace('–', '-').split('-')[0];
    const found = dayList.find(x => x.slot.split('-')[0] === startLabel);
    const cur = found ? found.subject : '';
    const newSubj = prompt(`Subject for ${day} ${TT_TIME_LABELS[row]}${found ? '' : ' (empty = clear)'}:`, cur);
    if (newSubj === null) return;
    if (newSubj.trim() === '') { if (found) dayList.splice(dayList.indexOf(found), 1); }
    else if (found) { found.subject = newSubj.trim(); }
    else { dayList.push({ slot: TT_TIME_LABELS[row].replace('–', '-'), subject: newSubj.trim(), type: 'Theory' }); }
    saveAll();
    renderTimetable();
  };
}

/* ==========================================================
   STUDENT ANALYSIS
   ========================================================== */
function renderAnalysis() {
  if (state.analysisView === 'detail' && state.roll) return renderStudentDetail();
  if (state.analysisView === 'students' && state.analysisSem) return renderStudentList();
  return renderSemesterPicker();
}

function renderSemesterPicker() {
  $('#view').innerHTML = `
    <div class="mb-4 anim-in">
      <div class="stat-label">Analytics</div>
      <h4 class="fw-bold mb-1 mt-2">Student Analysis</h4>
      <p class="text-muted small mb-0">Pick a semester to view its students and attendance health.</p>
    </div>
    ${banner()}
    <div class="row g-4">
      ${SEMESTERS.map((sem, idx) => {
        const students = studentsOf(sem);
        const stats = students.map(st => studentStats(st.rollNo));
        const withData = stats.filter(s => s.held > 0);
        const avg = withData.length ? Math.round(withData.reduce((a, s) => a + s.pct, 0) / withData.length) : 0;
        const below = withData.filter(s => s.pct < ATTENDANCE_THRESHOLD).length;
        const avgTone = avg >= ATTENDANCE_THRESHOLD ? 'success' : 'danger';
        return `<div class="col-12 col-md-6 col-lg-4 anim-in anim-in-d${idx + 1}">
          <div class="content-card sem-card h-100" data-sem="${sem}">
            <div class="d-flex align-items-center justify-content-between mb-3">
              <div>
                <h5 class="fw-bold mb-1">${SEM_META[sem].label}</h5>
                <p class="text-muted small mb-0">${students.length} student(s)</p>
              </div>
              <div class="stat-icon bg-primary-subtle text-primary"><i class="bi bi-mortarboard-fill"></i></div>
            </div>
            <div class="row g-3 pt-3" style="border-top:1px solid var(--border-color)">
              <div class="col-6">
                <div class="sem-metric">
                  <span class="m-val text-${avgTone}">${avg}%</span>
                  <span class="m-lbl">Avg Attendance</span>
                </div>
              </div>
              <div class="col-6">
                <div class="sem-metric">
                  <span class="m-val ${below ? 'text-danger' : 'text-success'}">${below}</span>
                  <span class="m-lbl">Below ${ATTENDANCE_THRESHOLD}%</span>
                </div>
              </div>
            </div>
            <div class="mini-progress mt-3">
              <div class="mini-progress-fill ${avg >= ATTENDANCE_THRESHOLD ? 'mp-fill-success' : 'mp-fill-danger'}" style="width:${avg}%"></div>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  $('#view').querySelectorAll('.sem-card').forEach(el => {
    el.onclick = () => { state.analysisSem = +el.dataset.sem; state.analysisView = 'students'; renderAnalysis(); };
  });
}

function renderStudentList() {
  const sem = state.analysisSem;
  const ym = state.analysisMonth;
  if (state.analysisSearch === undefined) state.analysisSearch = '';
  const q = state.analysisSearch.trim().toLowerCase();

  const students = studentsOf(sem).slice()
    .sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }))
    .filter(st => !q || st.name.toLowerCase().includes(q) || st.rollNo.toLowerCase().includes(q));

  $('#view').innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3 anim-in">
      <div>
        <div class="stat-label">${SEM_META[sem].code} Students</div>
        <h4 class="fw-bold mb-1 mt-2">${SEM_META[sem].label} — Students</h4>
        <p class="text-muted small mb-0">${students.length} student(s) • month view: ${monthLabel(ym)}</p>
      </div>
      <div class="d-flex gap-2 align-items-center flex-wrap">
        <div class="input-group input-group-sm" style="width:220px">
          <span class="input-group-text"><i class="bi bi-search"></i></span>
          <input id="fa-search" type="text" class="form-control" placeholder="Search name or roll..." value="${esc(state.analysisSearch)}">
        </div>
        <select id="fa-month" class="form-select form-select-sm" style="width:auto">${monthOptions()}</select>
        <button id="back-btn" class="btn btn-outline-secondary btn-sm"><i class="bi bi-arrow-left me-1"></i> Back</button>
      </div>
    </div>
    ${banner()}
    <div class="content-card anim-in anim-in-d1">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead><tr><th>Roll No.</th><th>Name</th><th>Batch</th><th style="min-width:150px">Month %</th><th style="min-width:150px">Overall %</th><th class="text-end">Action</th></tr></thead>
          <tbody>
            ${students.length ? students.map(st => {
              const sAll = studentStats(st.rollNo);
              const sMo  = studentStats(st.rollNo, ym);
              const okAll = sAll.pct >= ATTENDANCE_THRESHOLD;
              const okMo  = sMo.pct  >= ATTENDANCE_THRESHOLD;
              const toneAll = okAll ? 'success' : 'danger';
              const toneMo  = okMo  ? 'success' : 'danger';
              return `<tr>
                <td class="fw-semibold text-primary">${esc(st.rollNo)}</td>
                <td class="fw-medium">${esc(st.name)}</td>
                <td class="text-muted small">${esc(st.batch || '—')}</td>
                <td>
                  <div class="d-flex align-items-center gap-2">
                    <div class="mini-progress flex-grow-1">
                      <div class="mini-progress-fill ${okMo ? 'mp-fill-success' : 'mp-fill-danger'}" style="width:${sMo.pct}%"></div>
                    </div>
                    <span class="badge bg-${toneMo}">${sMo.pct}%</span>
                  </div>
                </td>
                <td>
                  <div class="d-flex align-items-center gap-2">
                    <div class="mini-progress flex-grow-1">
                      <div class="mini-progress-fill ${okAll ? 'mp-fill-success' : 'mp-fill-danger'}" style="width:${sAll.pct}%"></div>
                    </div>
                    <span class="badge bg-${toneAll}">${sAll.pct}%</span>
                  </div>
                </td>
                <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-roll="${esc(st.rollNo)}">View</button></td>
              </tr>`;
            }).join('') : `<tr><td colspan="6" class="text-center text-muted py-4">No students match.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  $('#back-btn').onclick = () => { state.analysisView = 'semesters'; state.analysisSem = null; renderAnalysis(); };
  $('#fa-month').onchange = e => { state.analysisMonth = e.target.value; renderStudentList(); };
  $('#fa-search').oninput = e => { state.analysisSearch = e.target.value; renderStudentList(); };
  $('#view').querySelectorAll('[data-roll]').forEach(b => {
    b.onclick = () => { state.roll = b.dataset.roll; state.analysisView = 'detail'; renderAnalysis(); };
  });
}

function renderStudentDetail() {
  const st = findStudent(state.roll);
  if (!st) { $('#view').innerHTML = emptyBox('Student not found.'); return; }

  const ym = state.analysisMonth;
  const sAll = studentStats(st.rollNo);
  const sMo  = studentStats(st.rollNo, ym);
  const hist = getStudentHistory(st.rollNo);
  const ok   = sMo.pct >= ATTENDANCE_THRESHOLD;
  const tone = ok ? 'success' : 'danger';
  const ringColor = ok ? '#22c55e' : '#ef4444';
  const initials = st.name.split(' ').map(n => n[0]).join('').slice(0, 3);

  const monthMissed = hist.filter(h => monthKeyOf(h.date) === ym)
    .flatMap(h => h.records.filter(r => r.status !== 'P').map(r => {
      const slot = (timetableOf(st.semester)[weekdayOf(h.date)] || []).find(s => s.slot === r.slot);
      return { date: h.date, slot: r.slot, subject: slot ? slot.subject : r.slot, status: r.status };
    })).sort((a, b) => a.date.localeCompare(b.date));

  $('#view').innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3 anim-in">
      <div>
        <div class="stat-label">Student Profile</div>
        <h4 class="fw-bold mb-1 mt-2">Student Attendance</h4>
        <p class="text-muted small mb-0">${esc(st.name)} · ${esc(st.rollNo)}</p>
      </div>
      <div class="d-flex gap-2">
        <select id="sd-month" class="form-select form-select-sm" style="width:auto">${monthOptions()}</select>
        <button id="back-btn" class="btn btn-outline-secondary btn-sm"><i class="bi bi-arrow-left me-1"></i> Back</button>
      </div>
    </div>
    ${banner()}
    <div class="row g-4">
      <div class="col-12 col-lg-4 anim-in anim-in-d1"><div class="content-card h-100">
        <div class="text-center pb-3 border-bottom">
          <div class="avatar-lg mb-3">${esc(initials)}</div>
          <h5 class="fw-bold mb-1">${esc(st.name)}</h5>
          <span class="badge bg-primary mb-2">${esc(st.rollNo)}</span>
          <div class="text-muted small">Computer Engineering • ${SEM_META[st.semester].label}</div>
        </div>
        <div class="pt-4 text-center">
          <div class="stat-label mb-3">${monthLabel(ym)}</div>
          <div class="att-ring" style="background: conic-gradient(${ringColor} ${sMo.pct * 3.6}deg, var(--border-color) 0);">
            <div class="d-flex flex-column align-items-center">
              <span class="value text-${tone}">${sMo.pct}%</span>
              <span class="sub">Attendance</span>
            </div>
          </div>
          <div class="mt-3">
            <span class="badge bg-${tone} px-3 py-2">
              <i class="bi bi-${ok ? 'check-circle-fill' : 'exclamation-triangle-fill'} me-1"></i>
              ${ok ? 'On Track' : 'Below Threshold'}
            </span>
          </div>
          <div class="threshold mt-4" style="max-width:220px;margin:0 auto">
            <div class="threshold-fill" style="width:${sMo.pct}%"></div>
            <div class="threshold-marker" style="left:${ATTENDANCE_THRESHOLD}%"></div>
          </div>
        </div>
        <div class="mt-4 pt-3 border-top">
          <div class="stat-label mb-2">Overall</div>
          <div class="d-flex justify-content-between align-items-center p-3 rounded" style="background:var(--bg-body)">
            <span class="fw-semibold small">All time</span>
            <span class="badge bg-${sAll.pct >= ATTENDANCE_THRESHOLD ? 'success' : 'danger'}">${sAll.pct}%</span>
          </div>
        </div>
      </div></div>

      <div class="col-lg-8 col-12 anim-in anim-in-d2">
        <div class="content-card mb-4">
          <h6 class="fw-bold mb-3"><i class="bi bi-speedometer2 text-primary me-2"></i>Summary — ${monthLabel(ym)}</h6>
          <div class="row g-3 text-center">
            <div class="col-6 col-md-3"><div class="p-3 rounded" style="background:var(--bg-body)">
              <span class="stat-label d-block">Present</span>
              <h5 class="fw-bold mt-1 mb-0 text-success">${sMo.att}</h5>
            </div></div>
            <div class="col-6 col-md-3"><div class="p-3 rounded" style="background:var(--bg-body)">
              <span class="stat-label d-block">Absent</span>
              <h5 class="fw-bold mt-1 mb-0 text-danger">${sMo.abs}</h5>
            </div></div>
            <div class="col-6 col-md-3"><div class="p-3 rounded" style="background:var(--bg-body)">
              <span class="stat-label d-block">Late</span>
              <h5 class="fw-bold mt-1 mb-0 text-warning">${sMo.late}</h5>
            </div></div>
            <div class="col-6 col-md-3"><div class="p-3 rounded" style="background:var(--bg-body)">
              <span class="stat-label d-block">Bunk</span>
              <h5 class="fw-bold mt-1 mb-0 text-bunk">${sMo.bunk}</h5>
            </div></div>
          </div>
          <p class="text-muted small mb-0 mt-3">${sMo.att} attended of ${sMo.held} scheduled slot(s).</p>
        </div>

        <div class="content-card mb-4">
          <h6 class="fw-bold mb-3"><i class="bi bi-book text-info me-2"></i>Subject-wise — ${monthLabel(ym)}</h6>
          ${sMo.subjects.length ? `
            <div class="table-responsive"><table class="table table-sm align-middle mb-0">
              <thead><tr><th>Subject</th><th class="text-center">Attended</th><th style="min-width:150px">%</th></tr></thead>
              <tbody>${sMo.subjects.map(s => {
                const okS = s.pct >= ATTENDANCE_THRESHOLD;
                return `<tr>
                  <td class="fw-medium">${esc(s.subject)}</td>
                  <td class="text-center">${s.present} / ${s.total}</td>
                  <td>
                    <div class="d-flex align-items-center gap-2">
                      <div class="subject-progress flex-grow-1">
                        <div class="fill ${okS ? 'fill-success' : 'fill-danger'}" style="width:${s.pct}%"></div>
                      </div>
                      <span class="badge bg-${okS ? 'success' : 'danger'}">${s.pct}%</span>
                    </div>
                  </td>
                </tr>`;
              }).join('')}</tbody>
            </table></div>
          ` : `<p class="text-muted small mb-0">No subject data for this month.</p>`}
        </div>

        <div class="content-card mb-4">
          <h6 class="fw-bold mb-3"><i class="bi bi-x-circle text-danger me-2"></i>Missed Lectures — ${monthLabel(ym)}</h6>
          ${monthMissed.length ? `
            <div class="table-responsive"><table class="table table-sm align-middle mb-0">
              <thead><tr><th>Date</th><th>Slot</th><th>Subject</th><th>Status</th></tr></thead>
              <tbody>${monthMissed.map(m => `<tr>
                <td>${fmtDate(m.date)}</td>
                <td class="text-muted small">${esc(m.slot)}</td>
                <td>${esc(m.subject)}</td>
                <td>${slotPill(m.status)}</td>
              </tr>`).join('')}</tbody>
            </table></div>
          ` : `<p class="text-muted small mb-0">No missed lectures. 🎉</p>`}
        </div>

        <div class="content-card">
          <h6 class="fw-bold mb-3"><i class="bi bi-graph-up-arrow text-primary me-2"></i>Monthly History</h6>
          ${sAll.months.length ? `
            <div class="table-responsive"><table class="table table-sm align-middle mb-0">
              <thead><tr><th>Month</th><th class="text-center">Attended</th><th style="min-width:150px">%</th></tr></thead>
              <tbody>${sAll.months.map(m => {
                const okM = m.pct >= ATTENDANCE_THRESHOLD;
                return `<tr>
                  <td class="fw-medium">${monthLabel(m.ym)}</td>
                  <td class="text-center">${m.present} / ${m.total}</td>
                  <td>
                    <div class="d-flex align-items-center gap-2">
                      <div class="subject-progress flex-grow-1">
                        <div class="fill ${okM ? 'fill-success' : 'fill-danger'}" style="width:${m.pct}%"></div>
                      </div>
                      <span class="badge bg-${okM ? 'success' : 'danger'}">${m.pct}%</span>
                    </div>
                  </td>
                </tr>`;
              }).join('')}</tbody>
            </table></div>
          ` : `<p class="text-muted small mb-0">No history yet.</p>`}
        </div>
      </div>
    </div>`;

  $('#sd-month').onchange = e => { state.analysisMonth = e.target.value; renderStudentDetail(); };
  $('#back-btn').onclick = () => {
    state.analysisView = state.analysisSem ? 'students' : 'semesters';
    state.roll = null;
    renderAnalysis();
  };
}

/* ==========================================================
   REPORTS
   ========================================================== */
function renderReports() {
  $('#view').innerHTML = `
    <div class="mb-4 anim-in">
      <div class="stat-label">Administrative Centre</div>
      <h4 class="fw-bold mb-1 mt-2">Reports</h4>
      <p class="text-muted small mb-0">Generate CSVs for attendance analytics. Ready for Excel/Sheets.</p>
    </div>
    ${banner()}
    <div class="content-card mb-4 anim-in anim-in-d1">
      <h6 class="fw-bold mb-3"><i class="bi bi-sliders text-primary me-2"></i>Report Scope</h6>
      <div class="row g-3">
        <div class="col-12 col-md-6">
          <label class="form-label small fw-semibold text-muted">Semester</label>
          <select id="rp-sem" class="form-select">${optionsHTML(SEMESTERS.map(s => [s, SEM_META[s].label]), refSemester())}</select>
        </div>
        <div class="col-12 col-md-6">
          <label class="form-label small fw-semibold text-muted">Month</label>
          <select id="rp-month" class="form-select">${monthOptions()}</select>
        </div>
      </div>
    </div>
    <div class="row g-4">
      <div class="col-12 col-lg-4 anim-in anim-in-d2"><div class="content-card h-100">
        <div class="report-group-title"><i class="bi bi-bar-chart-line me-1"></i>Attendance Reports</div>
        <div class="d-flex flex-column gap-2">
          <button id="rp-sem-month" class="report-card">
            <span class="icon-box bg-primary-subtle text-primary"><i class="bi bi-table"></i></span>
            <span class="flex-grow-1"><span class="rc-title d-block">Semester Monthly Report</span><span class="rc-sub">Per-student attendance for a month</span></span>
            <i class="bi bi-arrow-right rc-arrow"></i>
          </button>
          <button id="rp-subject" class="report-card">
            <span class="icon-box bg-info-subtle text-info"><i class="bi bi-book"></i></span>
            <span class="flex-grow-1"><span class="rc-title d-block">Subject-wise Report</span><span class="rc-sub">Attendance % by subject</span></span>
            <i class="bi bi-arrow-right rc-arrow"></i>
          </button>
          <button id="rp-defaulter" class="report-card">
            <span class="icon-box bg-danger-subtle text-danger"><i class="bi bi-exclamation-triangle"></i></span>
            <span class="flex-grow-1"><span class="rc-title d-block">Defaulter Report</span><span class="rc-sub">Below ${ATTENDANCE_THRESHOLD}% for selected month</span></span>
            <i class="bi bi-arrow-right rc-arrow"></i>
          </button>
          <button id="rp-monthly" class="report-card">
            <span class="icon-box bg-success-subtle text-success"><i class="bi bi-calendar3"></i></span>
            <span class="flex-grow-1"><span class="rc-title d-block">Monthly Overview</span><span class="rc-sub">All months for a semester</span></span>
            <i class="bi bi-arrow-right rc-arrow"></i>
          </button>
        </div>
      </div></div>

      <div class="col-12 col-lg-4 anim-in anim-in-d3"><div class="content-card h-100">
        <div class="report-group-title"><i class="bi bi-person-badge me-1"></i>Student Reports</div>
        <label class="form-label small fw-semibold text-muted">Select Student</label>
        <select id="rp-student" class="form-select">
          ${SEMESTERS.flatMap(sem => studentsOf(sem).slice()
            .sort((a,b) => a.rollNo.localeCompare(b.rollNo, undefined, {numeric:true}))
            .map(st => [st.rollNo, `${SEM_META[sem].code} · ${st.rollNo} — ${st.name}`]))
            .map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}
        </select>
        <button id="rp-student-btn" class="report-card mt-3">
          <span class="icon-box bg-primary-subtle text-primary"><i class="bi bi-file-earmark-person"></i></span>
          <span class="flex-grow-1"><span class="rc-title d-block">Individual Student Report</span><span class="rc-sub">Full history + subject breakdown</span></span>
          <i class="bi bi-download rc-arrow"></i>
        </button>
      </div></div>

      <div class="col-12 col-lg-4 anim-in anim-in-d4"><div class="content-card h-100">
        <div class="report-group-title"><i class="bi bi-file-earmark-excel me-1"></i>Data Exports</div>
        <div class="d-flex flex-column gap-2">
          <button id="exp-records" class="report-card">
            <span class="icon-box bg-success-subtle text-success"><i class="bi bi-clipboard-data"></i></span>
            <span class="flex-grow-1"><span class="rc-title d-block">Attendance Records</span><span class="rc-sub">Every individual slot record</span></span>
            <i class="bi bi-download rc-arrow"></i>
          </button>
          <button id="exp-students" class="report-card">
            <span class="icon-box bg-success-subtle text-success"><i class="bi bi-people"></i></span>
            <span class="flex-grow-1"><span class="rc-title d-block">Student Master</span><span class="rc-sub">All students across semesters</span></span>
            <i class="bi bi-download rc-arrow"></i>
          </button>
          <button id="exp-monthly" class="report-card">
            <span class="icon-box bg-success-subtle text-success"><i class="bi bi-calendar-check"></i></span>
            <span class="flex-grow-1"><span class="rc-title d-block">Monthly Summary</span><span class="rc-sub">Per-student per-month totals</span></span>
            <i class="bi bi-download rc-arrow"></i>
          </button>
          <button id="exp-all" class="report-card">
            <span class="icon-box bg-primary text-white"><i class="bi bi-box-seam"></i></span>
            <span class="flex-grow-1"><span class="rc-title d-block">Full Package</span><span class="rc-sub">All three CSVs in one click</span></span>
            <i class="bi bi-download rc-arrow"></i>
          </button>
        </div>
      </div></div>
    </div>`;

  const getSel = () => ({ sem: +$('#rp-sem').value, ym: $('#rp-month').value });

  $('#rp-month').onchange = e => { state.analysisMonth = e.target.value; };

  $('#rp-sem-month').onclick = () => {
    const { sem, ym } = getSel();
    const studs = studentsOf(sem).slice().sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));
    const head = ['Roll No','Name','Batch','Attended','Held','%','Present','Absent','Late','Bunk'];
    const body = studs.map(st => {
      const s = studentStats(st.rollNo, ym);
      return [st.rollNo, st.name, st.batch || '', s.att, s.held, s.pct + '%', s.att, s.abs, s.late, s.bunk];
    });
    downloadCSV([head, ...body], `semester_${SEM_META[sem].code}_${ym}.csv`);
  };

  $('#rp-subject').onclick = () => {
    const { sem, ym } = getSel();
    const rows = subjectStatsForSem(sem, ym);
    const head = ['Subject','Present','Total','%'];
    downloadCSV([head, ...rows.map(r => [r.subject, r.present, r.total, r.pct + '%'])],
      `subject_${SEM_META[sem].code}_${ym}.csv`);
  };

  $('#rp-defaulter').onclick = () => {
    const { sem, ym } = getSel();
    const rows = defaulterList(sem, ym);
    const head = ['Roll No','Name','Batch','Attended','Held','%'];
    downloadCSV([head, ...rows.map(r => [r.rollNo, r.name, r.batch || '', r.att, r.held, r.pct + '%'])],
      `defaulters_${SEM_META[sem].code}_${ym}.csv`);
  };

  $('#rp-monthly').onclick = () => {
    const { sem } = getSel();
    const months = getMonths();
    const head = ['Month','Attended','Held','%'];
    const body = months.map(ym => {
      const s = monthlySemStats(sem, ym);
      return [monthLabel(ym), s.att, s.held, s.pct + '%'];
    });
    downloadCSV([head, ...body], `monthly_${SEM_META[sem].code}.csv`);
  };

  $('#rp-student-btn').onclick = () => {
    const roll = $('#rp-student').value;
    const st = findStudent(roll);
    if (!st) return;
    const s = studentStats(roll);
    const rows = [['Name', st.name], ['Roll', st.rollNo], ['Semester', SEM_META[st.semester].code],
                  ['Overall %', s.pct + '%'], ['Attended', s.att], ['Held', s.held], [''],
                  ['Subject','Present','Total','%'],
                  ...s.subjects.map(x => [x.subject, x.present, x.total, x.pct + '%']),
                  [''], ['Month','Present','Total','%'],
                  ...s.months.map(m => [monthLabel(m.ym), m.present, m.total, m.pct + '%'])];
    downloadCSV(rows, `student_${st.rollNo}.csv`);
  };
  $('#exp-records').onclick = exportAttendanceRecords;
  $('#exp-students').onclick = exportStudentMaster;
  $('#exp-monthly').onclick  = exportMonthlySummary;
  $('#exp-all').onclick = () => {
    exportAttendanceRecords();
    setTimeout(exportStudentMaster, 300);
    setTimeout(exportMonthlySummary, 600);
  };
}

function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function exportAttendanceRecords() {
  const head = ['Roll No','Student Name','Semester','Branch','Date','Month','Subject','Lecture/Slot','Status'];
  const rows = RECORDS.map(r => {
    const st = findStudent(r.rollNo) || {};
    const sem = st.semester || 5;
    const wd = weekdayOf(r.date);
    const slot = (timetableOf(sem)[wd] || []).find(s => s.slot === r.slot);
    return [
      r.rollNo,
      st.name || '',
      SEM_META[sem].code,
      'Computer Engineering',
      r.date,
      monthKeyOf(r.date),
      slot ? slot.subject : '',
      r.slot,
      r.status
    ];
  });
  downloadCSV([head, ...rows], 'attendance_records.csv');
}

function exportStudentMaster() {
  const head = ['Roll No','Name','Semester','Branch','Batch'];
  const rows = SEMESTERS.flatMap(sem =>
    studentsOf(sem).map(st => [
      st.rollNo, st.name, SEM_META[sem].code, 'Computer Engineering', st.batch || ''
    ])
  );
  downloadCSV([head, ...rows], 'student_master.csv');
}

function exportMonthlySummary() {
  const head = ['Roll No','Name','Semester','Month','Attended','Held','%'];
  const rows = [];
  SEMESTERS.forEach(sem => {
    studentsOf(sem).forEach(st => {
      const s = studentStats(st.rollNo);
      s.months.forEach(m => {
        rows.push([st.rollNo, st.name, SEM_META[sem].code, monthLabel(m.ym), m.present, m.total, m.pct + '%']);
      });
    });
  });
  downloadCSV([head, ...rows], 'monthly_summary.csv');
}

/* ==========================================================
   DATA IMPORT (placeholder)
   ========================================================== */
function renderImport() {
  $('#view').innerHTML = `
    <div class="mb-4 anim-in">
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <div class="stat-label">Module</div>
        <span class="coming-badge">Coming Soon</span>
      </div>
      <h4 class="fw-bold mb-1 mt-2">Data Import</h4>
      <p class="text-muted small mb-0">Smart Excel Intelligence — will let you import faculty attendance sheets directly.</p>
    </div>
    <div class="row g-4">
      <div class="col-12 col-lg-7 anim-in anim-in-d1"><div class="content-card">
        <div class="upload-illustration">
          <div class="icon-wrap"><i class="bi bi-cloud-arrow-up-fill fs-2"></i></div>
          <h6 class="fw-bold mb-1">Excel / CSV upload</h6>
          <p class="text-muted small mb-0">Import is not yet available. Use <strong>Mark Attendance</strong> for now.</p>
        </div>
        <button class="btn btn-primary btn-sm mt-3" disabled>
          <i class="bi bi-upload me-1"></i>Choose file
        </button>
      </div></div>
      <div class="col-12 col-lg-5 anim-in anim-in-d2"><div class="content-card h-100">
        <h6 class="fw-bold mb-3"><i class="bi bi-diagram-3 text-info me-2"></i>Planned workflow</h6>
        <div class="d-flex flex-column gap-2">
          <div class="feature-card">
            <div class="icon-box bg-primary-subtle text-primary"><i class="bi bi-file-earmark-spreadsheet"></i></div>
            <div>
              <div class="fw-semibold small">Read faculty Excel format</div>
              <div class="text-muted" style="font-size:.72rem">Parses the standard monthly grid per student.</div>
            </div>
          </div>
          <div class="feature-card">
            <div class="icon-box bg-info-subtle text-info"><i class="bi bi-person-check"></i></div>
            <div>
              <div class="fw-semibold small">Auto-map roll numbers</div>
              <div class="text-muted" style="font-size:.72rem">Matches to existing student master.</div>
            </div>
          </div>
          <div class="feature-card">
            <div class="icon-box bg-success-subtle text-success"><i class="bi bi-database-check"></i></div>
            <div>
              <div class="fw-semibold small">Write to same store</div>
              <div class="text-muted" style="font-size:.72rem">Records flow into analytics instantly.</div>
            </div>
          </div>
        </div>
      </div></div>
    </div>`;
}

/* ==========================================================
   MANAGE modal (students + timetable + bulk paste)
   ========================================================== */
function openManageModal() {
  state.manageSem = state.manageSem || 5;
  state.manageTab = state.manageTab || 'students';
  state.manageDay = state.manageDay || 'Monday';
  renderManageBody();
  bootstrap.Modal.getOrCreateInstance($('#manageModal')).show();
}

function renderManageBody() {
  const sem = state.manageSem, tab = state.manageTab;
  $('#manage-body').innerHTML = `
    <ul class="nav nav-pills mb-3 gap-2">
      ${SEMESTERS.map(s => `
        <li class="nav-item"><button type="button" class="nav-link ${s === sem ? 'active' : ''}" data-msem="${s}">
          <i class="bi bi-mortarboard me-1"></i>${SEM_META[s].code}
        </button></li>`).join('')}
    </ul>
    <ul class="nav nav-tabs mb-3">
      <li class="nav-item"><button type="button" class="nav-link ${tab === 'students' ? 'active' : ''}" data-mtab="students"><i class="bi bi-people-fill me-1"></i>Students</button></li>
      <li class="nav-item"><button type="button" class="nav-link ${tab === 'timetable' ? 'active' : ''}" data-mtab="timetable"><i class="bi bi-calendar3 me-1"></i>Timetable</button></li>
    </ul>
    <div id="manage-tab-content">${tab === 'students' ? manageStudentsHTML(sem) : manageTimetableHTML(sem)}</div>`;
}

function manageStudentsHTML(sem) {
  const studs = studentsOf(sem).slice()
    .sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));
  return `
    <div class="table-responsive mb-3">
      <table class="table table-sm align-middle">
        <thead><tr><th>Roll No.</th><th>Name</th><th>Batch</th><th class="text-end">Actions</th></tr></thead>
        <tbody>
          ${studs.length ? studs.map(st => `
            <tr data-roll="${esc(st.rollNo)}">
              <td class="fw-semibold">${esc(st.rollNo)}</td>
              <td>${esc(st.name)}</td>
              <td class="text-muted small">${esc(st.batch || '—')}</td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-primary me-1" data-action="edit-student">Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="del-student">Delete</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="4" class="text-center text-muted py-3">No students in ${SEM_META[sem].code}. Add one below.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="manage-form p-3 mb-3">
      <h6 class="fw-bold mb-2 small text-uppercase text-muted">Add student</h6>
      <div class="row g-2">
        <div class="col-md-3"><input id="ms-roll"  class="form-control form-control-sm" placeholder="Roll No."></div>
        <div class="col-md-5"><input id="ms-name"  class="form-control form-control-sm" placeholder="Student Name"></div>
        <div class="col-md-2"><input id="ms-batch" class="form-control form-control-sm" placeholder="Batch (opt)"></div>
        <div class="col-md-2"><button type="button" id="ms-add" class="btn btn-sm btn-primary w-100">Add</button></div>
      </div>
    </div>
    <div class="manage-form p-3">
      <h6 class="fw-bold mb-2 small text-uppercase text-muted">Bulk add (paste CSV)</h6>
      <p class="text-muted small mb-2">One student per line: <code>rollNo, name, batch</code> — batch is optional.</p>
      <textarea id="ms-bulk" class="form-control form-control-sm" rows="5" placeholder="CO5-70, NEW STUDENT, A&#10;CO5-71, ANOTHER STUDENT"></textarea>
      <button type="button" id="ms-bulk-add" class="btn btn-sm btn-primary mt-2"><i class="bi bi-upload me-1"></i>Import pasted rows</button>
    </div>`;
}

function manageTimetableHTML(sem) {
  const tt = timetableOf(sem);
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const activeDay = state.manageDay;
  const slots = (tt[activeDay] || []).slice().sort((a, b) => a.slot.localeCompare(b.slot));
  return `
    <ul class="nav nav-pills mb-3 gap-2 flex-wrap">
      ${days.map(d => `<li class="nav-item"><button type="button" class="nav-link ${d === activeDay ? 'active' : ''}" data-mday="${d}">${d.slice(0,3)}</button></li>`).join('')}
    </ul>
    <div class="table-responsive mb-3">
      <table class="table table-sm align-middle">
        <thead><tr><th>Time</th><th>Subject</th><th>Type</th><th class="text-end">Actions</th></tr></thead>
        <tbody>
          ${slots.length ? slots.map(s => `
            <tr data-slot="${esc(s.slot)}">
              <td>${esc(s.slot)}</td>
              <td>${esc(s.subject)}</td>
              <td><span class="badge bg-secondary">${esc(s.type)}</span></td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-primary me-1" data-action="edit-slot">Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="del-slot">Delete</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="4" class="text-center text-muted py-3">No slots for ${activeDay}.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="manage-form p-3">
      <h6 class="fw-bold mb-2 small text-uppercase text-muted">Add slot to ${activeDay} — ${SEM_META[sem].code}</h6>
      <div class="row g-2">
        <div class="col-md-3">
          <select id="mt-slot" class="form-select form-select-sm">
            <optgroup label="Theory (1 hr)">
              <option value="09:15-10:15">09:15–10:15</option>
              <option value="10:15-11:15">10:15–11:15</option>
              <option value="11:30-12:30">11:30–12:30</option>
              <option value="12:30-13:30">12:30–13:30</option>
              <option value="14:00-15:00">14:00–15:00</option>
              <option value="15:00-16:00">15:00–16:00</option>
            </optgroup>
            <optgroup label="Lab (2 hrs)">
              <option value="09:15-11:15">09:15–11:15</option>
              <option value="11:30-13:30">11:30–13:30</option>
              <option value="14:00-16:00">14:00–16:00</option>
            </optgroup>
          </select>
        </div>
        <div class="col-md-4"><input id="mt-subject" class="form-control form-control-sm" placeholder="Subject"></div>
        <div class="col-md-3">
          <select id="mt-type" class="form-select form-select-sm">
            <option>Theory</option><option>Lab</option><option>Library</option>
          </select>
        </div>
        <div class="col-md-2"><button type="button" id="mt-add" class="btn btn-sm btn-primary w-100">Add</button></div>
      </div>
      <p class="small text-muted mt-2 mb-0">Breaks are automatic and are not editable slots.</p>
    </div>`;
}

function handleManageAction(btn) {
  const action = btn.dataset.action;
  const sem = state.manageSem;
  const studs = studentsOf(sem);
  const tt = timetableOf(sem);

  if (action === 'edit-student' || action === 'del-student') {
    const roll = btn.closest('tr').dataset.roll;
    const idx = studs.findIndex(s => s.rollNo === roll);
    if (idx < 0) return;
    const st = studs[idx];

    if (action === 'edit-student') {
      const newRoll  = prompt('Roll Number:', st.rollNo);           if (newRoll  === null) return;
      const newName  = prompt('Name:', st.name);                    if (newName  === null) return;
      const newBatch = prompt('Batch (optional):', st.batch || ''); if (newBatch === null) return;
      const cleanRoll = newRoll.trim();
      if (cleanRoll && cleanRoll !== st.rollNo) {
        if (findStudent(cleanRoll)) { alert('Roll number exists.'); return; }
        RECORDS.forEach(r => { if (r.rollNo === st.rollNo) r.rollNo = cleanRoll; });
        st.rollNo = cleanRoll;
      }
      st.name  = newName.trim() || st.name;
      st.batch = newBatch.trim() || null;
    } else {
      if (!confirm(`Delete ${st.name}? This also removes their attendance records.`)) return;
      for (let i = RECORDS.length - 1; i >= 0; i--) {
        if (RECORDS[i].rollNo === st.rollNo) RECORDS.splice(i, 1);
      }
      studs.splice(idx, 1);
    }
  } else if (action === 'edit-slot' || action === 'del-slot') {
    const slotKey = btn.closest('tr').dataset.slot;
    const day = state.manageDay;
    const list = tt[day] || [];
    const idx = list.findIndex(s => s.slot === slotKey);
    if (idx < 0) return;
    const slot = list[idx];

    if (action === 'edit-slot') {
      const newTime = prompt('Time:', slot.slot);                     if (newTime === null) return;
      const newSubj = prompt('Subject:', slot.subject);               if (newSubj === null) return;
      const newType = prompt('Type (Theory / Lab / Library):', slot.type); if (newType === null) return;
      const cleanTime = newTime.trim();
      if (cleanTime && cleanTime !== slot.slot) {
        slot.slot = cleanTime;
        const [s0, e0] = cleanTime.split('-');
        if ((toMin(e0) - toMin(s0)) < 90) delete slot.batches;
      }
      slot.subject = newSubj.trim() || slot.subject;
      if (['Theory','Lab','Library'].includes(newType.trim())) slot.type = newType.trim();
    } else {
      if (!confirm(`Delete slot ${slot.slot} (${slot.subject})?`)) return;
      list.splice(idx, 1);
    }
  }
  saveAll();
  renderManageBody();
  render();
}

function handleManageAdd(btn) {
  const sem = state.manageSem;
  const tt  = timetableOf(sem);
  const studs = studentsOf(sem);

  if (btn.id === 'ms-add') {
    const roll  = $('#ms-roll').value.trim();
    const name  = $('#ms-name').value.trim();
    const batch = $('#ms-batch').value.trim() || null;
    if (!roll || !name) { alert('Roll number and name are required.'); return; }
    if (findStudent(roll)) { alert('Roll number already exists.'); return; }
    studs.push({ rollNo: roll, name, semester: sem, batch });
  } else if (btn.id === 'ms-bulk-add') {
    const text = $('#ms-bulk').value.trim();
    if (!text) { alert('Paste at least one row.'); return; }
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let added = 0, skipped = 0;
    lines.forEach(line => {
      const [roll, name, batch] = line.split(',').map(x => (x || '').trim());
      if (!roll || !name) { skipped++; return; }
      if (findStudent(roll)) { skipped++; return; }
      studs.push({ rollNo: roll, name, semester: sem, batch: batch || null });
      added++;
    });
    alert(`Added ${added} student(s). Skipped ${skipped}.`);
  } else if (btn.id === 'mt-add') {
    const slotVal = $('#mt-slot').value;
    const subject = $('#mt-subject').value.trim();
    const type    = $('#mt-type').value;
    if (!subject) { alert('Subject is required.'); return; }
    const day = state.manageDay;
    const list = tt[day] || (tt[day] = []);
    if (list.some(s => s.slot === slotVal)) { alert('That time slot already exists.'); return; }
    list.push({ slot: slotVal, subject, type });
  }
  saveAll();
  renderManageBody();
  render();
}

/* ==========================================================
   Theme + routing
   ========================================================== */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.documentElement.setAttribute('data-bs-theme', state.theme);
  $('#theme-btn').innerHTML = state.theme === 'light'
    ? `<i class="bi bi-moon-stars-fill text-primary"></i><span class="small d-none d-md-inline">Dark Mode</span>`
    : `<i class="bi bi-sun-fill text-warning"></i><span class="small d-none d-md-inline">Light Mode</span>`;
}

$('#theme-btn').onclick = () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', state.theme);
  applyTheme();
  render();
};

function render() {
  charts.forEach(c => c.destroy());
  charts = [];
  $('#nav-desktop').innerHTML = $('#nav-mobile').innerHTML = navHTML();
  ({
    dashboard: renderDashboard,
    mark:      renderMarkAttendance,
    daily:     renderDaily,
    timetable: renderTimetable,
    analysis:  renderAnalysis,
    reports:   renderReports,
    import:    renderImport
  })[state.tab]();
}

function route() {
  const id = location.hash.slice(1);
  state.tab = NAV.some(n => n[0] === id) ? id : 'dashboard';
  const menu = document.getElementById('mobileNav');
  const oc = window.bootstrap && bootstrap.Offcanvas.getInstance(menu);
  if (oc) oc.hide();
  render();
  window.scrollTo(0, 0);
}

$('#manage-body').addEventListener('click', e => {
  const semBtn = e.target.closest('[data-msem]');
  if (semBtn) { state.manageSem = +semBtn.dataset.msem; renderManageBody(); return; }
  const tabBtn = e.target.closest('[data-mtab]');
  if (tabBtn) { state.manageTab = tabBtn.dataset.mtab; renderManageBody(); return; }
  const dayBtn = e.target.closest('[data-mday]');
  if (dayBtn) { state.manageDay = dayBtn.dataset.mday; renderManageBody(); return; }
  const actBtn = e.target.closest('[data-action]');
  if (actBtn) { handleManageAction(actBtn); return; }
  const addBtn = e.target.closest('#ms-add, #ms-bulk-add, #mt-add');
  if (addBtn) { handleManageAdd(addBtn); }
});

$('#manage-reset').addEventListener('click', () => {
  if (!confirm('Reset ALL data (students, timetables, attendance) to defaults?')) return;
  resetAll();
  renderManageBody();
  render();
});

window.addEventListener('hashchange', route);
applyTheme();
route();
