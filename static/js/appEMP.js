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
            done: t.status === 'completed',
            project: t.project,
            is_overdue: t.is_overdue,
            has_pending_dependencies: t.has_pending_dependencies
        }));
        
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
    
    const recentTasksList = document.getElementById('recentTasksList');
    if (recentTasksList && employeeData.recent_tasks) {
        recentTasksList.innerHTML = employeeData.recent_tasks.map(t => `
            <div class="task-item" onclick="viewTaskDetails(${t.id})">
                <div class="task-item-title">${t.title}</div>
                <div class="task-item-meta">
                    <span class="task-priority priority-${t.priority}">${t.priority}</span>
                    <span class="task-status status-${t.status}">${STATUS_MAP[t.status] || t.status}</span>
                </div>
                ${t.has_pending_dependencies ? '<span class="badge-warning">⛔ Blocked</span>' : ''}
            </div>
        `).join('');
    }
}

function updateHomeCharts() {
    const statusCtx = document.getElementById('statusChart');
    if (statusCtx && statusCtx._chartInstance) {
        statusCtx._chartInstance.destroy();
    }
    
    if (statusCtx) {
        statusCtx._chartInstance = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: ['In Progress', 'Done'],
                datasets: [{
                    data: [
                        employeeData.in_progress_tasks || 1,
                        employeeData.completed_tasks || 1
                    ],
                    backgroundColor: ['#6366f1', '#22c55e'],
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
    
    const priorityCtx = document.getElementById('priorityChart');
    if (priorityCtx && priorityCtx._chartInstance) {
        priorityCtx._chartInstance.destroy();
    }
    
    if (priorityCtx) {
        priorityCtx._chartInstance = new Chart(priorityCtx, {
            type: 'bar',
            data: {
                labels: ['High', 'Medium', 'Low'],
                datasets: [{
                    data: [
                        employeeData.high_priority_tasks || 0,
                        employeeData.medium_priority_tasks || 0,
                        employeeData.low_priority_tasks || 0
                    ],
                    backgroundColor: ['#6366f1', '#8b5cf6', '#a78bfa'],
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
                        <span>Due date</span>
                        <span>Priority</span>
                        <span>Status</span>
                        <span>Actions</span>
                    </div>
                    ${groupTasks.map(t => `
                        <div class="task-row" data-id="${t.id}">
                            <div class="task-name-cell">
                                <div class="task-checkbox ${t.done ? 'done' : ''}" onclick="toggleDone(${t.id})"></div>
                                <span class="task-name ${t.done ? 'done' : ''}">${t.name}</span>
                                ${t.has_pending_dependencies ? '<span class="badge-warning" title="Has pending dependencies">⛔</span>' : ''}
                            </div>
                            <div class="project-cell">${t.project || '-'}</div>
                            <div class="due-date ${isOverdue(t.due) && !t.done ? 'overdue' : ''}">${t.due}</div>
                            <div><span class="badge ${t.priority}">${t.priority}</span></div>
                            <div>
                                <span class="status-badge status-${t.status}">${t.status}</span>
                            </div>
                            <div>
                                <button class="btn-icon" onclick="updateTaskStatus(${t.id}, 'in_progress')" title="Start task" ${t.status === 'in_progress' || t.status === 'completed' ? 'disabled' : ''}>
                                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                        <polygon points="5 3 19 12 5 21 5 3"/>
                                    </svg>
                                </button>
                                <button class="btn-icon" onclick="updateTaskStatus(${t.id}, 'completed')" title="Complete" ${t.status === 'completed' ? 'disabled' : ''}>
                                    <svg width="14" height="14" fill="none" stroke="#22c55e" stroke-width="2" viewBox="0 0 24 24">
                                        <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                </button>
                                <button class="btn-icon" onclick="logHours(${t.id})" title="Log hours">
                                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `).join('')}
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
    if (task) {
        const newStatus = task.done ? 'in_progress' : 'completed';
        updateTaskStatus(id, newStatus);
    }
}

// ── TASK ACTIONS ────────────────────────────────────
function updateTaskStatus(taskId, newStatus) {
    // Only allow these status changes from employee
    if (newStatus !== 'in_progress' && newStatus !== 'completed') {
        showNotification('Invalid status change', 'error');
        return;
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
    const metricVals = document.querySelectorAll('.metric-val');
    if (metricVals.length >= 2) {
        metricVals[0].textContent = workloadData.total_hours + 'h';
        metricVals[1].textContent = (workloadData.workload_percentage || 0) + '%';
    }
    
    const metricSubs = document.querySelectorAll('.metric-sub');
    if (metricSubs.length >= 2) {
        metricSubs[0].textContent = workloadData.capacity + 'h capacity';
        
        let status = 'Balanced';
        let statusColor = '#22c55e';
        const percent = workloadData.workload_percentage || 0;
        
        if (percent > 100) {
            status = 'Overloaded';
            statusColor = '#ef4444';
        } else if (percent > 80) {
            status = 'Busy';
            statusColor = '#f59e0b';
        } else if (percent < 50) {
            status = 'Underutilized';
            statusColor = '#3b82f6';
        }
        
        metricSubs[1].textContent = status;
        metricSubs[1].style.color = statusColor;
    }
    
    const progressBar = document.querySelector('.capacity-card .progress-fill');
    if (progressBar) {
        progressBar.style.width = Math.min(workloadData.workload_percentage || 0, 100) + '%';
    }
}

function renderWorkloadChart() {
    const canvas = document.getElementById('workloadChart');
    if (!canvas) return;
    
    if (canvas._chartInstance) {
        canvas._chartInstance.destroy();
    }

    const projectData = workloadData.project_workload || [];
    
    canvas._chartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: projectData.map(p => p.project),
            datasets: [{
                data: projectData.map(p => p.hours),
                backgroundColor: projectData.map(p => p.color || '#3b82f6'),
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            plugins: { 
                legend: { display: false }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                y: { beginAtZero: true, grid: { color: '#f3f4f6' } }
            }
        }
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