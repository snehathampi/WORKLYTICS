/* ═══════════════════════════════════════════════════════════════
   Worklytics – What-If Simulation Module  (simulation.js) v2
   ═══════════════════════════════════════════════════════════════
   Changes in v2
   ─────────────
   • Project cards now expand to show all tasks inline with editable
     assignee / hours / status / due-date fields BEFORE entering sandbox
   • Project deadline is editable directly on the card
   • Workload in the analysis panel counts hours from ALL projects
     (cross-project), not just the one being simulated
   • Hard rule: an employee cannot be assigned more than 2 tasks from
     the same project — enforced with a warning + blocked save
   ═══════════════════════════════════════════════════════════════ */

const SimModule = (() => {
  'use strict';

  /* ── State ─────────────────────────────────────────────────── */
  let _state = {
    // Project-card expansions  { pid: bool }
    expandedCards: {},
    // Per-project sandbox state  { pid: { tasks, employees, projectMeta, dirty } }
    projectStates: {},
    // Currently open full-screen sandbox (null = project list view)
    activeProjectId:  null,
    lastAnalysis:     null,
    analysisDebounce: null,
  };

  /* ── CSRF ───────────────────────────────────────────────────── */
  function getCsrf() {
    const c = document.cookie.split(';').find(s => s.trim().startsWith('csrftoken='));
    return c ? decodeURIComponent(c.trim().split('=')[1]) : '';
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  /* ── API ────────────────────────────────────────────────────── */
  async function apiGet(url) {
    const r = await fetch(url, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    return r.json();
  }

  async function apiPost(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type':     'application/json',
        'X-CSRFToken':      getCsrf(),
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 1 – CROSS-PROJECT WORKLOAD HELPER
     Computes total active hours per employee across ALL tasks in
     allTasks (global from manager.js) + any sandbox overrides.
  ═══════════════════════════════════════════════════════════════ */

  function _buildCrossProjectWorkload(focusProjectId, sandboxTasks) {
    /*
      We merge:
        - all tasks from OTHER projects  (from allTasks global, unmodified)
        - sandbox tasks from THIS project (the manager's edited version)
      Then sum non-completed hours per employee.
    */
    const globalTasks = (typeof allTasks !== 'undefined' ? allTasks : []);
    const otherTasks  = globalTasks.filter(t => {
      const pid = t.project?.id;
      return pid != focusProjectId;
    });

    const combined = [...otherTasks, ...sandboxTasks];
    const map = {};  // empId → { name, skills, hours, tasksByProject }

    for (const t of combined) {
      if (t.status === 'completed') continue;
      const assignee = t.assigned_to;
      if (!assignee) continue;
      const eid  = assignee.user_id || assignee.id;
      const name = assignee.name || '?';
      if (!map[eid]) map[eid] = { name, skills: '', hours: 0, tasksByProject: {} };
      map[eid].hours += parseFloat(t.estimated_hours || 0);
      // track per-project task count for the 2-task rule
      const projId = t.project?.id || focusProjectId;
      map[eid].tasksByProject[projId] = (map[eid].tasksByProject[projId] || 0) + 1;
    }

    // Enrich with skills from the employees list (if available in state)
    const emps = _getProjectState(focusProjectId)?.employees || [];
    for (const emp of emps) {
      const eid = emp.user_id || emp.id;
      if (map[eid]) map[eid].skills = emp.skills || '';
      else map[eid] = {
        name: emp.name, skills: emp.skills || '',
        hours: 0, tasksByProject: {},
      };
    }

    // Add utilization + status
    for (const [, w] of Object.entries(map)) {
      w.utilization = Math.min(Math.round((w.hours / 40) * 100), 200);
      w.status = w.hours > 40 ? 'overloaded' : w.hours > 20 ? 'balanced' : 'underutilised';
    }

    return map;  // { empId: { name, skills, hours, utilization, status, tasksByProject } }
  }

  /* ─── Rule: max 2 tasks per employee per project ─────────────── */
  function _tasksInProjectForEmployee(empId, projectId, sandboxTasks) {
    return sandboxTasks.filter(t => {
      if (t.status === 'completed') return false;
      const aid = t.assigned_to ? (t.assigned_to.user_id || t.assigned_to.id) : null;
      return aid == empId;
    }).length;
  }

  function _wouldViolateLimit(empId, taskIdx, projectId, sandboxTasks) {
    // Count tasks assigned to this employee in this project, excluding current task
    let count = 0;
    sandboxTasks.forEach((t, i) => {
      if (i === taskIdx) return;  // skip the task being changed
      if (t.status === 'completed') return;
      const aid = t.assigned_to ? (t.assigned_to.user_id || t.assigned_to.id) : null;
      if (aid == empId) count++;
    });
    return count >= 2;  // adding one more would make it 3+
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 2 – PROJECT STATE MANAGEMENT
  ═══════════════════════════════════════════════════════════════ */

  function _getProjectState(pid) {
    return _state.projectStates[pid] || null;
  }

  async function _ensureProjectLoaded(pid) {
    if (_state.projectStates[pid]) return true;  // already loaded

    const data = await apiGet(`/simulation/api/project/${pid}/load/`);
    if (data.error) { _showToast(data.error, 'error'); return false; }

    _state.projectStates[pid] = {
      projectMeta: data.project,
      sandboxTasks: clone(data.tasks),
      employees:    data.employees,
      dirty:        false,
      deadlineEdited: false,
    };
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 3 – PROJECT CARD LIST (with inline task expansion)
  ═══════════════════════════════════════════════════════════════ */

  function renderProjectCards() {
    const container = document.getElementById('simProjectsContainer');
    if (!container) return;

    const projs = (typeof projects !== 'undefined' ? projects : []);
    if (!projs || projs.length === 0) {
      container.innerHTML = `
        <div class="sim-empty-state">
          <div class="sim-empty-icon">📋</div>
          <div class="sim-empty-title">No projects yet</div>
          <div class="sim-empty-sub">Create a project and add tasks to use the simulator.</div>
        </div>`;
      return;
    }

    container.innerHTML = projs.map(p => _renderProjectCard(p)).join('');
  }

  function _renderProjectCard(p) {
    const progress      = p.progress || 0;
    const priorityColor = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' }[p.priority] || '#6b7280';
    const isExpanded    = _state.expandedCards[p.id] || false;
    const ps            = _getProjectState(p.id);

    return `
    <div class="sim-proj-card" id="simCard-${p.id}">
      <div class="sim-proj-card-accent" style="background:${p.color || '#6366f1'}"></div>
      <div class="sim-proj-card-body">

        <!-- Card header -->
        <div class="sim-proj-card-header">
          <div class="sim-proj-info">
            <span class="sim-proj-dot" style="background:${p.color || '#6366f1'}"></span>
            <div>
              <div class="sim-proj-name">${escHtml(p.name)}</div>
              <div class="sim-proj-meta">
                <span class="sim-badge-priority"
                  style="color:${priorityColor};border-color:${priorityColor}20;background:${priorityColor}10;">
                  ${p.priority}
                </span>
                <span class="sim-proj-stat">${p.task_count || 0} tasks</span>
                <span class="sim-proj-stat">${p.status}</span>
                <span class="sim-proj-stat sim-deadline-display" id="simDeadlineDisplay-${p.id}">
                  ${p.end_date ? `Due ${p.end_date}` : 'No deadline'}
                </span>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="sim-expand-btn" onclick="SimModule.toggleExpand(${p.id})"
              title="${isExpanded ? 'Collapse' : 'Edit tasks'}">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"
                style="transition:transform .2s;transform:rotate(${isExpanded ? 180 : 0}deg)">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              ${isExpanded ? 'Collapse' : 'Edit Tasks'}
            </button>
            <button class="sim-launch-btn" onclick="SimModule.openProject(${p.id})">
              <svg width="13" height="13" fill="white" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Run Simulation
            </button>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="sim-proj-progress-row">
          <div class="sim-proj-progress-bar">
            <div class="sim-proj-progress-fill"
              style="width:${progress}%;background:${p.color || '#6366f1'}"></div>
          </div>
          <span class="sim-proj-pct">${progress}%</span>
        </div>

        <!-- Inline task editor (shown when expanded) -->
        <div id="simInline-${p.id}" style="display:${isExpanded ? 'block' : 'none'};margin-top:12px;">
          ${isExpanded ? _renderInlineEditor(p.id, p) : '<div class="sim-inline-loading"><div class="sim-spinner"></div> Loading tasks…</div>'}
        </div>

      </div>
    </div>`;
  }

  function _renderInlineEditor(pid, projectData) {
    const ps = _getProjectState(pid);
    if (!ps) {
      return `<div class="sim-inline-loading"><div class="sim-spinner"></div> Loading…</div>`;
    }

    const tasks     = ps.sandboxTasks;
    const employees = ps.employees;
    const meta      = ps.projectMeta;
    const workload  = _buildCrossProjectWorkload(pid, tasks);

    if (tasks.length === 0) {
      return `<div class="sim-inline-empty">No tasks in this project yet.</div>`;
    }

    const rows = tasks.map((task, idx) => {
      const assigneeId = task.assigned_to ? (task.assigned_to.user_id || task.assigned_to.id) : '';
      const pClass     = { high:'sim-badge-high', medium:'sim-badge-medium', low:'sim-badge-low' }[task.priority] || '';

      // Build per-row employee options marking current assignment
      const rowEmpOptions = employees.map(e => {
        const eid     = e.user_id || e.id;
        const w       = workload[eid] || {};
        const isMe    = eid == assigneeId;
        const atLimit = !isMe && _wouldViolateLimit(eid, idx, pid, tasks);
        const label   = `${e.name} · ${(w.hours || 0).toFixed(0)}h total${atLimit ? ' [FULL]' : ''}`;
        return `<option value="${eid}" ${isMe ? 'selected' : ''} ${atLimit ? 'disabled' : ''}>${escHtml(label)}</option>`;
      }).join('');

      return `
      <tr class="sim-inline-row" id="simInlineRow-${pid}-${task.id}">
        <td class="sim-td-task">
          <div class="sim-task-title">${escHtml(task.title)}</div>
          ${task.description
            ? `<div class="sim-task-desc">${escHtml(task.description.substring(0,70))}${task.description.length>70?'…':''}</div>`
            : ''}
        </td>
        <td>
          <select class="sim-select"
            onchange="SimModule._onInlineAssignee(${pid}, ${idx}, this.value, this)">
            <option value="">— Unassigned —</option>
            ${rowEmpOptions}
          </select>
        </td>
        <td>
          <input type="number" class="sim-input-hours" min="0.5" max="999" step="0.5"
            value="${task.estimated_hours}"
            onchange="SimModule._onInlineHours(${pid}, ${idx}, this.value)"/>
        </td>
        <td>
          <input type="date" class="sim-input-date"
            value="${task.due_date || ''}"
            onchange="SimModule._onInlineDueDate(${pid}, ${idx}, this.value)"/>
        </td>
        <td><span class="sim-badge-priority ${pClass}">${task.priority}</span></td>
        <td>
          <select class="sim-select sim-select-status"
            onchange="SimModule._onInlineStatus(${pid}, ${idx}, this.value)">
            <option value="todo"        ${task.status==='todo'        ?'selected':''}>To Do</option>
            <option value="in_progress" ${task.status==='in_progress' ?'selected':''}>In Progress</option>
            <option value="completed"   ${task.status==='completed'   ?'selected':''}>Completed</option>
            <option value="blocked"     ${task.status==='blocked'     ?'selected':''}>Blocked</option>
          </select>
        </td>
        <td>
          <button class="sim-delete-task-btn" title="Delete task"
            onclick="SimModule._deleteTask(${pid}, ${task.id})">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0h10"/>
            </svg>
          </button>
        </td>
      </tr>`;
    }).join('');

    return `
    <div class="sim-inline-wrap">

      <!-- Deadline editor -->
      <div class="sim-inline-deadline-row">
        <svg width="13" height="13" fill="none" stroke="#6b7280" stroke-width="2" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span class="sim-inline-deadline-label">Project Deadline:</span>
        <input type="date" class="sim-input-date sim-deadline-input"
          value="${meta.end_date || ''}"
          onchange="SimModule._onDeadlineChange(${pid}, this.value)"/>
        <span class="sim-inline-deadline-hint">changing this only affects the simulation</span>
      </div>

      <!-- Cross-project workload mini-bar -->
      <div class="sim-inline-wl-strip">
        ${Object.entries(workload).map(([eid, w]) => {
          const bar  = Math.min(Math.round((w.hours / 40) * 100), 100);
          const col  = w.status === 'overloaded' ? '#ef4444' : w.status === 'balanced' ? '#22c55e' : '#f59e0b';
          const init = (w.name || '?').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();
          return `
          <div class="sim-inline-wl-chip"
            title="${escHtml(w.name)} · ${w.hours.toFixed(0)}h across all projects · ${w.status}">
            <span class="sim-inline-wl-avatar" style="background:${col}20;color:${col}">${init}</span>
            <div>
              <div style="font-size:10px;font-weight:600;color:#374151;">${escHtml(w.name.split(' ')[0])}</div>
              <div class="sim-inline-wl-bar-track">
                <div class="sim-inline-wl-bar-fill" style="width:${bar}%;background:${col}"></div>
              </div>
            </div>
            <span style="font-size:9px;color:${col};font-weight:700;">${w.hours.toFixed(0)}h</span>
          </div>`;
        }).join('')}
      </div>

      <!-- Task table -->
      <div class="sim-inline-table-wrap">
        <div class="sim-inline-info">
          <svg width="12" height="12" fill="none" stroke="#1d4ed8" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Edit tasks below, then click <strong>Run Simulation</strong> for full risk analysis.
          Max <strong>2 tasks per employee</strong> per project. Hours shown are <strong>across all projects</strong>.
        </div>
        <table class="sim-task-table">
          <thead>
            <tr>
              <th style="min-width:180px;">Task</th>
              <th style="min-width:170px;">Assigned To</th>
              <th style="width:95px;">Est. Hours</th>
              <th style="width:130px;">Due Date</th>
              <th style="width:80px;">Priority</th>
              <th style="width:120px;">Status</th>
              <th style="width:50px;"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="sim-inline-actions">
        ${ps.dirty ? `
          <button class="sim-discard-btn" onclick="SimModule._discardInline(${pid})">Reset</button>
          <button class="sim-apply-btn"   onclick="SimModule._applyInline(${pid})">Save Changes</button>
        ` : `<span style="font-size:11px;color:#9ca3af;">No unsaved changes</span>`}
      </div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 4 – EXPAND / COLLAPSE CARD
  ═══════════════════════════════════════════════════════════════ */

  async function toggleExpand(pid) {
    const wasExpanded = _state.expandedCards[pid] || false;

    if (!wasExpanded) {
      _state.expandedCards[pid] = true;
      _refreshCard(pid);  // show spinner immediately
      const ok = await _ensureProjectLoaded(pid);
      if (!ok) { _state.expandedCards[pid] = false; return; }
    } else {
      _state.expandedCards[pid] = false;
    }
    _refreshCard(pid);
  }

  function _refreshCard(pid) {
    const projs = (typeof projects !== 'undefined' ? projects : []);
    const p = projs.find(proj => proj.id == pid);
    if (!p) return;
    const card = document.getElementById(`simCard-${pid}`);
    if (!card) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = _renderProjectCard(p);
    card.replaceWith(tmp.firstElementChild);
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 5 – INLINE EDIT HANDLERS
  ═══════════════════════════════════════════════════════════════ */

  function _onInlineAssignee(pid, idx, newEmpId, selectEl) {
    const ps = _getProjectState(pid);
    if (!ps) return;

    if (newEmpId && _wouldViolateLimit(newEmpId, idx, pid, ps.sandboxTasks)) {
      const emp = ps.employees.find(e => (e.user_id || e.id) == newEmpId);
      _showToast(`${emp?.name || 'This employee'} already has 2 tasks in this project. Choose someone else.`, 'error');
      const prev = ps.sandboxTasks[idx].assigned_to;
      selectEl.value = prev ? (prev.user_id || prev.id) : '';
      return;
    }

    if (!newEmpId) {
      ps.sandboxTasks[idx].assigned_to = null;
    } else {
      const emp = ps.employees.find(e => (e.user_id || e.id) == newEmpId);
      ps.sandboxTasks[idx].assigned_to = emp
        ? { id: emp.user_id || emp.id, user_id: emp.user_id || emp.id, name: emp.name }
        : null;
    }
    ps.dirty = true;
    _refreshInlineEditor(pid);
  }

  function _onInlineHours(pid, idx, val) {
    const ps = _getProjectState(pid);
    if (!ps) return;
    ps.sandboxTasks[idx].estimated_hours = parseFloat(val) || ps.sandboxTasks[idx].estimated_hours;
    ps.dirty = true;
    _refreshInlineEditor(pid);
  }

  function _onInlineDueDate(pid, idx, val) {
    const ps = _getProjectState(pid);
    if (!ps) return;
    ps.sandboxTasks[idx].due_date = val || null;
    ps.dirty = true;
    _refreshInlineActions(pid);
  }

  function _onInlineStatus(pid, idx, val) {
    const ps = _getProjectState(pid);
    if (!ps) return;
    ps.sandboxTasks[idx].status = val;
    ps.dirty = true;
    _refreshInlineEditor(pid);
  }

  function _onDeadlineChange(pid, val) {
    const ps = _getProjectState(pid);
    if (!ps) return;
    ps.projectMeta.end_date = val || null;
    ps.dirty = true;
    const chip = document.getElementById(`simDeadlineDisplay-${pid}`);
    if (chip) chip.textContent = val ? `Due ${val}` : 'No deadline';
    _refreshInlineActions(pid);
  }

  function _refreshInlineEditor(pid) {
    const wrap = document.getElementById(`simInline-${pid}`);
    if (!wrap) return;
    const projs = (typeof projects !== 'undefined' ? projects : []);
    const p = projs.find(proj => proj.id == pid);
    if (!p) return;
    wrap.innerHTML = _renderInlineEditor(pid, p);
  }

  function _refreshInlineActions(pid) {
    const ps = _getProjectState(pid);
    if (!ps) return;
    const actionsEl = document.querySelector(`#simInline-${pid} .sim-inline-actions`);
    if (!actionsEl) return;
    actionsEl.innerHTML = ps.dirty ? `
      <button class="sim-discard-btn" onclick="SimModule._discardInline(${pid})">Reset</button>
      <button class="sim-apply-btn"   onclick="SimModule._applyInline(${pid})">Save Changes</button>
    ` : `<span style="font-size:11px;color:#9ca3af;">No unsaved changes</span>`;
  }

  async function _applyInline(pid) {
    const ps = _getProjectState(pid);
    if (!ps) return;

    const violation = _checkAllTaskLimits(pid, ps.sandboxTasks);
    if (violation) { _showToast(violation, 'error'); return; }

    const btn = document.querySelector(`#simInline-${pid} .sim-apply-btn`);
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    const data = await apiPost(`/simulation/api/project/${pid}/apply/`, { tasks: ps.sandboxTasks });

    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }

    if (data.success) {
      ps.dirty = false;
      _showToast(data.message, 'success');
      if (typeof loadDashboardData === 'function') setTimeout(loadDashboardData, 800);
      _refreshInlineActions(pid);
    } else {
      _showToast(data.error || 'Save failed.', 'error');
    }
  }

  function _discardInline(pid) {
    if (!confirm('Reset all changes to this project?')) return;
    delete _state.projectStates[pid];
    _state.expandedCards[pid] = true;
    _ensureProjectLoaded(pid).then(() => _refreshCard(pid));
  }

  function _checkAllTaskLimits(pid, sandboxTasks) {
    const counts = {};
    for (const t of sandboxTasks) {
      if (t.status === 'completed') continue;
      if (!t.assigned_to) continue;
      const eid = t.assigned_to.user_id || t.assigned_to.id;
      counts[eid] = (counts[eid] || 0) + 1;
    }
    for (const [eid, count] of Object.entries(counts)) {
      if (count > 2) {
        const ps  = _getProjectState(pid);
        const emp = (ps?.employees || []).find(e => (e.user_id || e.id) == eid);
        return `${emp?.name || 'An employee'} is assigned ${count} tasks in this project (max 2). Please reassign before saving.`;
      }
    }
    return null;
  }

  async function _deleteTask(pid, taskId) {
    if (!confirm('Delete this task? This will also remove any dependencies on it.')) return;

    const data = await apiPost(`/core/api/tasks/${taskId}/delete/`, {});

    if (data.success) {
      // Remove from sandbox state if loaded
      const ps = _getProjectState(pid);
      if (ps) {
        ps.sandboxTasks = ps.sandboxTasks.filter(t => t.id !== taskId);
      }
      _showToast('Task deleted', 'success');
      // Refresh project cards and dashboard
      if (typeof loadDashboardData === 'function') {
        await loadDashboardData();
      }
      // Reload project state fresh and re-render card
      delete _state.projectStates[pid];
      _state.expandedCards[pid] = true;
      const ok = await _ensureProjectLoaded(pid);
      if (ok) _refreshCard(pid);
    } else {
      _showToast(data.error || 'Failed to delete task', 'error');
    }
  }


  /* ═══════════════════════════════════════════════════════════════
     SECTION 6 – FULL SANDBOX (Run Simulation)
  ═══════════════════════════════════════════════════════════════ */

  async function openProject(projectId) {
    _showSandbox();
    _setSandboxLoading(true);

    const ok = await _ensureProjectLoaded(projectId);
    if (!ok) { _setSandboxLoading(false); _hideSandbox(); return; }

    _state.activeProjectId = projectId;

    _setSandboxLoading(false);
    _renderSandbox();
    _scheduleAnalysis(0);
  }

  function closeSandbox() {
    const ps = _getProjectState(_state.activeProjectId);
    if (ps?.dirty) {
      if (!confirm('You have unsaved changes. Close sandbox?')) return;
    }
    _hideSandbox();
    _state.activeProjectId = null;
    _state.lastAnalysis    = null;
  }

  function _showSandbox() {
    const panel = document.getElementById('simSandboxPanel');
    if (panel) panel.style.display = 'flex';
    const cards = document.getElementById('simProjectsContainer');
    if (cards) cards.style.display = 'none';
    const header = document.getElementById('simPageHeader');
    if (header) header.style.display = 'none';
  }

  function _hideSandbox() {
    const panel = document.getElementById('simSandboxPanel');
    if (panel) panel.style.display = 'none';
    const cards = document.getElementById('simProjectsContainer');
    if (cards) { cards.style.display = ''; renderProjectCards(); }
    const header = document.getElementById('simPageHeader');
    if (header) header.style.display = '';
  }

  function _setSandboxLoading(on) {
    const loader = document.getElementById('simSandboxLoader');
    const body   = document.getElementById('simSandboxBody');
    if (loader) loader.style.display = on ? 'flex' : 'none';
    if (body)   body.style.display   = on ? 'none' : 'flex';
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 7 – RENDER FULL SANDBOX
  ═══════════════════════════════════════════════════════════════ */

  function _renderSandbox() {
    const pid = _state.activeProjectId;
    const ps  = _getProjectState(pid);
    if (!ps) return;

    const p = ps.projectMeta;

    const nameEl = document.getElementById('simSandboxProjectName');
    if (nameEl) nameEl.textContent = p.name;

    const dotEl = document.getElementById('simSandboxDot');
    if (dotEl) dotEl.style.background = p.color || '#6366f1';

    const metaEl = document.getElementById('simSandboxMeta');
    if (metaEl) metaEl.innerHTML = `
      <span style="color:#9ca3af;font-size:11px;">Deadline:</span>
      <input type="date" class="sim-input-date sim-sandbox-deadline"
        value="${p.end_date || ''}"
        onchange="SimModule._onSandboxDeadline(this.value)"
        title="Adjust project deadline for simulation"/>`;

    _renderSandboxTaskTable();
  }

  function _onSandboxDeadline(val) {
    const ps = _getProjectState(_state.activeProjectId);
    if (!ps) return;
    ps.projectMeta.end_date = val || null;
    ps.dirty = true;
    _markSandboxDirty();
    _scheduleAnalysis();
  }

  function _renderSandboxTaskTable() {
    const tbody = document.getElementById('simTaskTableBody');
    if (!tbody) return;

    const pid = _state.activeProjectId;
    const ps  = _getProjectState(pid);
    if (!ps) return;

    const tasks     = ps.sandboxTasks;
    const employees = ps.employees;
    const workload  = _buildCrossProjectWorkload(pid, tasks);

    if (tasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:32px;">No tasks in this project.</td></tr>`;
      return;
    }

    tbody.innerHTML = tasks.map((task, idx) => {
      const assigneeId = task.assigned_to ? (task.assigned_to.user_id || task.assigned_to.id) : '';
      const pClass     = { high:'sim-badge-high', medium:'sim-badge-medium', low:'sim-badge-low' }[task.priority] || '';
      const riskInfo   = _getSandboxRiskInfo(task.id);

      const rowEmpOptions = employees.map(e => {
        const eid     = e.user_id || e.id;
        const w       = workload[eid] || {};
        const isMe    = eid == assigneeId;
        const atLimit = !isMe && _wouldViolateLimit(eid, idx, pid, tasks);
        const label   = `${e.name} · ${(w.hours || 0).toFixed(0)}h total${atLimit ? ' [FULL]' : ''}`;
        return `<option value="${eid}" ${isMe?'selected':''} ${atLimit?'disabled':''}>${escHtml(label)}</option>`;
      }).join('');

      return `
      <tr class="sim-task-row" id="simRow-${task.id}">
        <td class="sim-td-task">
          <div class="sim-task-title">${escHtml(task.title)}</div>
          ${task.description ? `<div class="sim-task-desc">${escHtml(task.description.substring(0,70))}${task.description.length>70?'…':''}</div>` : ''}
        </td>
        <td>
          <select class="sim-select" onchange="SimModule._onSandboxAssignee(${idx}, this.value, this)">
            <option value="">— Unassigned —</option>
            ${rowEmpOptions}
          </select>
        </td>
        <td>
          <input type="number" class="sim-input-hours" min="0.5" max="999" step="0.5"
            value="${task.estimated_hours}"
            onchange="SimModule._onSandboxHours(${idx}, this.value)"/>
        </td>
        <td>
          <input type="date" class="sim-input-date"
            value="${task.due_date || ''}"
            onchange="SimModule._onSandboxDueDate(${idx}, this.value)"/>
        </td>
        <td><span class="sim-badge-priority ${pClass}">${task.priority}</span></td>
        <td>
          <select class="sim-select sim-select-status" onchange="SimModule._onSandboxStatus(${idx}, this.value)">
            <option value="todo"        ${task.status==='todo'        ?'selected':''}>To Do</option>
            <option value="in_progress" ${task.status==='in_progress' ?'selected':''}>In Progress</option>
            <option value="completed"   ${task.status==='completed'   ?'selected':''}>Completed</option>
            <option value="blocked"     ${task.status==='blocked'     ?'selected':''}>Blocked</option>
          </select>
        </td>
        <td>
          <div class="sim-risk-cell" id="simRisk-${task.id}">
            ${riskInfo ? _riskBadge(riskInfo) : '<span class="sim-risk-pending">—</span>'}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function _getSandboxRiskInfo(taskId) {
    if (!_state.lastAnalysis) return null;
    const risks = _state.lastAnalysis.project_risk?.task_risks || [];
    return risks.find(r => r.task_id === taskId) || null;
  }

  function _riskBadge(riskInfo) {
    const pct = Math.round(riskInfo.composite * 100);
    return `<span class="sim-risk-badge"
      style="background:${riskInfo.colour}20;color:${riskInfo.colour};border-color:${riskInfo.colour}40;"
      title="${escHtml(riskInfo.reason)}">
      ${riskInfo.label.toUpperCase()} · ${pct}%
    </span>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 8 – SANDBOX EDIT HANDLERS
  ═══════════════════════════════════════════════════════════════ */

  function _onSandboxAssignee(idx, newEmpId, selectEl) {
    const pid = _state.activeProjectId;
    const ps  = _getProjectState(pid);
    if (!ps) return;

    if (newEmpId && _wouldViolateLimit(newEmpId, idx, pid, ps.sandboxTasks)) {
      const emp = ps.employees.find(e => (e.user_id || e.id) == newEmpId);
      _showToast(`${emp?.name || 'Employee'} already has 2 tasks in this project.`, 'error');
      const prev = ps.sandboxTasks[idx].assigned_to;
      selectEl.value = prev ? (prev.user_id || prev.id) : '';
      return;
    }

    if (!newEmpId) {
      ps.sandboxTasks[idx].assigned_to = null;
    } else {
      const emp = ps.employees.find(e => (e.user_id || e.id) == newEmpId);
      ps.sandboxTasks[idx].assigned_to = emp
        ? { id: emp.user_id || emp.id, user_id: emp.user_id || emp.id, name: emp.name }
        : null;
    }
    _markSandboxDirty();
    _renderSandboxTaskTable();
    _scheduleAnalysis();
  }

  function _onSandboxHours(idx, val) {
    const ps = _getProjectState(_state.activeProjectId);
    if (!ps) return;
    ps.sandboxTasks[idx].estimated_hours = parseFloat(val) || ps.sandboxTasks[idx].estimated_hours;
    _markSandboxDirty();
    _scheduleAnalysis();
  }

  function _onSandboxDueDate(idx, val) {
    const ps = _getProjectState(_state.activeProjectId);
    if (!ps) return;
    ps.sandboxTasks[idx].due_date = val || null;
    _markSandboxDirty();
    _scheduleAnalysis();
  }

  function _onSandboxStatus(idx, val) {
    const ps = _getProjectState(_state.activeProjectId);
    if (!ps) return;
    ps.sandboxTasks[idx].status = val;
    _markSandboxDirty();
    _renderSandboxTaskTable();
    _scheduleAnalysis();
  }

  function _markSandboxDirty() {
    const ps = _getProjectState(_state.activeProjectId);
    if (ps) ps.dirty = true;
    const applyBtn   = document.getElementById('simApplyBtn');
    const discardBtn = document.getElementById('simDiscardBtn');
    if (applyBtn)   applyBtn.disabled       = false;
    if (discardBtn) discardBtn.style.display = 'inline-flex';
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 9 – ANALYSIS (debounced, cross-project aware)
  ═══════════════════════════════════════════════════════════════ */

  function _scheduleAnalysis(delay = 800) {
    clearTimeout(_state.analysisDebounce);
    _setAnalysisLoading(true);
    _state.analysisDebounce = setTimeout(_runAnalysis, delay);
  }

  async function _runAnalysis() {
    const pid = _state.activeProjectId;
    if (!pid) return;

    const ps = _getProjectState(pid);
    if (!ps) return;

    // Pass cross-project employee hours to the backend
    const workload = _buildCrossProjectWorkload(pid, ps.sandboxTasks);
    const empPayload = ps.employees.map(e => {
      const eid = e.user_id || e.id;
      const w   = workload[eid] || {};
      return { ...e, hours: w.hours || 0 };
    });

    const body = {
      tasks:            ps.sandboxTasks,
      employees:        empPayload,
      project_end_date: ps.projectMeta?.end_date || null,
    };

    const data = await apiPost(`/simulation/api/project/${pid}/analyse/`, body);
    _setAnalysisLoading(false);

    if (data.error || !data.analysis) {
      _showAnalysisError(data.error || 'Analysis failed');
      return;
    }

    _state.lastAnalysis = data.analysis;
    _renderAnalysis(data.analysis, workload);
    _updateRiskCells();
  }

  function _setAnalysisLoading(on) {
    const el   = document.getElementById('simAnalysisLoader');
    const body = document.getElementById('simAnalysisBody');
    if (el)   el.style.display   = on ? 'flex' : 'none';
    if (body) body.style.display = on ? 'none' : 'block';
  }

  function _showAnalysisError(msg) {
    const body = document.getElementById('simAnalysisBody');
    if (body) body.innerHTML = `<div class="sim-analysis-error">⚠ ${escHtml(msg)}</div>`;
  }

  function _updateRiskCells() {
    const pid = _state.activeProjectId;
    const ps  = _getProjectState(pid);
    if (!ps || !_state.lastAnalysis) return;
    ps.sandboxTasks.forEach(task => {
      const cell = document.getElementById(`simRisk-${task.id}`);
      if (!cell) return;
      const ri = _getSandboxRiskInfo(task.id);
      cell.innerHTML = ri ? _riskBadge(ri) : '<span class="sim-risk-pending">—</span>';
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 10 – RENDER ANALYSIS PANEL
  ═══════════════════════════════════════════════════════════════ */

  function _renderAnalysis(analysis, workloadMap) {
    const body = document.getElementById('simAnalysisBody');
    if (!body) return;

    const s   = analysis.summary || {};
    const pr  = analysis.project_risk || {};
    const sug = analysis.suggestions || [];
    const bd  = pr.breakdown || {};

    // Use frontend cross-project workload for display (more accurate)
    const wlEntries = workloadMap
      ? Object.entries(workloadMap).map(([eid, w]) => ({ employee_id: eid, ...w }))
      : (analysis.workload_map || []);

    const riskScore = Math.round((s.overall_risk_score || 0) * 100);
    const riskCol   = s.overall_risk_colour || '#6b7280';

    body.innerHTML = `
      <div class="sim-summary-strip">
        <div class="sim-summary-card sim-summary-risk">
          <div class="sim-summary-ring">
            <svg viewBox="0 0 36 36" class="sim-ring-svg">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" stroke-width="3"/>
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke="${riskCol}" stroke-width="3"
                stroke-dasharray="${riskScore} ${100-riskScore}"
                stroke-dashoffset="25" stroke-linecap="round"/>
            </svg>
            <span class="sim-ring-val" style="color:${riskCol}">${riskScore}%</span>
          </div>
          <div>
            <div class="sim-summary-label">Project Risk</div>
            <div class="sim-summary-val" style="color:${riskCol};text-transform:capitalize;">${s.overall_risk_label || '—'}</div>
          </div>
        </div>
        <div class="sim-summary-card">
          <div class="sim-summary-icon" style="background:#fef3c720;color:#f59e0b;">⚠</div>
          <div>
            <div class="sim-summary-label">At-Risk Tasks</div>
            <div class="sim-summary-val">${s.at_risk_tasks || 0} / ${s.total_active_tasks || 0}</div>
          </div>
        </div>
        <div class="sim-summary-card">
          <div class="sim-summary-icon" style="background:#fee2e220;color:#ef4444;">🔥</div>
          <div>
            <div class="sim-summary-label">Overloaded</div>
            <div class="sim-summary-val">${s.overloaded_employees || 0} emp.</div>
          </div>
        </div>
        <div class="sim-summary-card">
          <div class="sim-summary-icon" style="background:#f0fdf420;color:#22c55e;">💡</div>
          <div>
            <div class="sim-summary-label">Actions</div>
            <div class="sim-summary-val">${s.suggestion_count || 0}</div>
          </div>
        </div>
      </div>

      <div class="sim-section-title">Risk Breakdown</div>
      <div class="sim-dimension-grid">
        ${_dimensionBar('Workload Balance', bd.workload   || 0, '#6366f1')}
        ${_dimensionBar('Skill Matching',   bd.skill      || 0, '#8b5cf6')}
        ${_dimensionBar('Deadline Urgency', bd.deadline   || 0, '#f59e0b')}
        ${_dimensionBar('Dependency Risk',  bd.dependency || 0, '#ef4444')}
      </div>

      <div class="sim-section-title">
        Team Workload
        <span style="font-size:9px;font-weight:400;color:#9ca3af;text-transform:none;">(all projects combined)</span>
      </div>
      <div class="sim-workload-list">
        ${wlEntries.length === 0
          ? '<div style="color:#9ca3af;font-size:13px;">No employees assigned.</div>'
          : wlEntries.map(w => _workloadRow(w)).join('')}
      </div>

      <div class="sim-section-title">
        Recommendations
        <span class="sim-suggestion-count">${sug.length}</span>
      </div>
      <div class="sim-suggestions-list">
        ${sug.length === 0
          ? '<div class="sim-no-suggestions">✅ No issues detected — the plan looks solid!</div>'
          : sug.map(sg => _suggestionCard(sg)).join('')}
      </div>
    `;
  }

  function _dimensionBar(label, score, color) {
    const pct    = Math.round(score * 100);
    const level  = pct >= 75 ? 'Critical' : pct >= 50 ? 'High' : pct >= 30 ? 'Medium' : 'Low';
    const levelC = pct >= 75 ? '#ef4444'  : pct >= 50 ? '#f97316' : pct >= 30 ? '#f59e0b' : '#22c55e';
    return `
      <div class="sim-dim-bar-wrap">
        <div class="sim-dim-bar-header">
          <span class="sim-dim-label">${label}</span>
          <span class="sim-dim-level" style="color:${levelC}">${level} · ${pct}%</span>
        </div>
        <div class="sim-dim-track">
          <div class="sim-dim-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }

  function _workloadRow(w) {
    const bar      = Math.min(Math.round(((w.hours || 0) / 40) * 100), 100);
    const statusC  = { overloaded:'#ef4444', balanced:'#22c55e', underutilised:'#f59e0b' }[w.status] || '#6b7280';
    const initials = (w.name || '?').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();
    return `
      <div class="sim-wl-row">
        <div class="sim-wl-avatar" style="background:${statusC}20;color:${statusC}">${initials}</div>
        <div class="sim-wl-info">
          <div class="sim-wl-name">${escHtml(w.name)}</div>
          <div class="sim-wl-bar-wrap">
            <div class="sim-wl-bar-track">
              <div class="sim-wl-bar-fill" style="width:${bar}%;background:${statusC}"></div>
            </div>
            <span class="sim-wl-pct">${(w.hours || 0).toFixed(0)}h / 40h</span>
          </div>
        </div>
        <span class="sim-wl-badge" style="background:${statusC}15;color:${statusC};">${w.status}</span>
      </div>`;
  }

  function _suggestionCard(sg) {
    const pCol  = { high:'#ef4444', medium:'#f59e0b', low:'#22c55e' }[sg.priority] || '#6b7280';
    const bCol  = { reassign:'#6366f1', skill_mismatch:'#8b5cf6', unassigned:'#6b7280', deadline:'#f59e0b', dependency:'#ef4444' }[sg.type] || '#6b7280';
    let actionHtml = '';
    if ((sg.type === 'reassign' || sg.type === 'unassigned') && sg.target_employee && sg.task_id) {
      actionHtml = `
        <button class="sim-sug-action-btn"
          onclick="SimModule._applyHint(${sg.task_id}, ${sg.target_employee.id}, '${escHtml(sg.target_employee.name)}')">
          Assign to ${escHtml(sg.target_employee.name)} →
        </button>`;
    }
    return `
      <div class="sim-sug-card" style="border-left-color:${bCol};">
        <div class="sim-sug-top">
          <span class="sim-sug-icon">${sg.icon || '💬'}</span>
          <div class="sim-sug-content">
            <div class="sim-sug-title">${escHtml(sg.title)}</div>
            <div class="sim-sug-detail">${escHtml(sg.detail)}</div>
            ${actionHtml}
          </div>
          <span class="sim-sug-priority" style="color:${pCol};background:${pCol}15;">${sg.priority}</span>
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 11 – APPLY HINT
  ═══════════════════════════════════════════════════════════════ */

  function _applyHint(taskId, empId, empName) {
    const pid = _state.activeProjectId;
    const ps  = _getProjectState(pid);
    if (!ps) return;

    const idx = ps.sandboxTasks.findIndex(t => t.id === taskId);
    if (idx < 0) return;

    if (_wouldViolateLimit(empId, idx, pid, ps.sandboxTasks)) {
      _showToast(`${empName} already has 2 tasks in this project.`, 'error');
      return;
    }

    const emp = ps.employees.find(e => (e.user_id || e.id) == empId);
    ps.sandboxTasks[idx].assigned_to = emp
      ? { id: emp.user_id || emp.id, user_id: emp.user_id || emp.id, name: emp.name }
      : null;

    _markSandboxDirty();
    _renderSandboxTaskTable();
    _scheduleAnalysis(0);
    _showToast(`Task reassigned to ${empName}`, 'success');
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 12 – APPLY TO DB / DISCARD
  ═══════════════════════════════════════════════════════════════ */

  async function applySimulation() {
    const pid = _state.activeProjectId;
    const ps  = _getProjectState(pid);
    if (!pid || !ps) return;

    const violation = _checkAllTaskLimits(pid, ps.sandboxTasks);
    if (violation) { _showToast(violation, 'error'); return; }

    const applyBtn = document.getElementById('simApplyBtn');
    if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Applying…'; }

    const data = await apiPost(`/simulation/api/project/${pid}/apply/`, { tasks: ps.sandboxTasks });

    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply to Project'; }

    if (data.success) {
      ps.dirty = false;
      const discardBtn = document.getElementById('simDiscardBtn');
      if (discardBtn) discardBtn.style.display = 'none';
      _showToast(data.message + ' Changes saved.', 'success');
      if (typeof loadDashboardData === 'function') setTimeout(loadDashboardData, 1000);
    } else {
      _showToast(data.error || 'Failed to apply changes.', 'error');
    }
  }

  function discardChanges() {
    const pid = _state.activeProjectId;
    if (!confirm('Discard all simulation changes?')) return;
    delete _state.projectStates[pid];
    openProject(pid);
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 13 – SANDBOX HTML SHELL
  ═══════════════════════════════════════════════════════════════ */

  function _injectSandboxShell() {
    const page = document.getElementById('page-simulation');
    if (!page || document.getElementById('simSandboxPanel')) return;

    const shell = document.createElement('div');
    shell.innerHTML = `
      <div id="simSandboxPanel" style="display:none;flex-direction:column;gap:0;height:100%;">

        <div class="sim-sandbox-header">
          <button class="sim-back-btn" onclick="SimModule.closeSandbox()">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            All Projects
          </button>
          <div class="sim-sandbox-title-group">
            <span class="sim-sandbox-dot" id="simSandboxDot"></span>
            <span class="sim-sandbox-title" id="simSandboxProjectName">—</span>
            <span id="simSandboxMeta" style="display:flex;align-items:center;gap:6px;"></span>
          </div>
          <div class="sim-sandbox-actions">
            <button id="simDiscardBtn" class="sim-discard-btn" style="display:none;"
              onclick="SimModule.discardChanges()">Discard</button>
            <button id="simApplyBtn" class="sim-apply-btn" disabled
              onclick="SimModule.applySimulation()">Apply to Project</button>
          </div>
        </div>

        <div class="sim-sandbox-banner">
          <svg width="14" height="14" fill="none" stroke="#1d4ed8" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>Sandbox mode — edit freely. Workload bars show hours across <strong>all projects</strong>.
            Max <strong>2 tasks per employee per project</strong>.
            Nothing saves until you click <strong>Apply to Project</strong>.</span>
        </div>

        <div id="simSandboxLoader"
          style="display:flex;align-items:center;justify-content:center;padding:60px;gap:12px;color:#6b7280;">
          <div class="sim-spinner"></div><span>Loading project…</span>
        </div>

        <div id="simSandboxBody" style="display:flex;flex:1;gap:0;min-height:0;overflow:hidden;">

          <div class="sim-table-panel">
            <div class="sim-table-scroll">
              <table class="sim-task-table">
                <thead>
                  <tr>
                    <th style="min-width:180px;">Task</th>
                    <th style="min-width:180px;">Assigned To</th>
                    <th style="width:95px;">Est. Hours</th>
                    <th style="width:130px;">Due Date</th>
                    <th style="width:80px;">Priority</th>
                    <th style="width:120px;">Status</th>
                    <th style="width:120px;">Risk</th>
                  </tr>
                </thead>
                <tbody id="simTaskTableBody"></tbody>
              </table>
            </div>
          </div>

          <div class="sim-analysis-panel">
            <div class="sim-analysis-header">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              Live Risk Analysis
            </div>
            <div id="simAnalysisLoader"
              style="display:flex;align-items:center;gap:10px;padding:24px;color:#6b7280;">
              <div class="sim-spinner"></div><span>Analysing…</span>
            </div>
            <div id="simAnalysisBody" style="display:none;padding:0 20px 20px;overflow-y:auto;"></div>
          </div>

        </div>
      </div>`;
    page.appendChild(shell.firstElementChild);
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 14 – CSS
  ═══════════════════════════════════════════════════════════════ */

  function _injectStyles() {
    if (document.getElementById('simStyles')) return;
    const s = document.createElement('style');
    s.id = 'simStyles';
    s.textContent = `
    .sim-proj-card {
      display:flex;background:#fff;border:1px solid #e5e7eb;border-radius:14px;
      margin-bottom:16px;overflow:hidden;transition:box-shadow .15s;
    }
    .sim-proj-card:hover { box-shadow:0 4px 20px rgba(0,0,0,.08); }
    .sim-proj-card-accent { width:5px;flex-shrink:0; }
    .sim-proj-card-body { flex:1;padding:16px 20px; }
    .sim-proj-card-header { display:flex;align-items:flex-start;justify-content:space-between;gap:16px; }
    .sim-proj-info { display:flex;align-items:flex-start;gap:10px; }
    .sim-proj-dot { width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:4px; }
    .sim-proj-name { font-size:15px;font-weight:700;color:#1a1d2e;margin-bottom:4px; }
    .sim-proj-meta { display:flex;align-items:center;flex-wrap:wrap;gap:8px; }
    .sim-proj-stat,.sim-deadline-display { font-size:11px;color:#6b7280; }
    .sim-badge-priority {
      font-size:10px;font-weight:700;padding:2px 7px;
      border-radius:20px;border:1px solid transparent;text-transform:capitalize;
    }
    .sim-launch-btn {
      display:inline-flex;align-items:center;gap:6px;padding:8px 16px;
      background:#6366f1;color:#fff;border:none;border-radius:8px;
      font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;
    }
    .sim-launch-btn:hover { background:#4f46e5; }
    .sim-expand-btn {
      display:inline-flex;align-items:center;gap:5px;padding:7px 12px;
      background:#fff;color:#374151;border:1px solid #e5e7eb;border-radius:8px;
      font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
    }
    .sim-expand-btn:hover { background:#f9fafb; }
    .sim-proj-progress-row { display:flex;align-items:center;gap:10px;margin-top:12px; }
    .sim-proj-progress-bar { flex:1;height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden; }
    .sim-proj-progress-fill { height:100%;border-radius:3px;transition:width .4s; }
    .sim-proj-pct { font-size:11px;color:#6b7280;min-width:30px; }
    .sim-empty-state { text-align:center;padding:60px 20px;color:#6b7280; }
    .sim-empty-icon { font-size:48px;margin-bottom:12px; }
    .sim-empty-title { font-size:16px;font-weight:600;color:#374151;margin-bottom:6px; }
    /* Inline editor */
    .sim-inline-wrap { border-top:1px solid #f3f4f6;padding-top:14px; }
    .sim-inline-loading { display:flex;align-items:center;gap:8px;padding:20px;color:#9ca3af;font-size:13px; }
    .sim-inline-empty { padding:16px;color:#9ca3af;font-size:13px;font-style:italic; }
    .sim-inline-info {
      display:flex;align-items:center;gap:7px;padding:8px 12px;
      background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;
      font-size:11px;color:#1d4ed8;margin-bottom:10px;
    }
    .sim-inline-deadline-row {
      display:flex;align-items:center;gap:8px;padding:8px 0 10px;font-size:12px;flex-wrap:wrap;
    }
    .sim-inline-deadline-label { font-weight:600;color:#374151; }
    .sim-inline-deadline-hint { font-size:10px;color:#9ca3af;font-style:italic; }
    .sim-deadline-input { max-width:150px; }
    .sim-inline-wl-strip {
      display:flex;gap:10px;flex-wrap:wrap;padding:8px 0 12px;
      border-bottom:1px solid #f3f4f6;margin-bottom:12px;
    }
    .sim-inline-wl-chip {
      display:flex;align-items:center;gap:6px;padding:5px 8px;
      background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;cursor:help;
    }
    .sim-inline-wl-avatar {
      width:26px;height:26px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;
    }
    .sim-inline-wl-bar-track { width:50px;height:4px;background:#e5e7eb;border-radius:2px;margin-top:2px; }
    .sim-inline-wl-bar-fill { height:100%;border-radius:2px;transition:width .3s; }
    .sim-inline-table-wrap { overflow-x:auto; }
    .sim-inline-row { border-bottom:1px solid #f3f4f6;transition:background .1s; }
    .sim-inline-row:hover { background:#fafafa; }
    .sim-inline-actions {
      display:flex;align-items:center;justify-content:flex-end;gap:8px;
      padding-top:12px;margin-top:4px;border-top:1px solid #f3f4f6;
    }
    /* Shared table */
    .sim-task-table { width:100%;border-collapse:collapse;font-size:12.5px; }
    .sim-task-table thead th {
      text-align:left;font-size:10px;font-weight:700;color:#6b7280;
      text-transform:uppercase;letter-spacing:.5px;padding:10px 14px;
      background:#fafafa;border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:1;
    }
    .sim-task-table td { padding:8px 14px;vertical-align:middle; }
    .sim-task-row,.sim-inline-row { border-bottom:1px solid #f3f4f6;transition:background .1s; }
    .sim-task-row:hover { background:#fafafa; }
    .sim-td-task { padding:10px 14px; }
    .sim-task-title { font-weight:600;color:#1a1d2e;margin-bottom:2px; }
    .sim-task-desc { font-size:11px;color:#9ca3af; }
    .sim-select {
      border:1px solid #e5e7eb;border-radius:7px;padding:5px 8px;
      font-size:12px;color:#374151;background:#fff;width:100%;cursor:pointer;font-family:inherit;
    }
    .sim-select:focus { outline:none;border-color:#6366f1; }
    .sim-select option:disabled { color:#d1d5db; }
    .sim-input-hours {
      border:1px solid #e5e7eb;border-radius:7px;padding:5px 8px;
      font-size:12px;color:#374151;width:70px;font-family:inherit;
    }
    .sim-input-hours:focus { outline:none;border-color:#6366f1; }
    .sim-input-date {
      border:1px solid #e5e7eb;border-radius:7px;padding:5px 8px;
      font-size:12px;color:#374151;font-family:inherit;width:130px;
    }
    .sim-input-date:focus { outline:none;border-color:#6366f1; }
    .sim-sandbox-deadline { width:140px;font-size:12px; }
    .sim-badge-priority { font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;text-transform:capitalize; }
    .sim-badge-high   { background:#fee2e2;color:#dc2626; }
    .sim-badge-medium { background:#fef3c7;color:#d97706; }
    .sim-badge-low    { background:#dcfce7;color:#16a34a; }
    .sim-risk-cell { display:flex;align-items:center; }
    .sim-risk-badge {
      font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;
      border:1px solid;letter-spacing:.3px;white-space:nowrap;cursor:help;
    }
    .sim-risk-pending { color:#d1d5db;font-size:12px; }
    /* Sandbox */
    .sim-sandbox-header {
      display:flex;align-items:center;gap:12px;padding:14px 24px;
      background:#fff;border-bottom:1px solid #e5e7eb;flex-shrink:0;
    }
    .sim-back-btn {
      display:inline-flex;align-items:center;gap:6px;padding:6px 12px;
      border:1px solid #e5e7eb;border-radius:8px;background:#fff;
      color:#374151;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
    }
    .sim-back-btn:hover { background:#f9fafb; }
    .sim-sandbox-title-group { display:flex;align-items:center;gap:8px;flex:1;min-width:0; }
    .sim-sandbox-dot { width:10px;height:10px;border-radius:50%;flex-shrink:0; }
    .sim-sandbox-title { font-size:15px;font-weight:700;color:#1a1d2e; }
    .sim-sandbox-actions { display:flex;align-items:center;gap:8px; }
    .sim-apply-btn {
      padding:8px 18px;background:#6366f1;color:#fff;border:none;
      border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;
    }
    .sim-apply-btn:disabled { opacity:.5;cursor:not-allowed; }
    .sim-apply-btn:not(:disabled):hover { background:#4f46e5; }
    .sim-discard-btn {
      padding:8px 14px;background:#fff;color:#ef4444;
      border:1px solid #fca5a5;border-radius:8px;font-size:12px;font-weight:600;
      cursor:pointer;font-family:inherit;
    }
    .sim-discard-btn:hover { background:#fef2f2; }
    .sim-sandbox-banner {
      display:flex;align-items:center;gap:8px;background:#eff6ff;
      border-bottom:1px solid #bfdbfe;padding:9px 24px;font-size:12px;color:#1d4ed8;flex-shrink:0;
    }
    .sim-table-panel {
      flex:1;overflow:hidden;display:flex;flex-direction:column;border-right:1px solid #e5e7eb;
    }
    .sim-table-scroll { overflow:auto;flex:1; }
    .sim-analysis-panel {
      width:360px;flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;background:#fafafa;
    }
    .sim-analysis-header {
      display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#374151;
      text-transform:uppercase;letter-spacing:.5px;padding:14px 20px;
      border-bottom:1px solid #e5e7eb;flex-shrink:0;background:#fff;
    }
    .sim-analysis-error { color:#ef4444;font-size:13px;padding:20px; }
    #simAnalysisBody { flex:1;overflow-y:auto; }
    /* Analysis content */
    .sim-summary-strip { display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:16px 0 8px; }
    .sim-summary-card {
      background:#fff;border:1px solid #e5e7eb;border-radius:10px;
      padding:12px;display:flex;align-items:center;gap:10px;
    }
    .sim-summary-risk { grid-column:1/-1; }
    .sim-summary-label { font-size:11px;color:#6b7280;margin-bottom:2px; }
    .sim-summary-val { font-size:18px;font-weight:800;color:#1a1d2e; }
    .sim-summary-icon {
      width:36px;height:36px;border-radius:8px;
      display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;
    }
    .sim-summary-ring { position:relative;width:52px;height:52px;flex-shrink:0; }
    .sim-ring-svg { width:52px;height:52px;transform:rotate(-90deg); }
    .sim-ring-val {
      position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      font-size:11px;font-weight:800;
    }
    .sim-section-title {
      font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;
      letter-spacing:.5px;padding:14px 0 8px;display:flex;align-items:center;gap:8px;
    }
    .sim-dimension-grid { display:flex;flex-direction:column;gap:10px;margin-bottom:4px; }
    .sim-dim-bar-header { display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px; }
    .sim-dim-label { color:#374151;font-weight:600; }
    .sim-dim-level { font-weight:700; }
    .sim-dim-track { height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden; }
    .sim-dim-fill { height:100%;border-radius:3px;transition:width .5s cubic-bezier(.4,0,.2,1); }
    .sim-workload-list { display:flex;flex-direction:column;gap:8px;margin-bottom:4px; }
    .sim-wl-row { display:flex;align-items:center;gap:10px; }
    .sim-wl-avatar {
      width:32px;height:32px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;
    }
    .sim-wl-info { flex:1;min-width:0; }
    .sim-wl-name { font-size:12px;font-weight:600;color:#1a1d2e;margin-bottom:3px; }
    .sim-wl-bar-wrap { display:flex;align-items:center;gap:8px; }
    .sim-wl-bar-track { flex:1;height:5px;background:#f3f4f6;border-radius:3px;overflow:hidden; }
    .sim-wl-bar-fill { height:100%;border-radius:3px;transition:width .4s; }
    .sim-wl-pct { font-size:10px;color:#9ca3af;white-space:nowrap; }
    .sim-wl-badge { font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;text-transform:capitalize; }
    .sim-suggestion-count { background:#6366f1;color:#fff;border-radius:20px;font-size:10px;font-weight:700;padding:1px 7px; }
    .sim-suggestions-list { display:flex;flex-direction:column;gap:8px; }
    .sim-no-suggestions {
      background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;
      padding:14px;font-size:13px;color:#16a34a;font-weight:600;
    }
    .sim-sug-card {
      background:#fff;border:1px solid #e5e7eb;border-left:3px solid;
      border-radius:10px;padding:12px 14px;transition:box-shadow .12s;
    }
    .sim-sug-card:hover { box-shadow:0 2px 8px rgba(0,0,0,.06); }
    .sim-sug-top { display:flex;gap:10px;align-items:flex-start; }
    .sim-sug-icon { font-size:16px;flex-shrink:0;margin-top:1px; }
    .sim-sug-content { flex:1;min-width:0; }
    .sim-sug-title { font-size:12px;font-weight:700;color:#1a1d2e;margin-bottom:4px; }
    .sim-sug-detail { font-size:11px;color:#6b7280;line-height:1.5; }
    .sim-sug-action-btn {
      display:inline-flex;align-items:center;margin-top:8px;padding:4px 10px;
      background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:6px;
      font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;
    }
    .sim-sug-action-btn:hover { background:#dbeafe; }
    .sim-sug-priority {
      font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;
      text-transform:uppercase;flex-shrink:0;align-self:flex-start;
    }
      .sim-delete-task-btn {
      background:none;border:1px solid #fca5a5;border-radius:6px;
      width:28px;height:28px;display:inline-flex;align-items:center;
      justify-content:center;cursor:pointer;color:#ef4444;
      transition:background .15s;
    }
    .sim-delete-task-btn:hover { background:#fef2f2; 
    }
    .sim-spinner {
      width:18px;height:18px;border:2px solid #e5e7eb;
      border-top-color:#6366f1;border-radius:50%;animation:simSpin .7s linear infinite;
    }
    @keyframes simSpin { to { transform:rotate(360deg); } }
    .sim-toast {
      position:fixed;bottom:24px;right:24px;z-index:9999;
      padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;color:#fff;
      opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s;pointer-events:none;
    }
    .sim-toast-show { opacity:1;transform:translateY(0); }
    .sim-toast-success { background:#16a34a; }
    .sim-toast-error   { background:#dc2626; }
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 15 – TOAST + UTIL
  ═══════════════════════════════════════════════════════════════ */

  function _showToast(msg, type = 'success') {
    if (typeof showNotification === 'function') { showNotification(msg, type); return; }
    const t = document.createElement('div');
    t.className = `sim-toast sim-toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('sim-toast-show'), 10);
    setTimeout(() => { t.classList.remove('sim-toast-show'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ═══════════════════════════════════════════════════════════════
     SECTION 16 – INIT + PUBLIC API
  ═══════════════════════════════════════════════════════════════ */

  function init() {
    _injectStyles();
    _injectSandboxShell();
    renderProjectCards();
  }

  return {
    init,
    renderProjectCards,
    toggleExpand,
    openProject,
    closeSandbox,
    applySimulation,
    discardChanges,
    _onInlineAssignee,
    _onInlineHours,
    _onInlineDueDate,
    _onInlineStatus,
    _onDeadlineChange,
    _discardInline,
    _applyInline,
    _onSandboxAssignee,
    _onSandboxHours,
    _onSandboxDueDate,
    _onSandboxStatus,
    _onSandboxDeadline,
    _applyHint,
    _deleteTask,
  };

})();

/* ── Hook into manager.js ───────────────────────────────────── */
function updateSimulationPage() {
  SimModule.init();
}