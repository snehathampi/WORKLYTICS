/* ═══════════════════════════════════════════════════════════════
   Worklytics – Performance & Appraisal Module  (performance.js)
   ═══════════════════════════════════════════════════════════════
   Load AFTER manager.js in manager_dashboard.html.
   Uses the shared chartInstances / destroyChart from manager.js
   so Chart.js never sees a canvas registered twice.
   ═══════════════════════════════════════════════════════════════ */

const PerfModule = (() => {
  'use strict';

  let _data     = null;
  let _expanded = null;  // currently expanded employee row id

  /* ── Use manager.js shared chart registry ───────────────────── */
  function _destroyChart(key) {
    // destroyChart and chartInstances are globals from manager.js
    if (typeof destroyChart === 'function') destroyChart(key);
  }
  function _registerChart(key, instance) {
    if (typeof chartInstances !== 'undefined') chartInstances[key] = instance;
  }

  /* ═══════════════════════════════════════════════════════════════
     LOAD
  ═══════════════════════════════════════════════════════════════ */

  async function load() {
    _setLoading(true);
    try {
      const r    = await fetch('/appraisal/api/evaluate/', {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      const json = await r.json();
      if (!json.success) throw new Error(json.error || 'API error');
      _data = json.data;
      _render();
    } catch (err) {
      _showError(err.message);
    } finally {
      _setLoading(false);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════ */

  function _render() {
    if (!_data) return;
    _renderSummaryStrip();
    _renderPodium();
    _renderLeaderboard();
    _renderScoreChart();
    _renderRadarChart();
    _renderDonutChart();
  }

  /* ── Summary strip ──────────────────────────────────────────── */
  function _renderSummaryStrip() {
    const el = document.getElementById('perfSummaryStrip');
    if (!el) return;
    const s = _data.team_summary || {};
    el.innerHTML = `
      <div class="perf-stat-card">
        <div class="perf-stat-icon" style="background:#ede9fe;color:#6d28d9;">👥</div>
        <div>
          <div class="perf-stat-label">Company Employees</div>
          <div class="perf-stat-val">${s.team_size || 0}</div>
        </div>
      </div>
      <div class="perf-stat-card">
        <div class="perf-stat-icon" style="background:#dcfce7;color:#16a34a;">⭐</div>
        <div>
          <div class="perf-stat-label">Avg Score</div>
          <div class="perf-stat-val">${(s.avg_score || 0).toFixed(1)}<span style="font-size:13px;font-weight:400;color:#9ca3af;">/100</span></div>
        </div>
      </div>
      <div class="perf-stat-card">
        <div class="perf-stat-icon" style="background:#fef3c7;color:#d97706;">🏆</div>
        <div>
          <div class="perf-stat-label">Top Performer</div>
          <div class="perf-stat-val" style="font-size:16px;">${escH(s.top_scorer || '—')}</div>
        </div>
      </div>
      <div class="perf-stat-card">
        <div class="perf-stat-icon" style="background:#eff6ff;color:#1d4ed8;">💰</div>
        <div>
          <div class="perf-stat-label">Total Bonus Pool</div>
          <div class="perf-stat-val" style="font-size:17px;">${escH(s.total_bonus_pool || '₹0')}</div>
        </div>
      </div>`;
  }

  /* ── Podium ─────────────────────────────────────────────────── */
  function _renderPodium() {
    const el = document.getElementById('perfPodium');
    if (!el) return;
    const top = (_data.appraisals || []).slice(0, 3);
    if (top.length === 0) {
      el.innerHTML = `<div class="perf-empty">No appraisal data yet. Employees need tasks first.</div>`;
      return;
    }

    // Visual order: 2nd | 1st | 3rd
    const slots    = [top[1], top[0], top[2]].filter(Boolean);
    const medals   = ['🥈', '🥇', '🥉'];
    const podiumH  = ['100px', '130px', '80px'];

    el.innerHTML = slots.map((emp, vi) => {
      const col     = emp.grade_colour || '#6366f1';
      const initials= emp.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
      return `
      <div class="perf-podium-slot">
        <div class="perf-podium-card" style="border-color:${col}30;">
          <div class="perf-podium-medal">${medals[vi]}</div>
          <div class="perf-podium-avatar" style="background:${col}20;color:${col};">${initials}</div>
          <div class="perf-podium-name">${escH(emp.name)}</div>
          <div class="perf-podium-grade" style="color:${col};">${escH(emp.grade)}</div>
          <div class="perf-podium-score" style="color:${col};">${emp.composite_score.toFixed(1)}</div>
          <div class="perf-podium-bonus">${escH(emp.bonus_inr)}</div>
        </div>
        <div class="perf-podium-base" style="height:${podiumH[vi]};background:${col}20;border-top:3px solid ${col};">
          <span class="perf-podium-rank" style="color:${col};">#${emp.rank}</span>
        </div>
      </div>`;
    }).join('');
  }

  /* ── Leaderboard ────────────────────────────────────────────── */
  function _renderLeaderboard() {
    const el = document.getElementById('perfLeaderboard');
    if (!el) return;
    const appraisals = _data.appraisals || [];
    if (appraisals.length === 0) {
      el.innerHTML = `<div class="perf-empty">No employees found.</div>`;
      return;
    }
    el.innerHTML = `
    <table class="perf-table">
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>Employee</th>
          <th style="width:90px;">Score</th>
          <th style="width:110px;">Grade</th>
          <th style="width:60px;">Tasks</th>
          <th style="width:60px;">Done</th>
          <th style="width:70px;">Overdue</th>
          <th style="width:130px;">Bonus</th>
          <th style="width:32px;"></th>
        </tr>
      </thead>
      <tbody>${appraisals.map(a => _leaderboardRow(a)).join('')}</tbody>
    </table>`;
  }

  function _leaderboardRow(a) {
    const col      = a.grade_colour || '#6b7280';
    const initials = a.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
    const rankIcon = a.rank === 1 ? '🥇' : a.rank === 2 ? '🥈' : a.rank === 3 ? '🥉'
      : `<span style="color:#9ca3af;font-size:12px;">${a.rank}</span>`;
    const isExpanded = _expanded === a.employee_id;

    return `
    <tr class="perf-row" id="perfRow-${a.employee_id}"
      onclick="PerfModule.toggleRow(${a.employee_id})" style="cursor:pointer;">
      <td style="text-align:center;">${rankIcon}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="perf-avatar" style="background:${col}20;color:${col};">${initials}</div>
          <div>
            <div style="font-weight:600;color:#1a1d2e;font-size:13px;">${escH(a.name)}</div>
            <div style="font-size:11px;color:#9ca3af;">${escH(a.email)}</div>
          </div>
        </div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="perf-score-bar-track">
            <div class="perf-score-bar-fill" style="width:${a.composite_score}%;background:${col};"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:${col};">${a.composite_score.toFixed(1)}</span>
        </div>
      </td>
      <td>
        <span class="perf-grade-badge" style="background:${col}15;color:${col};border-color:${col}30;">
          ${escH(a.grade)}
        </span>
      </td>
      <td style="text-align:center;font-size:13px;">${a.total_tasks}</td>
      <td style="text-align:center;font-size:13px;color:#22c55e;font-weight:600;">${a.completed_tasks}</td>
      <td style="text-align:center;font-size:13px;
        color:${a.overdue_tasks > 0 ? '#ef4444' : '#9ca3af'};
        font-weight:${a.overdue_tasks > 0 ? '700' : '400'};">
        ${a.overdue_tasks > 0 ? '⚠ ' : ''}${a.overdue_tasks}
      </td>
      <td style="font-weight:700;color:#1a1d2e;font-size:13px;">${escH(a.bonus_inr)}</td>
      <td style="text-align:center;">
        <svg width="14" height="14" fill="none" stroke="#9ca3af" stroke-width="2.5" viewBox="0 0 24 24"
          style="transition:transform .2s;transform:rotate(${isExpanded?180:0}deg)">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </td>
    </tr>
    ${isExpanded ? _expandedRow(a) : ''}`;
  }

  function _expandedRow(a) {
    const col = a.grade_colour || '#6b7280';
    const dims = a.dimensions || {};
    const dimDefs = [
      { key: 'completion_rate',    label: 'Completion Rate',      colour: '#6366f1' },
      { key: 'efficiency',         label: 'Efficiency Index',     colour: '#8b5cf6' },
      { key: 'workload',           label: 'Workload Contribution', colour: '#06b6d4' },
      { key: 'deadline_adherence', label: 'Deadline Adherence',   colour: '#f59e0b' },
      { key: 'priority_handling',  label: 'Priority Handling',    colour: '#ef4444' },
    ];
    const dimBars = dimDefs.map(d => `
      <div class="perf-dim-row">
        <span class="perf-dim-label">${d.label}</span>
        <div class="perf-dim-track">
          <div class="perf-dim-fill" style="width:${dims[d.key]||0}%;background:${d.colour};"></div>
        </div>
        <span class="perf-dim-val" style="color:${d.colour};">${(dims[d.key]||0).toFixed(0)}</span>
      </div>`).join('');

    return `
    <tr class="perf-expand-row">
      <td colspan="9" style="padding:0;">
        <div class="perf-expand-body">
          <div class="perf-expand-left">
            <div class="perf-expand-section-title">Score Breakdown</div>
            ${dimBars}
          </div>
          <div class="perf-expand-right">
            <div class="perf-expand-section-title">Stats</div>
            <div class="perf-expand-stats">
              <div class="perf-expand-stat">
                <span class="perf-expand-stat-label">Total Hours (est.)</span>
                <span class="perf-expand-stat-val">${a.total_hours}h</span>
              </div>
              <div class="perf-expand-stat">
                <span class="perf-expand-stat-label">Actual Hours Logged</span>
                <span class="perf-expand-stat-val">${a.actual_hours > 0 ? a.actual_hours + 'h' : '—'}</span>
              </div>
              <div class="perf-expand-stat">
                <span class="perf-expand-stat-label">Overdue Tasks</span>
                <span class="perf-expand-stat-val" style="color:${a.overdue_tasks>0?'#ef4444':'#22c55e'};">
                  ${a.overdue_tasks}
                </span>
              </div>
              <div class="perf-expand-stat">
                <span class="perf-expand-stat-label">Experience</span>
                <span class="perf-expand-stat-val">${a.experience_years} yr${a.experience_years!==1?'s':''}</span>
              </div>
              <div class="perf-expand-stat">
                <span class="perf-expand-stat-label">Skills</span>
                <span class="perf-expand-stat-val" style="font-size:11px;">${escH(a.skills||'—')}</span>
              </div>
            </div>
            <div class="perf-expand-bonus-card" style="border-color:${col}30;background:${col}08;">
              <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Recommended Bonus</div>
              <div style="font-size:24px;font-weight:900;color:${col};">${escH(a.bonus_inr)}</div>
              <div style="font-size:10px;color:#9ca3af;margin-top:2px;">
                ${a.rank <= 3
                  ? `Rank #${a.rank} · ${escH(a.grade)}`
                  : 'Outside top 3 — no bonus this cycle'}
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>`;
  }

  function toggleRow(empId) {
    _expanded = _expanded === empId ? null : empId;
    _renderLeaderboard();
  }

  /* ═══════════════════════════════════════════════════════════════
     CHARTS  — all use chartInstances from manager.js
  ═══════════════════════════════════════════════════════════════ */

  function _renderScoreChart() {
    _destroyChart('perfScore');
    const canvas = document.getElementById('perfScoreChart');
    if (!canvas || !_data) return;
    const cd = _data.chart_data || {};
    _registerChart('perfScore', new Chart(canvas, {
      type: 'bar',
      data: {
        labels: cd.labels || [],
        datasets: [{
          label: 'Performance Score',
          data:  cd.scores || [],
          backgroundColor: (cd.colours || []).map(c => c + '99'),
          borderColor:     cd.colours || [],
          borderWidth: 2, borderRadius: 6, borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => cd.full_names?.[items[0].dataIndex] || items[0].label,
              label: (item) => {
                const i = item.dataIndex;
                return [
                  ` Score: ${item.raw.toFixed(1)}/100`,
                  ` Grade: ${cd.grades?.[i] || ''}`,
                  ` Bonus: ₹${(cd.bonuses?.[i]||0).toLocaleString('en-IN')}`,
                ];
              }
            }
          }
        },
        scales: {
          x: { grid:{display:false}, ticks:{font:{size:11}} },
          y: { beginAtZero:true, max:100, grid:{color:'#f3f4f6'}, ticks:{font:{size:11}} }
        }
      }
    }));
  }

  function _renderRadarChart() {
    _destroyChart('perfRadar');
    const canvas = document.getElementById('perfRadarChart');
    if (!canvas || !_data) return;
    const da = _data.dimension_averages || {};
    _registerChart('perfRadar', new Chart(canvas, {
      type: 'radar',
      data: {
        labels: ['Completion','Efficiency','Workload','Deadlines','Priority'],
        datasets: [{
          label: 'Team Average',
          data: [
            da.completion_rate    || 0,
            da.efficiency         || 0,
            da.workload           || 0,
            da.deadline_adherence || 0,
            da.priority_handling  || 0,
          ],
          backgroundColor: 'rgba(99,102,241,0.15)',
          borderColor: '#6366f1', borderWidth: 2,
          pointBackgroundColor: '#6366f1', pointRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          r: {
            beginAtZero: true, max: 100,
            ticks: { stepSize:25, font:{size:10}, color:'#9ca3af' },
            grid:  { color:'#e5e7eb' },
            pointLabels: { font:{size:11}, color:'#374151' },
          }
        },
        plugins: { legend:{ display:false } }
      }
    }));
  }

  function _renderDonutChart() {
    // Destroy both our key AND the old manager.js key to avoid any conflict
    _destroyChart('perfDonut');
    _destroyChart('perfVelocity');
    const canvas = document.getElementById('perfDonutChart');
    if (!canvas || !_data) return;

    const dist   = _data.score_distribution || {};
    const order  = ['Outstanding','Excellent','Good','Average','Below Average'];
    const colours = {
      'Outstanding':'#22c55e','Excellent':'#4ade80',
      'Good':'#6366f1','Average':'#f59e0b','Below Average':'#ef4444',
    };
    const labels = order.filter(g => dist[g]);
    const values = labels.map(g => dist[g]);
    if (labels.length === 0) return;

    _registerChart('perfDonut', new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: labels.map(g => colours[g]),
          borderWidth: 0, hoverOffset: 8,
        }]
      },
      options: {
        cutout: '68%', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position:'bottom', labels:{ font:{size:11}, padding:12, boxWidth:12 } },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.label}: ${item.raw} employee${item.raw!==1?'s':''}`
            }
          }
        }
      }
    }));
  }

  /* ═══════════════════════════════════════════════════════════════
     SHELL INJECTION  — injects INTO the existing page div,
     never wipes the whole page element (avoids nav breakage)
  ═══════════════════════════════════════════════════════════════ */

  function _injectShell() {
    // Only inject once
    if (document.getElementById('perfModuleRoot')) return;

    const page = document.getElementById('page-performance');
    if (!page) return;

    // Clear whatever placeholder HTML was there, then build ours
    page.innerHTML = '';

    const root = document.createElement('div');
    root.id = 'perfModuleRoot';
    root.style.padding = '28px 32px';
    root.innerHTML = `
      <!-- Header -->
      <div class="page-header-row" style="margin-bottom:20px;">
        <div>
          <h1 class="page-title">Performance &amp; Appraisal</h1>
          <p class="page-subtitle">
            Heuristic evaluation across completion rate, efficiency, deadlines &amp; priority handling
          </p>
        </div>
        <button class="perf-refresh-btn" onclick="PerfModule.load()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      <!-- States -->
      <div id="perfLoader" style="display:none;text-align:center;padding:60px;color:#6b7280;">
        <div class="perf-spinner"></div>
        <div style="margin-top:12px;font-size:13px;">Computing appraisals…</div>
      </div>
      <div id="perfError" style="display:none;" class="perf-error-box"></div>

      <!-- Content -->
      <div id="perfContent">
        <div id="perfSummaryStrip" class="perf-summary-strip"></div>

        <div class="perf-section-title" style="margin-top:28px;">Top Performers</div>
        <div id="perfPodium" class="perf-podium-wrap"></div>

        <div class="perf-charts-row">
          <div class="perf-chart-card" style="flex:2;">
            <div class="perf-chart-title">Performance Scores</div>
            <div style="height:220px;position:relative;">
              <canvas id="perfScoreChart"></canvas>
            </div>
          </div>
          <div class="perf-chart-card" style="flex:1.2;">
            <div class="perf-chart-title">Team Dimension Averages</div>
            <div style="height:220px;position:relative;">
              <canvas id="perfRadarChart"></canvas>
            </div>
          </div>
          <div class="perf-chart-card" style="flex:1;">
            <div class="perf-chart-title">Grade Distribution</div>
            <div style="height:220px;position:relative;">
              <canvas id="perfDonutChart"></canvas>
            </div>
          </div>
        </div>

        <div class="perf-section-title" style="margin-top:28px;">
          Full Team Leaderboard
          <span class="perf-section-hint">Click a row to see the score breakdown</span>
        </div>
        <div id="perfLeaderboard" class="perf-leaderboard-wrap"></div>

        <div class="perf-methodology-note">
          <strong>Bonus policy —</strong>
          Only the top 3 ranked employees receive a bonus each cycle.&nbsp;
          🥇 Rank 1 → <strong>₹50,000</strong> &nbsp;·&nbsp;
          🥈 Rank 2 → <strong>₹40,000</strong> &nbsp;·&nbsp;
          🥉 Rank 3 → <strong>₹25,000</strong> &nbsp;·&nbsp;
          Rank 4 and below → ₹0.
          Scores are computed using a weighted heuristic across 5 dimensions:
          Completion Rate (30%), Efficiency (25%), Workload Contribution (20%),
          Deadline Adherence (15%), Priority Handling (10%).
        </div>
      </div>`;

    page.appendChild(root);
  }

  /* ── Loading / error ────────────────────────────────────────── */
  function _setLoading(on) {
    const loader  = document.getElementById('perfLoader');
    const content = document.getElementById('perfContent');
    if (loader)  loader.style.display  = on ? 'block' : 'none';
    if (content) content.style.display = on ? 'none'  : 'block';
  }

  function _showError(msg) {
    const el = document.getElementById('perfError');
    if (el) { el.style.display = 'block'; el.textContent = '⚠ ' + msg; }
  }

  /* ═══════════════════════════════════════════════════════════════
     CSS
  ═══════════════════════════════════════════════════════════════ */

  function _injectStyles() {
    if (document.getElementById('perfStyles')) return;
    const s = document.createElement('style');
    s.id = 'perfStyles';
    s.textContent = `
    .perf-summary-strip { display:grid;grid-template-columns:repeat(4,1fr);gap:14px; }
    .perf-stat-card {
      background:#fff;border:1px solid #e5e7eb;border-radius:12px;
      padding:16px;display:flex;align-items:center;gap:12px;
    }
    .perf-stat-icon {
      width:40px;height:40px;border-radius:10px;
      display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;
    }
    .perf-stat-label { font-size:11px;color:#6b7280;margin-bottom:3px; }
    .perf-stat-val   { font-size:22px;font-weight:800;color:#1a1d2e; }

    .perf-podium-wrap {
      display:flex;align-items:flex-end;justify-content:center;gap:16px;padding:20px 0 0;
    }
    .perf-podium-slot  { display:flex;flex-direction:column;align-items:center; }
    .perf-podium-card  {
      background:#fff;border:1px solid;border-radius:14px;padding:16px 20px;
      text-align:center;min-width:150px;
    }
    .perf-podium-medal  { font-size:28px;margin-bottom:8px; }
    .perf-podium-avatar {
      width:48px;height:48px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;font-size:16px;font-weight:800;margin:0 auto 8px;
    }
    .perf-podium-name  { font-size:13px;font-weight:700;color:#1a1d2e;margin-bottom:3px; }
    .perf-podium-grade { font-size:11px;font-weight:600;margin-bottom:4px; }
    .perf-podium-score { font-size:26px;font-weight:900;line-height:1; }
    .perf-podium-bonus { font-size:12px;color:#6b7280;margin-top:4px;font-weight:600; }
    .perf-podium-base  {
      width:100%;border-radius:0 0 8px 8px;
      display:flex;align-items:center;justify-content:center;
    }
    .perf-podium-rank  { font-size:16px;font-weight:900; }

    .perf-charts-row { display:flex;gap:16px;margin-top:24px;flex-wrap:wrap; }
    .perf-chart-card {
      background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px;min-width:0;
    }
    .perf-chart-title {
      font-size:12px;font-weight:700;color:#374151;
      text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;
    }

    .perf-section-title {
      font-size:13px;font-weight:700;color:#1a1d2e;
      display:flex;align-items:center;gap:10px;margin-bottom:12px;
    }
    .perf-section-hint { font-size:11px;font-weight:400;color:#9ca3af; }

    .perf-leaderboard-wrap {
      background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;
    }
    .perf-table { width:100%;border-collapse:collapse;font-size:13px; }
    .perf-table thead th {
      text-align:left;font-size:10px;font-weight:700;color:#6b7280;
      text-transform:uppercase;letter-spacing:.5px;
      padding:12px 14px;background:#fafafa;border-bottom:1px solid #e5e7eb;
    }
    .perf-table td { padding:11px 14px;vertical-align:middle;border-bottom:1px solid #f3f4f6; }
    .perf-row { transition:background .1s; }
    .perf-row:hover { background:#fafafa; }
    .perf-avatar {
      width:34px;height:34px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;
    }
    .perf-score-bar-track {
      flex:1;height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden;min-width:50px;
    }
    .perf-score-bar-fill { height:100%;border-radius:3px; }
    .perf-grade-badge {
      font-size:10px;font-weight:700;padding:3px 8px;
      border-radius:20px;border:1px solid;white-space:nowrap;
    }

    .perf-expand-row td { padding:0;border-bottom:1px solid #e5e7eb; }
    .perf-expand-body {
      display:flex;border-top:1px solid #f3f4f6;background:#fafafa;
    }
    .perf-expand-left  { flex:1.5;padding:16px 20px;border-right:1px solid #e5e7eb; }
    .perf-expand-right { flex:1;padding:16px 20px; }
    .perf-expand-section-title {
      font-size:10px;font-weight:700;color:#6b7280;
      text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;
    }
    .perf-dim-row { display:flex;align-items:center;gap:10px;margin-bottom:8px; }
    .perf-dim-label { font-size:11px;color:#374151;width:155px;flex-shrink:0;font-weight:500; }
    .perf-dim-track { flex:1;height:7px;background:#e5e7eb;border-radius:4px;overflow:hidden; }
    .perf-dim-fill  { height:100%;border-radius:4px;transition:width .4s; }
    .perf-dim-val   { font-size:11px;font-weight:700;min-width:26px;text-align:right; }
    .perf-expand-stats { display:flex;flex-direction:column;gap:8px;margin-bottom:14px; }
    .perf-expand-stat  {
      display:flex;justify-content:space-between;align-items:center;
      font-size:12px;padding:4px 0;border-bottom:1px solid #f3f4f6;
    }
    .perf-expand-stat-label { color:#6b7280; }
    .perf-expand-stat-val   { font-weight:600;color:#1a1d2e; }
    .perf-expand-bonus-card {
      border:1px solid;border-radius:10px;padding:12px 14px;text-align:center;
    }

    .perf-methodology-note {
      margin-top:16px;padding:12px 16px;background:#fafafa;
      border:1px solid #e5e7eb;border-radius:8px;font-size:11px;color:#6b7280;line-height:1.6;
    }
    .perf-refresh-btn {
      display:inline-flex;align-items:center;gap:6px;padding:8px 16px;
      background:#fff;color:#374151;border:1px solid #e5e7eb;border-radius:8px;
      font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
    }
    .perf-refresh-btn:hover { background:#f9fafb; }
    .perf-empty { text-align:center;padding:32px;color:#9ca3af;font-size:13px; }
    .perf-error-box {
      background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;
      padding:14px 18px;color:#dc2626;font-size:13px;margin-bottom:16px;
    }
    .perf-spinner {
      width:28px;height:28px;border:3px solid #e5e7eb;
      border-top-color:#6366f1;border-radius:50%;
      animation:perfSpin .7s linear infinite;margin:0 auto;
    }
    @keyframes perfSpin { to { transform:rotate(360deg); } }
    @media (max-width:900px) {
      .perf-summary-strip { grid-template-columns:repeat(2,1fr); }
      .perf-charts-row    { flex-direction:column; }
    }
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════════
     UTIL
  ═══════════════════════════════════════════════════════════════ */

  function escH(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ═══════════════════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════════════════ */

  function init() {
    _injectStyles();
    _injectShell();
    load();
  }

  return { init, load, toggleRow };

})();

/* ── Override manager.js hooks ──────────────────────────────────
   updatePerformancePage is called by loadDashboardData().
   initPerfCharts is called by showPage('performance').
   Both are neutralised here so PerfModule is the sole owner
   of the performance page canvases — no double-registration. */
function updatePerformancePage(data) {
  PerfModule.init();
}
function initPerfCharts(data) {
  // Intentionally empty — PerfModule handles all perf charts.
  // Called by showPage('performance') in manager.js line 129;
  // we intercept it here so Chart.js never sees a double canvas.
}