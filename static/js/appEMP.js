/* ══════════════════════════════════════
   Worklytics – Employee Dashboard JS
   ══════════════════════════════════════ */

// ── CSRF TOKEN HELPER ─────────────────────────────────
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// ── DATA STATE ──────────────────────────────────────
let tasks = [];
let employeeData = {};
let workloadData = {};

const GROUPS = ['To do', 'Doing', 'Done'];
const STATUS_MAP = {
    'todo': 'To do',
    'in_progress': 'Doing',
    'completed': 'Done',
    'blocked': 'Blocked'
};

// ── INITIALIZE ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    const now = new Date();
    const dateElement = document.getElementById('todayDate');
    if (dateElement) {
        dateElement.textContent = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
    }
    
    loadDashboardData();
});

// ── SIDEBAR PROJECTS ────────────────────────────────
function renderSidebarProjects(allTasks) {
    const container = document.getElementById('sidebarProjectsList');
    if (!container) return;

    if (!allTasks || allTasks.length === 0) {
        container.innerHTML = '<p style="color:#6b7280;font-size:12px;padding:6px 10px;">No projects yet</p>';
        return;
    }

    // Group tasks by project name
    const grouped = {};
    allTasks.forEach(t => {
        if (t.status === 'completed' || t.status === 'blocked') return;
        const pname = t.project || 'Unknown';
        if (!grouped[pname]) grouped[pname] = [];
        grouped[pname].push(t.title);
    });

    const dotColors = ['#6366f1','#22c55e','#f59e0b','#06b6d4','#ef4444','#8b5cf6'];

    container.innerHTML = Object.entries(grouped).map(([project, taskTitles], idx) => {
        const color = dotColors[idx % dotColors.length];
        return `
            <div class="sidebar-project-group">
                <div class="sidebar-project-entry">
                    <span class="sidebar-project-dot" style="background:${color};"></span>
                    <span class="sidebar-project-label">${project}</span>
                </div>
                <div class="sidebar-task-list">
                    ${taskTitles.map(title => `
                        <div class="sidebar-task-item">
                            <span class="sidebar-task-dash">—</span>
                            <span class="sidebar-task-name">${title}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// ── LOAD ALL DASHBOARD DATA ─────────────────────────
function loadDashboardData() {
    fetch('/core/api/employee/dashboard/', {
        credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
        employeeData = data;
        
        tasks = (data.all_tasks || []).map(t => ({
            id: t.id,
            name: t.title,
            assignee: data.employee_name || 'You',
            initials: data.employee_initials || 'US',
            due: t.due_date,
            priority: t.priority,
            status: STATUS_MAP[t.status] || t.status,
            rawStatus: t.status,
            done: t.status === 'completed',
            project: t.project,
            manager: t.manager || '—',
            estimated_hours: t.estimated_hours || 0,
            actual_hours: t.actual_hours ?? null,
            is_overdue: t.is_overdue,
            has_pending_dependencies: t.has_pending_dependencies
        }));
        
        renderSidebarProjects(data.all_tasks || []);

        updateHomePage();

        const activePage = document.querySelector('.page.active')?.id;
        if (activePage === 'page-tasks') renderTasks();
        if (activePage === 'page-workload') renderWorkloadPage();
    })
    .catch(error => {
        console.error('Error loading dashboard data:', error);
        useMockData();
    });
}

function useMockData() {
    tasks = [
        { id: 1, name: 'Data warehouse design', assignee: 'Emily', initials: 'ER', due: '2026-03-10', priority: 'high', status: 'To do', done: false, project: 'Analytics' },
        { id: 2, name: 'Implement authentication module', assignee: 'Emily', initials: 'ER', due: '2026-02-28', priority: 'high', status: 'Doing', done: false, project: 'Auth' },
        { id: 3, name: 'API gateway setup', assignee: 'Emily', initials: 'ER', due: '2026-02-10', priority: 'high', status: 'Done', done: true, project: 'API' },
    ];
    
    employeeData = {
        employee_name: 'Emily Rodriguez',
        employee_initials: 'ER',
        total_tasks: 3,
        in_progress_tasks: 1,
        completed_tasks: 1,
        overdue_tasks: 0,
        completion_rate: 33,
        estimated_hours: 120,
        actual_hours: 45,
        high_priority_tasks: 2,
        medium_priority_tasks: 1,
        low_priority_tasks: 0
    };
    
    updateHomePage();
    renderTasks();
}

// ── UPDATE HOME PAGE ────────────────────────────────
function updateHomePage() {
    const pvals = document.querySelectorAll('.pval');
    if (pvals.length >= 4) {
        pvals[0].textContent = employeeData.total_tasks || 0;
        pvals[1].textContent = employeeData.in_progress_tasks || 0;
        pvals[2].textContent = employeeData.overdue_tasks || 0;
        pvals[3].textContent = (employeeData.completion_rate || 0) + '%';
    }
    
    const tvals = document.querySelectorAll('.tval');
    if (tvals.length >= 3) {
        tvals[0].textContent = (employeeData.estimated_hours || 0) + 'h';
        tvals[1].textContent = (employeeData.actual_hours || 0) + 'h';
        tvals[2].textContent = (employeeData.variance_hours || 0) + 'h';
    }
    
    updateHomeCharts();

    // Update status legend to match all 4 statuses
    const legendEl = document.querySelector('.status-legend');
    if (legendEl) {
        legendEl.innerHTML = `
            <span><span class="legend-dot" style="background:#d1d5db;"></span> To Do</span>
            <span><span class="legend-dot" style="background:#6366f1;"></span> In Prog</span>
            <span><span class="legend-dot" style="background:#22c55e;"></span> Done</span>
            <span><span class="legend-dot" style="background:#f59e0b;"></span> Blocked</span>
        `;
    }
    
    const recentTasksList = document.getElementById('recentTasksList');
    if (recentTasksList && employeeData.recent_tasks) {
        if (employeeData.recent_tasks.length === 0) {
            recentTasksList.innerHTML = '<div class="recent-empty">No tasks yet.</div>';
        } else {
            recentTasksList.innerHTML = employeeData.recent_tasks.map(t => {
                const statusLabel = STATUS_MAP[t.status] || t.status;
                const statusKey   = t.status; // raw key e.g. 'in_progress'
                return `
                <div class="recent-task-row" onclick="showPage('tasks')">
                    <div class="recent-task-left">
                        <span class="recent-dot priority-dot-${t.priority}"></span>
                        <span class="recent-task-name">${t.title}</span>
                        ${t.has_pending_dependencies ? '<span class="recent-blocked-badge">⛔</span>' : ''}
                    </div>
                    <div class="recent-task-right">
                        <span class="recent-project">${t.project || ''}</span>
                        <span class="recent-status-pill status-pill-${statusKey}">${statusLabel}</span>
                        <span class="recent-priority-pill priority-pill-${t.priority}">${t.priority}</span>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

function updateHomeCharts() {
    // ── Status Donut: Todo + In Progress + Completed + Blocked ──
    const statusCtx = document.getElementById('statusChart');
    if (statusCtx && statusCtx._chartInstance) statusCtx._chartInstance.destroy();

    if (statusCtx) {
        const todo       = employeeData.total_tasks
                           - (employeeData.in_progress_tasks || 0)
                           - (employeeData.completed_tasks   || 0)
                           - (employeeData.blocked_tasks     || 0);
        const inProgress = employeeData.in_progress_tasks || 0;
        const completed  = employeeData.completed_tasks   || 0;
        const blocked    = employeeData.blocked_tasks     || 0;

        const hasData = (todo + inProgress + completed + blocked) > 0;

        statusCtx._chartInstance = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: ['To Do', 'In Progress', 'Completed', 'Blocked'],
                datasets: [{
                    data: hasData
                        ? [todo, inProgress, completed, blocked]
                        : [1, 0, 0, 0],
                    backgroundColor: ['#d1d5db', '#6366f1', '#22c55e', '#f59e0b'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                cutout: '72%',
                plugins: { legend: { display: false } },
                responsive: false
            }
        });
    }

    // ── Priority Bar ──
    const priorityCtx = document.getElementById('priorityChart');
    if (priorityCtx && priorityCtx._chartInstance) priorityCtx._chartInstance.destroy();

    if (priorityCtx) {
        priorityCtx._chartInstance = new Chart(priorityCtx, {
            type: 'bar',
            data: {
                labels: ['High', 'Medium', 'Low'],
                datasets: [{
                    data: [
                        employeeData.high_priority_tasks   || 0,
                        employeeData.medium_priority_tasks || 0,
                        employeeData.low_priority_tasks    || 0
                    ],
                    backgroundColor: ['#ef4444', '#f59e0b', '#22c55e'],
                    borderRadius: 4,
                    borderSkipped: false
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false, beginAtZero: true }
                }
            }
        });
    }
}

// ── NAVIGATION ──────────────────────────────────────
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-link[id^="nav-"]').forEach(l => l.classList.remove('active'));
    
    const pageElement = document.getElementById('page-' + page);
    if (pageElement) pageElement.classList.add('active');
    
    const navBtn = document.getElementById('nav-' + page);
    if (navBtn) navBtn.classList.add('active');
    
    if (page === 'tasks') renderTasks();
    if (page === 'workload') renderWorkloadPage();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

// ── PROFILE DROPDOWN ────────────────────────────────
function toggleProfile() {
    document.getElementById('profileDropdown').classList.toggle('open');
}

document.addEventListener('click', e => {
    const dd = document.getElementById('profileDropdown');
    if (!e.target.closest('.avatar') && !e.target.closest('.profile-dropdown')) {
        dd.classList.remove('open');
    }
});

// ── TASKS RENDER ────────────────────────────────────
function isOverdue(dateStr) {
    return dateStr && new Date(dateStr) < new Date();
}

function renderTasks() {
    const body = document.getElementById('tasksBody');
    if (!body) return;
    
    body.innerHTML = '';

    GROUPS.forEach(group => {
        const groupTasks = tasks.filter(t => t.status === group);
        const safeId = 'grp-' + group.replace(' ', '-').toLowerCase();

        const div = document.createElement('div');
        div.className = 'task-group';
        div.innerHTML = `
            <div class="task-group-header" onclick="toggleGroup('${safeId}')">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
                <h3>${group}</h3>
                <span class="task-count">${groupTasks.length}</span>
            </div>
            <div id="${safeId}">
                <div class="task-table">
                    <div class="task-table-head">
                        <span>Name</span>
                        <span>Project</span>
                        <span>Assigned By</span>
                        <span>Est. Hours</span>
                        <span>Logged Hours</span>
                        <span>Due date</span>
                        <span>Priority</span>
                        <span>Status</span>
                        <span>Actions</span>
                    </div>
                    ${groupTasks.map(t => {
                        const canStart    = t.status !== 'To do' && t.status !== 'Doing' && t.status !== 'Done' && !t.has_pending_dependencies;
                        const canComplete = t.status !== 'Done' && !t.has_pending_dependencies;
                        const canLog      = t.status === 'Doing';
                        const logTitle    = t.status === 'To do'
                            ? 'Start the task before logging hours'
                            : t.has_pending_dependencies
                                ? 'Blocked — complete dependencies first'
                                : 'Log hours';
                        return `
                        <div class="task-row" data-id="${t.id}">
                            <div class="task-name-cell">
                                <div class="task-checkbox ${t.done ? 'done' : ''}" onclick="toggleDone(${t.id})"></div>
                                <span class="task-name ${t.done ? 'done' : ''}">${t.name}</span>
                                ${t.has_pending_dependencies ? '<span class="badge-warning" title="Has pending dependencies">⛔</span>' : ''}
                            </div>
                            <div class="project-cell">${t.project || '—'}</div>
                            <div class="manager-cell">
                                <svg width="11" height="11" fill="none" stroke="#6b7280" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                                </svg>
                                ${t.manager}
                            </div>
                            <div class="hours-cell">${t.estimated_hours}h</div>
                            <div class="hours-cell logged ${t.actual_hours !== null ? 'has-logged' : 'no-logged'}">
                                ${t.actual_hours !== null ? t.actual_hours + 'h' : '—'}
                            </div>
                            <div class="due-date ${isOverdue(t.due) && !t.done ? 'overdue' : ''}">${t.due}</div>
                            <div><span class="badge ${t.priority}">${t.priority}</span></div>
                            <div>
                                <span class="status-badge status-${t.status}">${t.status}</span>
                            </div>
                            <div style="display:flex;gap:4px;align-items:center;">
                                <button class="btn-icon" onclick="updateTaskStatus(${t.id}, 'in_progress')"
                                    title="${t.has_pending_dependencies ? 'Blocked — complete dependencies first' : 'Start task'}"
                                    ${t.status === 'Doing' || t.status === 'Done' || t.has_pending_dependencies ? 'disabled' : ''}
                                    style="${t.status === 'Doing' || t.status === 'Done' || t.has_pending_dependencies ? 'opacity:0.35;cursor:not-allowed;' : ''}">
                                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                        <polygon points="5 3 19 12 5 21 5 3"/>
                                    </svg>
                                </button>
                                <button class="btn-icon" onclick="updateTaskStatus(${t.id}, 'completed')"
                                    title="${t.has_pending_dependencies ? 'Blocked — complete dependencies first' : 'Mark complete'}"
                                    ${t.status === 'Done' || t.has_pending_dependencies ? 'disabled' : ''}
                                    style="${t.status === 'Done' || t.has_pending_dependencies ? 'opacity:0.35;cursor:not-allowed;' : ''}">
                                    <svg width="14" height="14" fill="none" stroke="#22c55e" stroke-width="2" viewBox="0 0 24 24">
                                        <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                </button>
                                <button class="btn-icon" onclick="logHours(${t.id})"
                                    title="${logTitle}"
                                    ${!canLog ? 'disabled' : ''}
                                    style="${!canLog ? 'opacity:0.35;cursor:not-allowed;' : ''}">
                                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                                    </svg>
                                </button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;
        body.appendChild(div);
    });
}

function toggleGroup(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = el.style.display === 'none' ? '' : 'none';
    }
}

function toggleDone(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (!task.done) {
        updateTaskStatus(id, 'completed');
    } else {
        if (task.has_pending_dependencies) {
            showNotification('⛔ Cannot restart — complete dependencies first', 'error');
            return;
        }
        updateTaskStatus(id, 'in_progress');
    }
}

// ── TASK ACTIONS ────────────────────────────────────
function updateTaskStatus(taskId, newStatus) {
    if (newStatus !== 'in_progress' && newStatus !== 'completed') {
        showNotification('Invalid status change', 'error');
        return;
    }

    // Block start if dependencies are not yet complete
    if (newStatus === 'in_progress') {
        const task = tasks.find(t => t.id === taskId);
        if (task && task.has_pending_dependencies) {
            showNotification('⛔ Cannot start — complete dependent tasks first', 'error');
            return;
        }
    }
    
    fetch(`/core/api/tasks/${taskId}/status/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCookie('csrftoken'),
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                task.status = STATUS_MAP[newStatus] || newStatus;
                task.done = newStatus === 'completed';
            }
            renderTasks();
            showNotification('Task status updated', 'success');
        } else {
            if (data.error && data.error.includes('dependencies')) {
                showNotification('Cannot start task - pending dependencies', 'error');
            } else {
                showNotification('Error: ' + data.error, 'error');
            }
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Failed to update status', 'error');
    });
}

function logHours(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    if (task.status !== 'Doing') {
        showNotification('⏱ Start the task first before logging hours', 'error');
        return;
    }
    if (task.has_pending_dependencies) {
        showNotification('⛔ Cannot log hours — complete dependencies first', 'error');
        return;
    }
    const hours = prompt('Enter actual hours spent:');
    if (hours === null) return;
    
    const hoursNum = parseFloat(hours);
    if (isNaN(hoursNum) || hoursNum <= 0) {
        alert('Please enter a valid number');
        return;
    }
    
    fetch(`/core/api/tasks/${taskId}/hours/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCookie('csrftoken'),
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ actual_hours: hoursNum })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const t = tasks.find(t => t.id === taskId);
            if (t) t.actual_hours = hoursNum;
            renderTasks();
            showNotification(`Logged ${hoursNum} hours`, 'success');
        } else {
            showNotification('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Failed to log hours', 'error');
    });
}

function viewTaskDetails(taskId) {
    console.log('View task:', taskId);
}

// ── WORKLOAD PAGE ───────────────────────────────────
function renderWorkloadPage() {
    fetch('/core/api/employee/workload/', {
        credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
        workloadData = data;
        updateWorkloadUI();
        renderWorkloadChart();
    })
    .catch(error => {
        console.error('Error loading workload:', error);
        workloadData = {
            total_hours: 165,
            capacity: 160,
            workload_percentage: 100,
            project_workload: [
                { project: 'Customer Portal Redesign', hours: 60, color: '#3b82f6' },
                { project: 'Integration Platform', hours: 45, color: '#8b5cf6' },
                { project: 'Analytics Dashboard', hours: 60, color: '#06b6d4' }
            ]
        };
        updateWorkloadUI();
        renderWorkloadChart();
    });
}

function updateWorkloadUI() {
    const pct      = workloadData.workload_percentage || 0;
    const hours    = workloadData.total_hours         || 0;
    const capacity = workloadData.capacity            || 160;
    const onTimePct   = workloadData.on_time_percentage ?? 0;
    const onTimeCount = workloadData.on_time_count      ?? 0;
    const completedCount = workloadData.completed_task_count ?? 0;
    const efficiency  = workloadData.efficiency         ?? 0;

    // ── Metric card 1: Total Workload ──
    const el_totalHours = document.getElementById('totalWorkloadHours');
    const el_capacityHours = document.getElementById('capacityHours');
    const el_workloadProgress = document.getElementById('workloadProgress');
    if (el_totalHours)      el_totalHours.textContent    = hours + 'h';
    if (el_capacityHours)   el_capacityHours.textContent = capacity + 'h capacity';
    if (el_workloadProgress) {
        const fillPct = Math.min(pct, 100);
        el_workloadProgress.style.width = fillPct + '%';
        // colour the bar by load
        el_workloadProgress.style.background =
            pct > 100 ? 'linear-gradient(90deg,#ef4444,#f87171)' :
            pct > 80  ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' :
                        'linear-gradient(90deg,#6366f1,#8b5cf6)';
    }

    // ── Metric card 2: Utilization ──
    let utilizationStatus = 'Balanced';
    let utilizationColor  = '#22c55e';
    if (pct > 100)     { utilizationStatus = 'Overloaded';    utilizationColor = '#ef4444'; }
    else if (pct > 80) { utilizationStatus = 'Busy';          utilizationColor = '#f59e0b'; }
    else if (pct < 50) { utilizationStatus = 'Underutilized'; utilizationColor = '#3b82f6'; }

    const el_utilization       = document.getElementById('utilization');
    const el_utilizationStatus = document.getElementById('utilizationStatus');
    if (el_utilization)       el_utilization.textContent       = pct + '%';
    if (el_utilizationStatus) {
        el_utilizationStatus.textContent = utilizationStatus;
        el_utilizationStatus.style.color = utilizationColor;
    }

    // ── Metric card 3: On-Time Delivery ──
    const el_onTimePct   = document.getElementById('onTimePercentage');
    const el_onTimeCount = document.getElementById('onTimeCount');
    if (el_onTimePct)   el_onTimePct.textContent   = onTimePct + '%';
    if (el_onTimeCount) el_onTimeCount.textContent =
        completedCount === 0
            ? 'No completed tasks yet'
            : `${onTimeCount} of ${completedCount} tasks on time`;

    // ── Metric card 4: Efficiency ──
    const el_efficiency = document.getElementById('efficiency');
    if (el_efficiency) el_efficiency.textContent = efficiency + '%';

    // ── Capacity card ──
    const el_allocatedHours  = document.getElementById('allocatedHours');
    const el_workloadBadge   = document.getElementById('workloadBadge');
    const el_capacityProgress = document.getElementById('capacityProgress');
    const el_warningBox      = document.getElementById('warningBox');
    const el_warningMessage  = document.getElementById('warningMessage');

    if (el_allocatedHours)
        el_allocatedHours.textContent = `${hours}h of ${capacity}h monthly capacity`;

    if (el_workloadBadge) {
        el_workloadBadge.textContent = pct + '% Utilized';
        el_workloadBadge.style.cssText =
            `padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;color:#fff;background:${
                pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#22c55e'
            }`;
    }

    if (el_capacityProgress) {
        el_capacityProgress.style.width = Math.min(pct, 100) + '%';
        el_capacityProgress.style.background =
            pct > 100 ? 'linear-gradient(90deg,#ef4444,#f87171)' :
            pct > 80  ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' :
                        'linear-gradient(90deg,#6366f1,#8b5cf6)';
    }

    if (el_warningBox && el_warningMessage) {
        if (pct > 100) {
            el_warningBox.style.display = 'flex';
            el_warningMessage.textContent =
                `You are ${Math.round(hours - capacity)}h over capacity. Consider discussing task redistribution with your manager.`;
        } else if (pct > 80) {
            el_warningBox.style.display = 'flex';
            el_warningBox.style.background = '#fffbeb';
            el_warningBox.style.borderColor = '#fcd34d';
            el_warningBox.style.color = '#92400e';
            el_warningBox.querySelector('svg').setAttribute('stroke', '#f59e0b');
            el_warningMessage.textContent =
                `You're approaching full capacity (${pct}%). Keep an eye on your workload.`;
        } else {
            el_warningBox.style.display = 'none';
        }
    }
}

function renderWorkloadChart() {
    const canvas = document.getElementById('workloadChart');
    if (!canvas) return;
    if (canvas._chartInstance) canvas._chartInstance.destroy();

    const projectData = workloadData.project_workload || [];

    if (projectData.length === 0) {
        canvas.style.display = 'none';
        let empty = canvas.parentElement.querySelector('.chart-empty');
        if (!empty) {
            empty = document.createElement('div');
            empty.className = 'chart-empty';
            empty.style.cssText = 'text-align:center;padding:40px;color:#9ca3af;font-size:13px;';
            empty.textContent = 'No active project workload to display.';
            canvas.parentElement.appendChild(empty);
        }
        return;
    }

    canvas.style.display = '';
    const empty = canvas.parentElement.querySelector('.chart-empty');
    if (empty) empty.remove();

    const capacity = workloadData.capacity || 160;

    canvas._chartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: projectData.map(p => p.project),
            datasets: [
                {
                    label: 'Allocated Hours',
                    data: projectData.map(p => p.hours),
                    backgroundColor: projectData.map(p => (p.color || '#6366f1') + 'cc'),
                    borderColor:     projectData.map(p => p.color || '#6366f1'),
                    borderWidth: 2,
                    borderRadius: 8,
                    borderSkipped: false,
                    barPercentage: 0.55,
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1a1d2e',
                    titleColor: '#fff',
                    bodyColor: '#9ca3af',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: ctx => {
                            const h = ctx.parsed.y;
                            const share = capacity > 0 ? Math.round((h / capacity) * 100) : 0;
                            return [`  ${h}h allocated`, `  ${share}% of ${capacity}h capacity`];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 12, weight: '500' },
                        color: '#6b7280',
                        maxRotation: 0,
                    },
                    border: { display: false }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f3f4f6', drawBorder: false },
                    ticks: {
                        font: { size: 11 },
                        color: '#9ca3af',
                        callback: val => val + 'h'
                    },
                    border: { display: false },
                    // draw a dashed capacity line
                    afterDataLimits(axis) {
                        // let Chart.js auto-scale; just add 15% headroom above the tallest bar
                        axis.max = axis.max * 1.15;
                    }
                }
            },
            // capacity reference line via annotation-free approach
            animation: { duration: 600, easing: 'easeOutQuart' }
        },
        plugins: [{
            id: 'capacityLine',
            afterDraw(chart) {
                const { ctx, scales: { y }, chartArea: { left, right, top } } = chart;
                // only draw the line if capacity falls within the visible Y range
                if (capacity > y.max || capacity < y.min) return;
                const yPos = y.getPixelForValue(capacity);
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = '#ef444466';
                ctx.lineWidth = 1.5;
                ctx.moveTo(left, yPos);
                ctx.lineTo(right, yPos);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.font = '10px DM Sans, sans-serif';
                ctx.fillStyle = '#ef4444';
                ctx.fillText(`Capacity: ${capacity}h`, right - 85, yPos - 5);
                ctx.restore();
            }
        }]
    });
}

// ── NOTIFICATIONS ───────────────────────────────────
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}