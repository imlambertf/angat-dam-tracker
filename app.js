const DATA_URL = 'data/angat.json';
const CRITICAL_LEVEL = 160.0;   // PAGASA/MWSS critical threshold
const LOWEST_ON_RECORD = 150.0; // approximate bottom-of-tube reference, purely for scale

// Tube geometry in SVG user units (must match the rect in index.html)
const TUBE_TOP_Y = 18;
const TUBE_BOTTOM_Y = 542;
const TUBE_HEIGHT = TUBE_BOTTOM_Y - TUBE_TOP_Y;
const TUBE_X = 18;
const TUBE_WIDTH = 120;

function fmt(n, digits = 2) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '\u2014';
  return n.toFixed(digits);
}

function signed(n, digits = 2) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '\u2014';
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(digits)} m`;
}

// Map a water-level value (meters) to a Y coordinate inside the tube.
// scaleMax/scaleMin define what the top and bottom of the tube represent.
function levelToY(value, scaleMin, scaleMax) {
  const clamped = Math.max(scaleMin, Math.min(scaleMax, value));
  const frac = (clamped - scaleMin) / (scaleMax - scaleMin);
  return TUBE_BOTTOM_Y - frac * TUBE_HEIGHT;
}

function renderGauge(current) {
  const scaleMin = LOWEST_ON_RECORD;
  const scaleMax = current.nhwl;

  const fillY = levelToY(current.rwl, scaleMin, scaleMax);
  const fillHeight = TUBE_BOTTOM_Y - fillY;

  const waterRect = document.getElementById('waterRect');
  waterRect.setAttribute('y', fillY);
  waterRect.setAttribute('height', Math.max(0, fillHeight));

  // A soft wave lip at the surface of the fill
  const waveY = fillY;
  const wave = document.getElementById('waterWave');
  wave.setAttribute('d', `M ${TUBE_X} ${waveY}
    C ${TUBE_X + 30} ${waveY - 6}, ${TUBE_X + 60} ${waveY + 6}, ${TUBE_X + TUBE_WIDTH / 2} ${waveY}
    S ${TUBE_X + TUBE_WIDTH - 20} ${waveY - 6}, ${TUBE_X + TUBE_WIDTH} ${waveY}
    L ${TUBE_X + TUBE_WIDTH} ${TUBE_BOTTOM_Y} L ${TUBE_X} ${TUBE_BOTTOM_Y} Z`);

  const thresholds = document.getElementById('thresholds');
  thresholds.innerHTML = '';

  const marks = [
    { value: current.nhwl, label: `NHWL ${fmt(current.nhwl)}`, cls: 'nhwl' },
    { value: current.ruleCurve, label: `Rule curve ${fmt(current.ruleCurve)}`, cls: 'rule' },
    { value: CRITICAL_LEVEL, label: `Critical ${fmt(CRITICAL_LEVEL, 0)}`, cls: 'critical' },
  ];

  marks.forEach(m => {
    if (m.value < scaleMin || m.value > scaleMax + 0.01) return;
    const y = levelToY(m.value, scaleMin, scaleMax);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', TUBE_X - 6);
    line.setAttribute('x2', TUBE_X + TUBE_WIDTH + 6);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('class', `threshold-line ${m.cls}`);
    thresholds.appendChild(line);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', TUBE_X + TUBE_WIDTH + 10);
    text.setAttribute('y', y + 3);
    text.setAttribute('class', `threshold-label ${m.cls}`);
    text.textContent = m.label;
    thresholds.appendChild(text);
  });
}

function statusFor(current) {
  if (current.rwl < CRITICAL_LEVEL) {
    return { text: 'BELOW CRITICAL LEVEL', cls: 'status-critical' };
  }
  if (current.deviationFromRuleCurve < 0) {
    return { text: 'BELOW SEASONAL TARGET', cls: 'status-below-target' };
  }
  return { text: 'AT OR ABOVE TARGET', cls: 'status-recovering' };
}

function renderReadout(current) {
  document.getElementById('rwlValue').textContent = fmt(current.rwl);

  const status = statusFor(current);
  const statusEl = document.getElementById('statusLabel');
  statusEl.textContent = status.text;
  statusEl.className = `eyebrow ${status.cls}`;

  const deltaEl = document.getElementById('deltaValue');
  const d = current.deviation24hr;
  if (typeof d === 'number') {
    deltaEl.textContent = `${signed(d)} over the last 24 hours`;
    deltaEl.className = `delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`;
  } else {
    deltaEl.textContent = '24-hour change unavailable';
  }

  document.getElementById('nhwlValue').textContent = `${fmt(current.nhwl)} m`;
  document.getElementById('ruleCurveValue').textContent = `${fmt(current.ruleCurve)} m`;
  document.getElementById('devNhwlValue').textContent = signed(current.deviationFromNhwl);
  document.getElementById('devRuleValue').textContent = signed(current.deviationFromRuleCurve);

  document.getElementById('observedLine').textContent =
    `Observed ${current.observationTime} \u00b7 ${current.date}`;
}

function renderChart(history) {
  const svg = document.getElementById('chart');
  const count = document.getElementById('historyCount');
  svg.innerHTML = '';

  if (!history || history.length === 0) {
    count.textContent = '';
    return;
  }

  count.textContent = `${history.length} reading${history.length === 1 ? '' : 's'}`;

  const W = 900, H = 220, PAD = 28;
  const values = history.map(h => h.rwl);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.5, max - min);

  const x = i => PAD + (i / Math.max(1, history.length - 1)) * (W - PAD * 2);
  const y = v => H - PAD - ((v - min) / range) * (H - PAD * 2);

  const points = history.map((h, i) => `${x(i)},${y(h.rwl)}`).join(' ');

  const ns = 'http://www.w3.org/2000/svg';

  // gridline at min/max
  [min, max].forEach(v => {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', PAD); line.setAttribute('x2', W - PAD);
    line.setAttribute('y1', y(v)); line.setAttribute('y2', y(v));
    line.setAttribute('stroke', 'rgba(255,255,255,0.06)');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', PAD);
    label.setAttribute('y', y(v) - 4);
    label.setAttribute('font-family', 'IBM Plex Mono, monospace');
    label.setAttribute('font-size', '10');
    label.setAttribute('fill', '#7F9DAC');
    label.textContent = `${v.toFixed(2)} m`;
    svg.appendChild(label);
  });

  // area fill under the line
  const area = document.createElementNS(ns, 'polygon');
  area.setAttribute('points', `${PAD},${H - PAD} ${points} ${W - PAD},${H - PAD}`);
  area.setAttribute('fill', 'rgba(63,196,232,0.12)');
  svg.appendChild(area);

  const polyline = document.createElementNS(ns, 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', '#3FC4E8');
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('stroke-linecap', 'round');
  svg.appendChild(polyline);

  history.forEach((h, i) => {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', x(i));
    circle.setAttribute('cy', y(h.rwl));
    circle.setAttribute('r', i === history.length - 1 ? 4 : 2.5);
    circle.setAttribute('fill', i === history.length - 1 ? '#3FC4E8' : '#0F2634');
    circle.setAttribute('stroke', '#3FC4E8');
    circle.setAttribute('stroke-width', '1.5');
    svg.appendChild(circle);

    const title = document.createElementNS(ns, 'title');
    title.textContent = `${h.date} ${h.time} \u2014 ${h.rwl.toFixed(2)} m`;
    circle.appendChild(title);
  });
}

async function load() {
  try {
    const res = await fetch(`${DATA_URL}?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    renderGauge(data.current);
    renderReadout(data.current);
    renderChart(data.history);

    const footerUpdated = document.getElementById('footerUpdated');
    if (data.lastUpdated) {
      const d = new Date(data.lastUpdated);
      footerUpdated.textContent = d.toLocaleString('en-PH', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
      });
    }
  } catch (err) {
    console.error('Failed to load Angat Dam data:', err);
    document.getElementById('statusLabel').textContent = 'DATA UNAVAILABLE';
    document.getElementById('rwlValue').textContent = '\u2014';
    document.getElementById('deltaValue').textContent =
      'Could not load data/angat.json. If you just deployed this, check that the file exists and the page is served over http(s), not opened as a local file.';
  }
}

load();
// Re-check for a fresher file periodically without a full page reload.
setInterval(load, 15 * 60 * 1000);
