(() => {
const $ = s => document.querySelector(s);
const K = { url: 'at_url', token: 'at_token' };
const COLORS = ['#3b6df0', '#1fa98f', '#f0a020', '#e5484d', '#8e5bf0', '#8a94a6'];
let data = null, days = 7, tab = 'overview', charts = [];

/* ---------- helpers ---------- */
const z2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
const today = () => ymd(new Date());
const cutoff = () => { const d = new Date(); d.setDate(d.getDate() - (days - 1)); return ymd(d); };
const inRange = r => r.date >= cutoff() && r.date <= today();
const n = v => Number(v) || 0;
const sum = (a, f) => a.reduce((t, r) => t + f(r), 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMin = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}h ${z2(m % 60)}m` : `${m}m`; };
const fmtSec = s => fmtMin(s / 60);
const gb = mb => (n(mb) / 1024).toFixed(1) + ' GB';
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const stamp = ts => { const d = new Date(Number(ts)); return `${z2(d.getMonth() + 1)}-${z2(d.getDate())} ${z2(d.getHours())}:${z2(d.getMinutes())}`; };
const msg = t => { $('#msg').textContent = t || ''; };
const store = {
  get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: k => { try { localStorage.removeItem(k); } catch (e) {} }
};

const card = (l, v, s = '') => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
const panel = h => `<div class="panel">${h}</div>`;
const box = (id, title) => panel(`<h3>${title}</h3><div class="chartbox"><canvas id="${id}"></canvas></div>`);
const table = (head, rows) => rows.length
  ? `<div class="tw"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  : '<p class="empty">No data for this period.</p>';
const empty = t => panel(`<p class="empty">${t}</p>`);

function chart(id, type, labels, datasets, options = {}) {
  const el = $('#' + id);
  if (!el || !window.Chart) return;
  charts.push(new Chart(el, { type, data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, ...options } }));
}
function setView(html) { charts.forEach(c => c.destroy()); charts = []; $('#view').innerHTML = html; }
const latestDevice = () => data.device.slice().sort((a, b) => n(b.key) - n(a.key))[0];

/* ---------- views ---------- */
function overview() {
  const apps = data.appUsage.filter(inRange), scr = data.screen.filter(inRange);
  const sm = data.summary.filter(inRange).sort(byDate);
  const dev = latestDevice();
  const events = data.calendar.filter(inRange).length;
  setView(
    `<div class="cards">` +
    card('App usage', apps.length ? fmtSec(sum(apps, r => n(r.usageSec))) : '—') +
    card('Screen time', scr.length ? fmtSec(sum(scr, r => n(r.screenSec))) : '—') +
    card('Unlocks', scr.length ? sum(scr, r => n(r.unlocks)) : '—') +
    card('Battery', dev ? n(dev.batteryPct) + '%' : '—', dev ? (n(dev.charging) ? 'Charging' : 'Not charging') : '') +
    card('Free storage', dev ? gb(dev.freeStorageMB) : '—', dev ? 'of ' + gb(dev.totalStorageMB) : '') +
    card('Calendar events', events) +
    `</div>` +
    box('c1', 'Daily app usage and screen time (minutes)') +
    panel('<h3>Daily summary</h3>' + table(
      ['Date', 'App usage', 'Screen time', 'Unlocks', 'Top app', 'Events'],
      sm.slice().reverse().map(r => [r.date, fmtMin(n(r.totalAppUsageMin)), fmtMin(n(r.totalScreenMin)), n(r.unlocks),
        esc(r.topApp) || '—', n(r.calendarEvents)]))));
  chart('c1', 'bar', sm.map(r => r.date), [
    { label: 'App usage', data: sm.map(r => n(r.totalAppUsageMin)), backgroundColor: COLORS[0] },
    { label: 'Screen time', data: sm.map(r => n(r.totalScreenMin)), backgroundColor: COLORS[1] }]);
}

function appsView() {
  const rows = data.appUsage.filter(inRange);
  if (!rows.length) return setView(empty('No app usage yet. In the Android app, grant usage access and tap Sync now.'));
  const agg = {};
  rows.forEach(r => {
    const a = agg[r.package] ||= { name: r.appName || r.package, sec: 0, launches: 0 };
    a.sec += n(r.usageSec); a.launches += n(r.launches);
  });
  const list = Object.entries(agg).map(([p, a]) => ({ p, ...a })).sort((a, b) => b.sec - a.sec);
  const total = sum(list, a => a.sec), top = list.slice(0, 10), top5 = list.slice(0, 5);
  const dates = [...new Set(rows.map(r => r.date))].sort();
  const tot = dates.map(d => sum(rows.filter(r => r.date === d), r => n(r.usageSec)));
  const dayRows = dates.map((d, i) => {
    const delta = i ? tot[i] - tot[i - 1] : null;
    return [d, fmtSec(tot[i]), delta === null ? '—' : (delta >= 0 ? '+' : '−') + fmtSec(Math.abs(delta))];
  }).reverse();

  setView(
    box('c1', 'Top apps (minutes)') +
    box('c2', 'Daily comparison, top 5 apps (minutes)') +
    panel('<h3>Daily totals</h3>' + table(['Date', 'Total usage', 'Change vs previous day'], dayRows)) +
    panel('<h3>All apps</h3>' + table(['App', 'Usage time', 'Launches', 'Share'],
      list.map(a => [esc(a.name), fmtSec(a.sec), a.launches, (a.sec / total * 100).toFixed(1) + '%']))));
  chart('c1', 'bar', top.map(a => a.name), [{ label: 'Minutes', data: top.map(a => Math.round(a.sec / 60)), backgroundColor: COLORS[0] }],
    { indexAxis: 'y', plugins: { legend: { display: false } } });
  chart('c2', 'bar', dates, top5.map((a, i) => ({
    label: a.name, backgroundColor: COLORS[i],
    data: dates.map(d => Math.round(sum(rows.filter(r => r.date === d && r.package === a.p), r => n(r.usageSec)) / 60))
  })), { scales: { x: { stacked: true }, y: { stacked: true } } });
}

function screenView() {
  const rows = data.screen.filter(inRange).sort(byDate);
  if (!rows.length) return setView(empty('No screen data yet. In the Android app, grant usage access and tap Sync now.'));
  setView(
    box('c1', 'Screen time (minutes) and unlocks') +
    panel('<h3>Daily detail</h3>' + table(
      ['Date', 'Screen time', 'Unlocks', 'First activity', 'Last activity', 'Overnight inactive gap'],
      rows.slice().reverse().map(r => [r.date, fmtSec(n(r.screenSec)), n(r.unlocks), r.firstActivity || '—', r.lastActivity || '—',
        n(r.sleepGapMin) > 0 ? `${String(r.sleepGapStart).slice(11)} to ${String(r.sleepGapEnd).slice(11)} (${fmtMin(n(r.sleepGapMin))})` : '—']))) );
  chart('c1', 'bar', rows.map(r => r.date), [
    { label: 'Screen time (min)', data: rows.map(r => Math.round(n(r.screenSec) / 60)), backgroundColor: COLORS[0], yAxisID: 'y' },
    { type: 'line', label: 'Unlocks', data: rows.map(r => n(r.unlocks)), borderColor: COLORS[2], backgroundColor: COLORS[2], yAxisID: 'y1' }],
    { scales: { y: { beginAtZero: true }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } } } });
}

function deviceView() {
  const dev = latestDevice();
  const rows = data.device.filter(inRange).sort((a, b) => n(a.key) - n(b.key));
  const sessions = sum(data.summary.filter(inRange), r => n(r.chargingSessions));
  const today_ = today();
  const timeOf = e => n(e.allDay) === 1 ? 'All day' : `${e.startTime}–${e.endTime}`;
  const evRows = list => list.map(e => [e.date, timeOf(e), esc(e.title), fmtMin(n(e.durationMin))]);
  const upcoming = data.calendar.filter(e => e.date >= today_)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).slice(0, 25);
  const past = data.calendar.filter(e => inRange(e) && e.date < today_)
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
  const evHead = ['Date', 'Time', 'Event', 'Duration'];

  setView(
    `<div class="cards">` +
    card('Battery', dev ? n(dev.batteryPct) + '%' : '—', dev ? 'as of ' + stamp(dev.key) : '') +
    card('Charging', dev ? (n(dev.charging) ? 'Yes' : 'No') : '—', `${sessions} session${sessions === 1 ? '' : 's'} in range (estimated)`) +
    card('Free storage', dev ? gb(dev.freeStorageMB) : '—', dev ? 'of ' + gb(dev.totalStorageMB) : '') +
    card('Network', dev ? esc(dev.network) : '—') +
    `</div>` +
    `<div class="two">${box('c1', 'Battery history (%)')}${box('c2', 'Free storage (GB)')}</div>` +
    panel('<h3>Recent status snapshots</h3>' + table(['Time', 'Battery', 'Charging', 'Network', 'Free storage'],
      rows.slice(-10).reverse().map(r => [stamp(r.key), n(r.batteryPct) + '%', n(r.charging) ? 'Yes' : 'No', esc(r.network), gb(r.freeStorageMB)]))) +
    panel('<h3>Upcoming events</h3>' + (upcoming.length ? table(evHead, evRows(upcoming)) : '<p class="empty">No upcoming events (or calendar access not granted).</p>')) +
    panel('<h3>Past events</h3>' + (past.length ? table(evHead, evRows(past)) : '<p class="empty">No past events in this range.</p>')));
  const labels = rows.map(r => stamp(r.key));
  chart('c1', 'line', labels, [{ label: 'Battery %', data: rows.map(r => n(r.batteryPct)), borderColor: COLORS[1], pointRadius: 2, tension: .2 }],
    { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } });
  chart('c2', 'line', labels, [{ label: 'Free GB', data: rows.map(r => +(n(r.freeStorageMB) / 1024).toFixed(1)), borderColor: COLORS[0], pointRadius: 2, tension: .2 }],
    { plugins: { legend: { display: false } } });
}

const views = { overview, apps: appsView, screen: screenView, device: deviceView };
function render() { if (data) views[tab](); }

/* ---------- loading ---------- */
async function load() {
  const url = store.get(K.url), token = store.get(K.token);
  if (!url || !token) { msg('Not connected. Tap Connect and enter your Web App URL and token.'); $('#dlg').showModal(); return; }
  msg('Loading…');
  try {
    const res = await fetch(`${url}?action=read&days=30&token=${encodeURIComponent(token)}`);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error === 'unauthorized' ? 'wrong token' : (j.error || 'request failed'));
    data = j;
    msg('Updated ' + new Date(j.generated).toLocaleString());
    render();
  } catch (e) {
    msg('Could not load data: ' + e.message + '. Check the URL and token under Connect.');
  }
}

/* ---------- events ---------- */
$('#range').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  days = +b.dataset.d;
  document.querySelectorAll('#range button').forEach(x => x.classList.toggle('on', x === b));
  render();
});
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  tab = b.dataset.t;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  render();
});
$('#refresh').addEventListener('click', load);
$('#connect').addEventListener('click', () => {
  $('#url').value = store.get(K.url); $('#token').value = store.get(K.token); $('#dlg').showModal();
});
$('#cancel').addEventListener('click', () => $('#dlg').close());
$('#clear').addEventListener('click', () => { store.del(K.url); store.del(K.token); data = null; setView(''); msg('Connection removed.'); $('#dlg').close(); });
$('#form').addEventListener('submit', () => { store.set(K.url, $('#url').value.trim()); store.set(K.token, $('#token').value.trim()); load(); });

if (window.Chart) {
  const css = getComputedStyle(document.documentElement);
  Chart.defaults.color = css.getPropertyValue('--mute').trim();
  Chart.defaults.borderColor = css.getPropertyValue('--line').trim();
}
load();
})();
