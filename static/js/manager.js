/* ══════════════════════════════════════
   Worklytics – Manager Dashboard JS
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

// ── DATA STATE ────────────────────────────────────────
let projects = [];
let employees = [];
let allEmployees = [];
let allTasks = [];
let employeeWorkload = [];
let simulationActive = false;
let currentAddTaskProjectId = null;
let currentEditProjectId = null;
let currentEditTaskId = null;

// ── INITIALIZE ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    // Set current date
    const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    const now = new Date();
    const dateElement = document.getElementById('todayDate');
    if (dateElement) {
        dateElement.textContent = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
    }
    
    // Load dashboard data
    loadDashboardData();
});

// ── LOAD ALL DASHBOARD DATA ───────────────────────────
function loadDashboardData() {
    console.log('🔍 Loading dashboard data...');
    
    fetch('/core/api/manager/dashboard/', {
        credentials: 'include',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
        }
    })
    .then(response => {
        console.log('📡 Response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('📦 Full API Response:', data);
        
        if (data) {
            console.log('📁 all_projects:', data.all_projects);
            console.log('📁 all_projects length:', data.all_projects ? data.all_projects.length : 0);
            
            projects = data.all_projects || [];
            employees = data.employee_workload || [];
            allEmployees = data.all_employees || [];
            allTasks = data.all_tasks || [];
            employeeWorkload = data.employee_workload || [];
            
            console.log('✅ Projects array after assignment:', projects);
            console.log('✅ Projects count:', projects.length);
            
            updateHomePage(data);
            updateProjectsPage();
            updateWorkloadPage(data);
            updateSimulationPage();
            updatePerformancePage(data);
            
            initHomeCharts(data);
            initWorkloadCharts(data);
            initPerfCharts(data);
        }
    })
    .catch(error => {
        console.error('❌ Error loading dashboard data:', error);
        useMockData();
    });
}

function useMockData() {
    employees = [
        { name: 'Michael Chen', initials: 'MC', color: '#6366f1', tasks: 3, hours: 100, completed: 1, inProgress: 1, utilization: 63, status: 'Balanced' },
        { name: 'Emily Rodriguez', initials: 'ER', color: '#ef4444', tasks: 3, hours: 165, completed: 1, inProgress: 1, utilization: 100, status: 'Overloaded' },
        { name: 'James Wilson', initials: 'JW', color: '#06b6d4', tasks: 2, hours: 100, completed: 0, inProgress: 1, utilization: 63, status: 'Balanced' },
        { name: 'Lisa Anderson', initials: 'LA', color: '#8b5cf6', tasks: 3, hours: 120, completed: 1, inProgress: 1, utilization: 75, status: 'Balanced' },
        { name: 'David Kim', initials: 'DK', color: '#f59e0b', tasks: 3, hours: 125, completed: 1, inProgress: 1, utilization: 78, status: 'Balanced' },
    ];
    
    projects = [
        { id: 1, name: 'Customer Portal Redesign', description: 'Redesign and modernize the customer portal', priority: 'high', status: 'active', end_date: '2026-01-15', task_count: 5, progress: 20 },
        { id: 2, name: 'Mobile App Development', description: 'Develop iOS and Android mobile applications', priority: 'high', status: 'active', end_date: '2026-02-01', task_count: 4, progress: 50 },
    ];
    
    updateHomePageFromMock();
    renderProjects();
    renderEmployeeDetails();
    renderSimTable();
}

// ── NAVIGATION ──────────────────────────────────────
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-link[id^="nav-"]').forEach(l => l.classList.remove('active'));
    
    const pageElement = document.getElementById('page-' + page);
    if (pageElement) pageElement.classList.add('active');
    
    const navBtn = document.getElementById('nav-' + page);
    if (navBtn) navBtn.classList.add('active');

    if (page === 'home') initHomeCharts();
    if (page === 'projects') renderProjects();
    if (page === 'workload') renderEmployeeDetails();
    if (page === 'simulation') renderSimTable();
    if (page === 'performance') initPerfCharts();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

// ── PROFILE DROPDOWN ──────────────────────────────────
function toggleProfile() {
    document.getElementById('profileDropdown').classList.toggle('open');
}

document.addEventListener('click', e => {
    const dd = document.getElementById('profileDropdown');
    if (dd && !e.target.closest('.avatar') && !e.target.closest('.profile-dropdown')) {
        dd.classList.remove('open');
    }
});

// ── UPDATE HOME PAGE ──────────────────────────────────
function updateHomePage(data) {
    const statValues = document.querySelectorAll('.pstat-val');
    if (statValues.length >= 4) {
        statValues[0].textContent = data.active_projects || 0;
        statValues[1].textContent = data.completed_tasks || 0;
        statValues[2].textContent = data.in_progress_tasks || 0;
        statValues[3].textContent = data.total_team_members || 0;
    }
    
    const completionPct = document.querySelector('.completion-pct');
    const progressFill = document.querySelector('.progress-fill');
    if (completionPct && progressFill) {
        const rate = data.completion_rate || 0;
        completionPct.textContent = rate + '%';
        progressFill.style.width = rate + '%';
    }
    
    const recentContainer = document.querySelector('.project-list');
    if (recentContainer && data.recent_projects) {
        recentContainer.innerHTML = data.recent_projects.map(p => `
            <div class="project-row">
                <div class="project-icon">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                    </svg>
                </div>
                <div class="project-info">
                    <div class="project-name">${p.name}</div>
                    <div class="project-meta">
                        <span class="badge-inprogress">${p.status}</span> • ${p.task_count} tasks
                    </div>
                </div>
                <div class="project-progress-block">
                    <div style="font-size:11px;color:#6b7280;text-align:right;margin-bottom:4px;">
                        Progress <strong>${p.progress}%</strong>
                    </div>
                    <div class="mini-progress">
                        <div style="width:${p.progress}%;background:#6366f1;height:100%;border-radius:4px;"></div>
                    </div>
                </div>
            </div>
        `).join('') + `
            <div class="create-project-row" onclick="openNewProjectModal()">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path d="M12 5v14M5 12h14"/>
                </svg>
                Create new project
            </div>
        `;
    }
    
    const teamContainer = document.querySelector('.team-avatars');
    if (teamContainer && data.employee_workload) {
        teamContainer.innerHTML = data.employee_workload.map(e => `
            <div class="team-avatar" style="background:${e.color || '#6366f1'};" title="${e.name}">${e.initials}</div>
        `).join('') + `
            <div class="team-avatar" style="background:#374151;font-size:14px;" onclick="showPage('workload')">+</div>
        `;
    }
}

function updateHomePageFromMock() {
    const recentContainer = document.querySelector('.project-list');
    if (recentContainer) {
        recentContainer.innerHTML = projects.map(p => `
            <div class="project-row">
                <div class="project-icon">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                    </svg>
                </div>
                <div class="project-info">
                    <div class="project-name">${p.name}</div>
                    <div class="project-meta">
                        <span class="badge-inprogress">${p.status}</span> • ${p.task_count} tasks
                    </div>
                </div>
                <div class="project-progress-block">
                    <div style="font-size:11px;color:#6b7280;text-align:right;margin-bottom:4px;">
                        Progress <strong>${p.progress}%</strong>
                    </div>
                    <div class="mini-progress">
                        <div style="width:${p.progress}%;background:#6366f1;height:100%;border-radius:4px;"></div>
                    </div>
                </div>
            </div>
        `).join('') + `
            <div class="create-project-row" onclick="openNewProjectModal()">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path d="M12 5v14M5 12h14"/>
                </svg>
                Create new project
            </div>
        `;
    }
    
    const teamContainer = document.querySelector('.team-avatars');
    if (teamContainer) {
        teamContainer.innerHTML = employees.map(e => `
            <div class="team-avatar" style="background:${e.color};" title="${e.name}">${e.initials}</div>
        `).join('') + `
            <div class="team-avatar" style="background:#374151;font-size:14px;" onclick="showPage('workload')">+</div>
        `;
    }
}

// ── CHART HELPERS ─────────────────────────────────────
const chartInstances = {};

function destroyChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
}

// ── HOME PAGE CHARTS ──────────────────────────────────
function initHomeCharts(data) {
    destroyChart('weeklyActivity');
    destroyChart('taskStatus');
    destroyChart('workloadDist');
    
    const weeklyCanvas = document.getElementById('weeklyActivityChart');
    if (weeklyCanvas) {
        chartInstances['weeklyActivity'] = new Chart(weeklyCanvas, {
            type: 'bar',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                datasets: [
                    { label: 'Completed', data: [3, 5, 4, 6], backgroundColor: '#22c55e', borderRadius: 4 },
                    { label: 'Planned', data: [5, 6, 6, 7], backgroundColor: '#d1d5db', borderRadius: 4 },
                ]
            },
            options: {
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 } } }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: '#f3f4f6' } }
                }
            }
        });
    }

    const statusCanvas = document.getElementById('taskStatusChart');
    if (statusCanvas) {
        chartInstances['taskStatus'] = new Chart(statusCanvas, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'In Progress', 'Review', 'To Do'],
                datasets: [{
                    data: [
                        data.completed_tasks || 4,
                        data.in_progress_tasks || 5,
                        data.blocked_tasks || 1,
                        4
                    ],
                    backgroundColor: ['#22c55e', '#06b6d4', '#f59e0b', '#d1d5db'],
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: {
                cutout: '68%',
                plugins: { legend: { display: false } },
                responsive: false
            }
        });
    }

    const workloadCanvas = document.getElementById('workloadDistChart');
    if (workloadCanvas) {
        const members = (data.employee_workload || employees).map(e => e.name.split(' ')[0]);
        const completedData = (data.employee_workload || employees).map(e => e.completed * 20 || 0);
        const inProgressData = (data.employee_workload || employees).map(e => (e.tasks - e.completed) * 20 || 0);
        
        chartInstances['workloadDist'] = new Chart(workloadCanvas, {
            type: 'bar',
            data: {
                labels: members,
                datasets: [
                    { label: 'Completed', data: completedData, backgroundColor: '#22c55e', borderRadius: 4 },
                    { label: 'In Progress', data: inProgressData, backgroundColor: '#06b6d4', borderRadius: 4 },
                ]
            },
            options: {
                indexAxis: 'y',
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 } } }
                },
                scales: {
                    x: { stacked: false, grid: { display: false }, ticks: { font: { size: 11 } } },
                    y: { stacked: false, grid: { display: false }, ticks: { font: { size: 11 } } }
                }
            }
        });
    }
}

// ── PROJECTS PAGE ─────────────────────────────────────
function renderProjects() {
    const grid = document.getElementById('projectsGrid');
    if (!grid) {
        console.error('Projects grid not found');
        return;
    }
    
    console.log('Rendering projects. Count:', projects.length);
    
    if (projects.length === 0) {
        grid.innerHTML = '<div class="empty-state">No projects yet. Click "New Project" to create one.</div>';
        return;
    }
    
    grid.innerHTML = projects.map(p => `
        <div class="project-card" data-id="${p.id}">
            <div class="project-card-header">
                <h3>${p.name}</h3>
                <button class="project-card-menu" onclick="openProjectMenu(${p.id})">···</button>
            </div>
            <p class="project-card-description">${p.description || 'No description'}</p>
            <div class="project-card-meta">
                <span class="badge-priority priority-${p.priority}">${p.priority}</span>
                <span>Due: ${p.end_date || 'No date'}</span>
            </div>
            <div class="project-card-progress">
                <div class="progress-label">
                    <span>Progress</span>
                    <span>${p.progress || 0}%</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${p.progress || 0}%;"></div></div>
            </div>
            
            <!-- Action buttons in a single row -->
            <div class="project-card-actions" style="display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap;">
                <button class="btn-outline-sm" onclick="viewProjectTasks(${p.id})" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <polyline points="9 11 12 14 22 4"/>
                    </svg>
                    View
                </button>
                <button class="btn-outline-sm" onclick="openAddTaskModal(${p.id})" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; background: #6366f1; color: white; border-color: #6366f1;">
                    <svg width="12" height="12" fill="none" stroke="white" stroke-width="2.5" viewBox="0 0 24 24">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Add
                </button>
                <button class="btn-outline-sm" onclick="editProject(${p.id})" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                    Edit
                </button>
                <button class="btn-outline-sm" onclick="deleteProject(${p.id})" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; color:#ef4444;">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0h10"/>
                    </svg>
                    Delete
                </button>
            </div>
        </div>
    `).join('');
}

function updateProjectsPage() {
    renderProjects();
}

function viewProjectTasks(projectId) {
    console.log('🔍 View Tasks clicked for project ID:', projectId);
    
    // Show loading notification
    showNotification('Loading tasks...', 'info');
    
    // Fetch project details with tasks
    fetch(`/core/api/projects/${projectId}/`, {
        credentials: 'include',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
        }
    })
    .then(response => {
        console.log('📡 Response status:', response.status);
        console.log('📡 Response headers:', [...response.headers.entries()]);
        return response.json();
    })
    .then(data => {
        console.log('📦 Data received:', data);
        
        if (!data) {
            console.error('❌ No data received');
            showNotification('No data received from server', 'error');
            return;
        }
        
        // Create a modal to show tasks
        let tasksHtml = '<div class="tasks-list" style="max-height: 400px; overflow-y: auto;">';
        
        if (data.tasks && data.tasks.length > 0) {
            console.log(`✅ Found ${data.tasks.length} tasks`);
            data.tasks.forEach((task, index) => {
                console.log(`  Task ${index + 1}:`, task.title);
                
                // Determine status color
                let statusColor = '#6b7280';
                if (task.status === 'completed') statusColor = '#22c55e';
                if (task.status === 'in_progress') statusColor = '#06b6d4';
                if (task.status === 'blocked') statusColor = '#ef4444';
                
                tasksHtml += `
                    <div class="task-item" style="padding: 12px; border-bottom: 1px solid #eee; background: #f9fafb; margin-bottom: 8px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div><strong style="font-size: 14px;">${task.title}</strong></div>
                            <div><span style="background: ${statusColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">${task.status.replace('_', ' ')}</span></div>
                        </div>
                        <div style="font-size: 12px; color: #666; margin-top: 6px; display: flex; gap: 16px; flex-wrap: wrap;">
                            <span>👤 ${task.assigned_to ? (typeof task.assigned_to === 'object' ? task.assigned_to.name : task.assigned_to) : 'Unassigned'}</span>
                            <span>📅 Due: ${task.due_date || 'No date'}</span>
                            <span>⚡ Priority: <span style="color: ${task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#f59e0b' : '#6b7280'};">${task.priority}</span></span>
                            <span>⏱️ ${task.estimated_hours || 0}h</span>
                        </div>
                    </div>
                `;
            });
        } else {
            console.log('ℹ️ No tasks found for this project');
            tasksHtml += '<p style="text-align: center; color: #666; padding: 20px;">No tasks for this project.</p>';
        }
        tasksHtml += '</div>';
        
        // Show in a modal
        showTasksModal(data.name, tasksHtml);
    })
    .catch(error => {
        console.error('❌ Error in fetch:', error);
        console.error('Error stack:', error.stack);
        showNotification('Failed to load tasks: ' + error.message, 'error');
    });
}

function showTasksModal(projectName, tasksHtml) {
    console.log('🪟 Creating tasks modal for:', projectName);
    
    // Remove any existing task modal
    const existingModal = document.getElementById('tasks-modal');
    if (existingModal) {
        console.log('Removing existing modal');
        existingModal.remove();
    }
    
    // Create a modal
    const modal = document.createElement('div');
    modal.id = 'tasks-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = `
        display: flex !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background-color: rgba(0,0,0,0.5) !important;
        z-index: 10000 !important;
        align-items: center !important;
        justify-content: center !important;
    `;
    
    modal.innerHTML = `
        <div class="modal" style="width: 700px; max-width: 90%; max-height: 80vh; overflow-y: auto; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #f0f0f0;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${projectName} - Tasks</h3>
                <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666; padding: 0 8px;">&times;</button>
            </div>
            ${tasksHtml}
            <div class="modal-actions" style="margin-top: 20px; text-align: right;">
                <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()" style="padding: 8px 20px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer;">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    console.log('✅ Modal appended to body');
    
    // Check if modal is visible
    setTimeout(() => {
        const modalCheck = document.getElementById('tasks-modal');
        if (modalCheck) {
            console.log('Modal exists in DOM');
            console.log('Modal styles:', window.getComputedStyle(modalCheck).display);
            console.log('Modal visibility:', window.getComputedStyle(modalCheck).visibility);
        } else {
            console.log('❌ Modal not found in DOM after creation');
        }
    }, 100);
}

// ── NEW PROJECT MODAL ─────────────────────────────────
function openNewProjectModal() {
    const modal = document.getElementById('newProjectModal');
    if (modal) modal.classList.add('open');
}

function addProject(event) {
    if (event) event.preventDefault();
    
    const name = document.getElementById('newProjectName')?.value.trim();
    if (!name) { 
        alert('Please enter a project name.'); 
        return false; 
    }
    
    const form = document.getElementById('newProjectForm');
    if (!form) return false;
    
    const formData = new FormData(form);
    
    // Determine if we're creating or updating
    const url = currentEditProjectId 
        ? `/core/api/projects/${currentEditProjectId}/update/` 
        : '/core/api/projects/create/';
    
    console.log('Sending project data to:', url);
    console.log('Project data:', Object.fromEntries(formData));
    
    fetch(url, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: formData
    })
    .then(response => {
        console.log('Response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Response data:', data);
        if (data && data.success) {
            closeModal('newProjectModal');
            document.getElementById('newProjectName').value = '';
            document.getElementById('newProjectDesc').value = '';
            document.getElementById('newProjectDue').value = '';
            
            // Reset modal title and edit ID
            document.querySelector('#newProjectModal h3').textContent = 'Create New Project';
            currentEditProjectId = null;
            
            loadDashboardData();
            showNotification('Project saved successfully!', 'success');
        } else if (data) {
            showNotification('Error: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Failed to save project. Check console for details.', 'error');
    });
    
    return false;
}

// ── ADD TASK MODAL ────────────────────────────────────
function openAddTaskModal(projectId) {
    console.log('Opening add task modal for project:', projectId);
    
    // Reset edit mode
    currentEditTaskId = null;
    currentAddTaskProjectId = projectId;
    
    // Reset form
    document.getElementById('newTaskName').value = '';
    document.getElementById('newTaskDescription').value = '';
    document.getElementById('newTaskHours').value = '';
    document.getElementById('newTaskDue').value = '';
    document.getElementById('addTaskModalTitle').textContent = 'Add Task';
    
    const project = projects.find(p => p.id === projectId);
    
    // Populate employee dropdown - use allEmployees to include everyone, not just those with tasks
    const assigneeSelect = document.getElementById('newTaskAssignee');
    const dropdownSource = allEmployees.length > 0 ? allEmployees : employees;
    if (assigneeSelect && dropdownSource.length > 0) {
        assigneeSelect.innerHTML = '<option value="">-- Unassigned --</option>' + 
            dropdownSource.map(e => {
                const id = e.user_id !== undefined ? e.user_id : e.id;
                const skills = e.skills || 'No skills';
                return `<option value="${id}">${e.name} (${skills})</option>`;
            }).join('');
    }
    
    // Populate dependencies dropdown
    const depSelect = document.getElementById('newTaskDependencies');
    if (depSelect && project) {
        depSelect.innerHTML = '<option value="">Loading tasks...</option>';
        
        fetch(`/core/api/projects/${projectId}/`, {
            credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
            if (data.tasks && data.tasks.length > 0) {
                depSelect.innerHTML = data.tasks.map(t => 
                    `<option value="${t.id}">${t.title} (${t.status})</option>`
                ).join('');
            } else {
                depSelect.innerHTML = '<option value="">No existing tasks</option>';
            }
        })
        .catch(error => {
            console.error('Error loading tasks for dependencies:', error);
            depSelect.innerHTML = '<option value="">Error loading tasks</option>';
        });
    }
    
    const modal = document.getElementById('addTaskModal');
    if (modal) modal.classList.add('open');
}

function addTaskToProject(event) {
    if (event) event.preventDefault();
    
    console.log('Current project ID:', currentAddTaskProjectId);
    console.log('Current edit task ID:', currentEditTaskId);
    
    const name = document.getElementById('newTaskName')?.value.trim();
    if (!name) { 
        alert('Please enter a task name.'); 
        return false; 
    }
    
    if (!currentAddTaskProjectId) {
        showNotification('Error: No project selected', 'error');
        return false;
    }
    
    const form = document.getElementById('addTaskForm');
    if (!form) return false;
    
    const formData = new FormData(form);
    formData.append('project_id', currentAddTaskProjectId);
    
    // Add description
    const description = document.getElementById('newTaskDescription')?.value;
    if (description) {
        formData.set('description', description);
    }
    
    // Handle assigned_to - IMPORTANT FIX
    const assigneeSelect = document.getElementById('newTaskAssignee');
    const assignedTo = assigneeSelect ? assigneeSelect.value : '';
    
    console.log('Selected assignee value:', assignedTo);
    
    if (assignedTo && assignedTo !== '') {
        formData.set('assigned_to', assignedTo);
        console.log('Setting assigned_to to:', assignedTo);
    } else {
        formData.delete('assigned_to');
        console.log('No assignee selected, removing field');
    }
    
    // Handle dependencies
    const depSelect = document.getElementById('newTaskDependencies');
    if (depSelect) {
        const selectedOptions = Array.from(depSelect.selectedOptions).map(opt => opt.value);
        if (selectedOptions.length > 0) {
            formData.append('dependencies', JSON.stringify(selectedOptions));
            console.log('Selected dependencies:', selectedOptions);
        }
    }
    
    // Determine if we're creating or updating
    const url = currentEditTaskId 
        ? `/core/api/tasks/${currentEditTaskId}/update/` 
        : '/core/api/tasks/create/';
    
    console.log('Sending task data to:', url);
    console.log('Task data entries:');
    for (let pair of formData.entries()) {
        console.log(pair[0] + ':', pair[1]);
    }
    
    fetch(url, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: formData
    })
    .then(response => {
        console.log('Response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Response data:', data);
        if (data && data.success) {
            closeModal('addTaskModal');
            
            // Reset form
            document.getElementById('newTaskName').value = '';
            document.getElementById('newTaskDescription').value = '';
            document.getElementById('newTaskHours').value = '';
            document.getElementById('newTaskDue').value = '';
            
            // Reset dropdown to default
            if (assigneeSelect) assigneeSelect.value = '';
            if (depSelect) depSelect.selectedIndex = -1;
            
            // Reset modal title and edit ID
            document.getElementById('addTaskModalTitle').textContent = 'Add Task';
            currentEditTaskId = null;
            
            loadDashboardData();
            showNotification('Task saved successfully!', 'success');
        } else if (data) {
            showNotification('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Failed to save task', 'error');
    });
    
    return false;
}

// ── WORKLOAD PAGE ────────────────────────────────────
function updateWorkloadPage(data) {
    const statValues = document.querySelectorAll('.wl-stat-val');
    if (statValues.length >= 3) {
        statValues[0].textContent = data.balanced_count || 0;
        statValues[1].textContent = data.overloaded_count || 0;
        statValues[2].textContent = data.underutilized_count || 0;
    }
    
    renderEmployeeDetails();
}

function renderEmployeeDetails() {
    const container = document.getElementById('employeeDetails');
    if (!container) return;
    
    container.innerHTML = (employeeWorkload || []).map(e => `
        <div class="emp-detail">
            <div class="emp-detail-header">
                <div>
                    <div class="emp-name">${e.name}</div>
                    <div class="emp-hours">${e.task_count} tasks • ${e.hours} hours</div>
                </div>
                <span class="badge-${e.status_class || 'balanced'}">${e.status}</span>
            </div>
            <div class="emp-stats">
                <div>
                    <div class="emp-stat-label">Total Tasks</div>
                    <div class="emp-stat-val">${e.task_count}</div>
                </div>
                <div>
                    <div class="emp-stat-label">Completed</div>
                    <div class="emp-stat-val" style="color:#22c55e;">${e.completed || 0}</div>
                </div>
                <div>
                    <div class="emp-stat-label">In Progress</div>
                    <div class="emp-stat-val" style="color:#06b6d4;">${e.inProgress || 0}</div>
                </div>
                <div>
                    <div class="emp-stat-label">Utilization</div>
                    <div class="emp-stat-val" style="color:${e.utilization >= 90 ? '#ef4444' : '#22c55e'};">${e.utilization}%</div>
                </div>
            </div>
            <div class="emp-capacity-row">
                <span>Capacity Usage</span>
                <span>${e.hours}h / 160h</span>
            </div>
            <div class="emp-progress">
                <div class="emp-progress-fill" style="width:${Math.min(e.utilization, 100)}%;${e.utilization >= 90 ? 'background:#ef4444;' : ''}"></div>
            </div>
            ${e.status === 'overloaded' ? `
                <div class="emp-warning">
                    <svg width="14" height="14" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div><span>Recommendation:</span> Consider redistributing some tasks.</div>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// ── WORKLOAD CHARTS ───────────────────────────────────
function initWorkloadCharts(data) {
    destroyChart('wlHours');
    destroyChart('wlCapacity');
    destroyChart('taskCompletion');
    
    const hoursCanvas = document.getElementById('wlHoursChart');
    if (hoursCanvas) {
        const members = (data.employee_workload || employees).map(e => e.name.split(' ')[0]);
        const hoursData = (data.employee_workload || employees).map(e => e.hours);
        const colors = (data.employee_workload || employees).map(e => e.color || '#6366f1');
        
        chartInstances['wlHours'] = new Chart(hoursCanvas, {
            type: 'bar',
            data: {
                labels: members,
                datasets: [{
                    label: 'Total Hours',
                    data: hoursData,
                    backgroundColor: colors,
                    borderRadius: 4,
                    borderSkipped: false,
                }]
            },
            options: {
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 } } }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: '#f3f4f6' } }
                }
            }
        });
    }

    const capacityCanvas = document.getElementById('wlCapacityChart');
    if (capacityCanvas) {
        const members = (data.employee_workload || employees).map(e => e.name.split(' ')[0]);
        const colors = (data.employee_workload || employees).map(e => e.color || '#6366f1');
        
        chartInstances['wlCapacity'] = new Chart(capacityCanvas, {
            type: 'pie',
            data: {
                labels: members.map((m, i) => `${m}: ${(data.employee_workload || employees)[i].utilization}%`),
                datasets: [{
                    data: (data.employee_workload || employees).map(e => e.utilization),
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#fff',
                    hoverOffset: 8,
                }]
            },
            options: {
                plugins: {
                    legend: { position: 'right', labels: { font: { size: 11 }, padding: 12 } }
                },
                responsive: false
            }
        });
    }

    const completionCanvas = document.getElementById('taskCompletionChart');
    if (completionCanvas) {
        const members = (data.employee_workload || employees).map(e => e.name.split(' ')[0]);
        
        chartInstances['taskCompletion'] = new Chart(completionCanvas, {
            type: 'bar',
            data: {
                labels: members,
                datasets: [
                    { 
                        label: 'Completed', 
                        data: (data.employee_workload || employees).map(e => e.completed || 0), 
                        backgroundColor: '#22c55e', 
                        borderRadius: 4 
                    },
                    { 
                        label: 'Pending', 
                        data: (data.employee_workload || employees).map(e => (e.task_count || 0) - (e.completed || 0)), 
                        backgroundColor: '#f59e0b', 
                        borderRadius: 4 
                    },
                ]
            },
            options: {
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 } } }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: '#f3f4f6' } }
                }
            }
        });
    }
}


// ── SIMULATION PAGE ───────────────────────────────────
// Track simulation state per project
const projectSimStates = {};

function updateSimulationPage() {
    renderSimTable();
}

function renderSimTable() {
    const simCardsContainer = document.getElementById('simProjectsContainer');
    if (!simCardsContainer) return;

    if (!allTasks || allTasks.length === 0) {
        simCardsContainer.innerHTML = `
            <div class="card" style="text-align:center;color:#6b7280;padding:40px;">
                No tasks found. Create a project and add tasks first.
            </div>`;
        return;
    }

    // Group tasks by project
    const grouped = {};
    const projectMeta = {};
    allTasks.forEach((t, i) => {
        const pid = t.project?.id || 'unknown';
        const pname = t.project?.name || 'Unknown Project';
        if (!grouped[pid]) {
            grouped[pid] = [];
            projectMeta[pid] = { name: pname };
        }
        grouped[pid].push({ task: t, index: i });
    });

    // Find project color from projects array
    function getProjectColor(pid) {
        const p = projects.find(proj => proj.id == pid);
        return p?.color || '#6366f1';
    }

    simCardsContainer.innerHTML = Object.entries(grouped).map(([pid, items]) => {
        const meta = projectMeta[pid];
        const color = getProjectColor(pid);
        const isActive = projectSimStates[pid] || false;
        const taskCount = items.length;

        const rowsHtml = items.map(({ task: t, index: i }) => {
            let assignedToName = 'Unassigned';
            let isUnassigned = true;

            if (t.assigned_to) {
                isUnassigned = false;
                if (typeof t.assigned_to === 'object') {
                    assignedToName = t.assigned_to.name || 'Unknown';
                } else {
                    assignedToName = t.assigned_to;
                }
            }

            const assigneeCell = isActive
                ? `<select onchange="simChangeAssignee(${i}, this.value, ${t.id})" style="min-width:140px;">
                    <option value="">-- Unassigned --</option>
                    ${(allEmployees.length > 0 ? allEmployees : employees).map(e => {
                        const empId = e.user_id !== undefined ? e.user_id : e.id;
                        let selected = false;
                        if (t.assigned_to) {
                            if (typeof t.assigned_to === 'object') {
                                selected = (t.assigned_to.id == empId) || (t.assigned_to.user_id == empId);
                            } else {
                                selected = (t.assigned_to == empId);
                            }
                        }
                        return `<option value="${empId}" ${selected ? 'selected' : ''}>${e.name}</option>`;
                    }).join('')}
                   </select>`
                : isUnassigned
                    ? `<span style="color:#9ca3af;font-style:italic;">Unassigned</span>`
                    : `<span style="font-weight:500;color:#374151;">${assignedToName}</span>`;

            const statusCell = isActive
                ? `<select onchange="simChangeStatus(${i}, this.value, ${t.id})">
                    <option value="todo" ${t.status === 'todo' ? 'selected' : ''}>To do</option>
                    <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In progress</option>
                    <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="blocked" ${t.status === 'blocked' ? 'selected' : ''}>Blocked</option>
                   </select>`
                : `<span style="font-size:12px;color:#6b7280;">${t.status.replace('_', ' ')}</span>`;

            return `
            <tr data-id="${t.id}">
                <td style="font-weight:500;">${t.title}</td>
                <td class="assigned-cell">${assigneeCell}</td>
                <td>${t.estimated_hours}h</td>
                <td><span class="badge-priority-${t.priority}">${t.priority}</span></td>
                <td>${statusCell}</td>
                <td>
                    <button class="btn-icon" onclick="editTask(${t.id})" title="Edit task" style="background:none;border:1px solid #e5e7eb;border-radius:6px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#6b7280;margin-right:4px;">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                    </button>
                    <button class="btn-icon" onclick="deleteTask(${t.id})" title="Delete task" style="background:none;border:1px solid #e5e7eb;border-radius:6px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#ef4444;">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0h10"/></svg>
                    </button>
                </td>
            </tr>`;
        }).join('');

        return `
        <div class="sim-project-card" style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;margin-bottom:20px;overflow:hidden;">
            
            <!-- Project Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e5e7eb;background:#fafafa;">
                <div>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
                        <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
                        <span style="font-size:15px;font-weight:700;color:#1a1d2e;">${meta.name}</span>
                        <span style="background:#ede9fe;color:#5b21b6;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">${taskCount} task${taskCount !== 1 ? 's' : ''}</span>
                        ${isActive ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;display:inline-block;"></span>Simulating</span>` : ''}
                    </div>
                </div>
                <button onclick="toggleProjectSimulation('${pid}')" id="simBtn-${pid}" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border:none;border-radius:8px;background:${isActive ? '#ef4444' : '#6366f1'};color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">
                    ${isActive
                        ? `<svg width="11" height="11" fill="white" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Stop Simulation`
                        : `<svg width="11" height="11" fill="white" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start Simulation`
                    }
                </button>
            </div>

            <!-- Active banner -->
            ${isActive ? `
            <div style="display:flex;align-items:center;gap:8px;background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:10px 20px;font-size:12px;color:#1d4ed8;">
                <svg width="14" height="14" fill="none" stroke="#1d4ed8" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Simulation active — reassign tasks freely. Changes are <strong>not</strong> saved to the database.
            </div>` : ''}

            <!-- Task Table -->
            <div style="overflow-x:auto;">
                <table class="sim-table" style="width:100%;border-collapse:collapse;font-size:12.5px;">
                    <thead>
                        <tr>
                            <th style="text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#fafafa;">Task</th>
                            <th style="text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#fafafa;">Assigned to</th>
                            <th style="text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#fafafa;">Est. hours</th>
                            <th style="text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#fafafa;">Priority</th>
                            <th style="text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#fafafa;">Status</th>
                            <th style="text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#fafafa;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </div>`;
    }).join('');
}

function toggleProjectSimulation(pid) {
    projectSimStates[pid] = !projectSimStates[pid];
    renderSimTable();
}

// Keep old toggleSimulation as no-op so nothing breaks
function toggleSimulation() {}

function simChangeAssignee(index, newAssigneeId, taskId) {
    if (allTasks[index]) {
        const source = allEmployees.length > 0 ? allEmployees : employees;
        const employee = source.find(e => {
            const empId = e.user_id !== undefined ? e.user_id : e.id;
            return empId == newAssigneeId;
        });
        allTasks[index].assigned_to = employee ? { id: parseInt(newAssigneeId), name: employee.name } : null;
    }
}

function simChangeStatus(index, newStatus, taskId) {
    if (allTasks[index]) {
        allTasks[index].status = newStatus;
    }
}

// ── PERFORMANCE PAGE ──────────────────────────────────
function updatePerformancePage(data) {
    initPerfCharts(data);
}

function initPerfCharts(data) {
    destroyChart('perfDonut');
    destroyChart('perfVelocity');

    const donutCanvas = document.getElementById('perfDonutChart');
    if (donutCanvas) {
        chartInstances['perfDonut'] = new Chart(donutCanvas, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'In Progress', 'Pending'],
                datasets: [{
                    data: [
                        data.total_completed_tasks || 4,
                        data.in_progress_tasks || 5,
                        data.total_pending_tasks || 5
                    ],
                    backgroundColor: ['#22c55e', '#06b6d4', '#e5e7eb'],
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: {
                cutout: '70%',
                plugins: { legend: { display: false } },
                responsive: false,
            }
        });
    }

    const velocityCanvas = document.getElementById('perfVelocityChart');
    if (velocityCanvas) {
        chartInstances['perfVelocity'] = new Chart(velocityCanvas, {
            type: 'line',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                datasets: [{
                    label: 'Tasks Completed',
                    data: [3, 5, 4, data.total_completed_tasks || 6],
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99,102,241,0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#6366f1',
                    pointRadius: 5,
                    pointHoverRadius: 7,
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: '#f3f4f6' } }
                }
            }
        });
    }
}

// ── MODALS ────────────────────────────────────────────
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
}

function closeModalOutside(e, id) {
    if (e.target === document.getElementById(id)) closeModal(id);
}

// ── NOTIFICATIONS ────────────────────────────────────
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#22c55e' : '#ef4444'};
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

// ── PROJECT EDITING FUNCTIONS ────────────────────────────
function editProject(projectId) {
    console.log('Editing project:', projectId);
    
    const project = projects.find(p => p.id === projectId);
    if (!project) {
        console.error('Project not found:', projectId);
        return;
    }
    
    console.log('Project data:', project);
    
    // Store project ID for update
    currentEditProjectId = projectId;
    
    // Populate modal with project data
    document.getElementById('newProjectName').value = project.name;
    document.getElementById('newProjectDesc').value = project.description || '';
    document.getElementById('newProjectPriority').value = project.priority;
    
    // Format date for input field (YYYY-MM-DD)
    if (project.end_date) {
        let dateStr = project.end_date;
        // If it's in format "Mar 01, 2026", convert to YYYY-MM-DD
        if (typeof project.end_date === 'string' && project.end_date.includes(',')) {
            try {
                const date = new Date(project.end_date);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                dateStr = `${year}-${month}-${day}`;
            } catch (e) {
                console.error('Date parsing error:', e);
            }
        } else if (typeof project.end_date === 'string' && project.end_date.includes('-')) {
            // Already in YYYY-MM-DD format
            dateStr = project.end_date;
        }
        document.getElementById('newProjectDue').value = dateStr;
    }
    
    // Change modal title
    document.querySelector('#newProjectModal h3').textContent = 'Edit Project';
    
    // Show modal
    document.getElementById('newProjectModal').classList.add('open');
}

function deleteProject(projectId) {
    console.log('Deleting project:', projectId);
    
    if (!confirm('Are you sure you want to delete this project? All tasks will also be deleted.')) {
        return;
    }
    
    fetch(`/core/api/projects/${projectId}/delete/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include'
    })
    .then(response => {
        console.log('Delete response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Delete response data:', data);
        if (data.success) {
            showNotification('Project deleted successfully', 'success');
            loadDashboardData();
        } else {
            showNotification('Error: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Error deleting project:', error);
        showNotification('Failed to delete project', 'error');
    });
}

// ── TASK EDITING FUNCTIONS ────────────────────────────
function editTask(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) {
        console.error('Task not found:', taskId);
        return;
    }
    
    console.log('Editing task:', task);
    
    // Store task ID for update
    currentEditTaskId = taskId;
    currentAddTaskProjectId = task.project.id;
    
    // Populate modal with task data
    document.getElementById('newTaskName').value = task.title;
    document.getElementById('newTaskDescription').value = task.description || '';
    document.getElementById('newTaskPriority').value = task.priority;
    document.getElementById('newTaskHours').value = task.estimated_hours;
    document.getElementById('newTaskDue').value = task.due_date; // Use the date as is, no formatting
    
    // Set assignee
    const assigneeSelect = document.getElementById('newTaskAssignee');
    if (assigneeSelect && task.assigned_to) {
        // Try to get the assignee ID - could be in different formats
        let assigneeId = null;
        if (task.assigned_to.id) {
            assigneeId = task.assigned_to.id;
        } else if (typeof task.assigned_to === 'object' && task.assigned_to.user_id) {
            assigneeId = task.assigned_to.user_id;
        } else {
            assigneeId = task.assigned_to;
        }
        
        // Find the option with this value and select it
        const options = Array.from(assigneeSelect.options);
        const matchingOption = options.find(opt => opt.value == assigneeId);
        if (matchingOption) {
            matchingOption.selected = true;
            console.log('Setting assignee to:', assigneeId);
        }
    }
    
    // Change modal title
    document.getElementById('addTaskModalTitle').textContent = 'Edit Task';
    
    // Show modal
    document.getElementById('addTaskModal').classList.add('open');
}

function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) {
        return;
    }
    
    fetch(`/core/api/tasks/${taskId}/delete/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Task deleted successfully', 'success');
            loadDashboardData();
        } else {
            showNotification('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Failed to delete task', 'error');
    });
}