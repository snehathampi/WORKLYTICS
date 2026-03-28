from django.shortcuts import render
"""
simulation/views.py
====================
API endpoints for the What-If Simulation module.

Endpoints
---------
GET  /simulation/api/project/<id>/load/
        Load full project state (tasks + dependencies + employees) for sandbox.

POST /simulation/api/project/<id>/analyse/
        Run heuristic analysis on a virtual task-state sent by the frontend.
        Body: { tasks: [...], project_end_date: "YYYY-MM-DD" }
        Nothing is written to the database.

POST /simulation/api/project/<id>/apply/
        Apply virtual task assignments to the real database.
        Body: { tasks: [{ id, assigned_to_id, status, estimated_hours }] }
        Only writes assignment + status + estimated_hours changes.
"""

import json
from datetime import date

from django.http  import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.db.models import Sum
from functools import wraps

from accounts.models import Employee
from core.models import Project, Task, TaskDependency

from .heuristics import run_simulation_analysis


# ── Auth decorator (mirrors core/views.py pattern) ───────────────────────────

def api_login_required(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Authentication required'}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper


def manager_required(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Authentication required'}, status=401)
        if request.user.requested_role != 'manager':
            return JsonResponse({'error': 'Manager access required'}, status=403)
        return view_func(request, *args, **kwargs)
    return wrapper


# ── Helpers ───────────────────────────────────────────────────────────────────

def _task_to_dict(task: Task) -> dict:
    """Serialise a Task ORM object into the dict format the heuristic engine expects."""
    assignee_info = None
    if task.assigned_to:
        assignee_info = {
            'id':      task.assigned_to.user_id,
            'user_id': task.assigned_to.user_id,
            'name':    task.assigned_to.name,
        }

    # Gather dependency ids
    dep_ids = list(
        TaskDependency.objects
        .filter(task=task)
        .values_list('depends_on_id', flat=True)
    )

    return {
        'id':              task.id,
        'title':           task.title,
        'description':     task.description or '',
        'status':          task.status,
        'priority':        task.priority,
        'estimated_hours': float(task.estimated_hours or 0),
        'due_date':        task.due_date.isoformat() if task.due_date else None,
        'assigned_to':     assignee_info,
        'dependencies':    [{'depends_on_id': d} for d in dep_ids],
    }


def _employee_to_dict(emp: Employee, active_hours: float = 0.0) -> dict:
    return {
        'id':         emp.user_id,
        'user_id':    emp.user_id,
        'name':       emp.name,
        'skills':     emp.skills or '',
        'experience': emp.experience_years,
        'hours':      active_hours,
    }


# ── View: load project state ──────────────────────────────────────────────────

@manager_required
@require_http_methods(["GET"])
def load_project(request, project_id: int):
    """
    Return the full project snapshot needed to populate the simulation sandbox.
    Includes tasks, their dependency graph, and all employees with current load.
    """
    from accounts.models import Manager
    try:
        manager = Manager.objects.get(user=request.user)
        project = Project.objects.get(id=project_id, manager=manager)
    except Manager.DoesNotExist:
        return JsonResponse({'error': 'Manager profile not found'}, status=404)
    except Project.DoesNotExist:
        return JsonResponse({'error': 'Project not found or access denied'}, status=404)

    tasks = Task.objects.filter(project=project).order_by('created_at')
    task_list = [_task_to_dict(t) for t in tasks]

    # All employees with their *current* workload (across ALL projects)
    all_employees = Employee.objects.all()
    employee_list = []
    for emp in all_employees:
        active_tasks = Task.objects.filter(
            assigned_to=emp,
            status__in=['todo', 'in_progress', 'blocked']
        )
        active_hours = active_tasks.aggregate(total=Sum('estimated_hours'))['total'] or 0.0
        employee_list.append(_employee_to_dict(emp, float(active_hours)))

    return JsonResponse({
        'project': {
            'id':       project.id,
            'name':     project.name,
            'priority': project.priority,
            'status':   project.status,
            'end_date': project.end_date.isoformat() if project.end_date else None,
            'color':    project.color,
        },
        'tasks':     task_list,
        'employees': employee_list,
    })


# ── View: analyse (pure virtual, no DB write) ─────────────────────────────────

@csrf_exempt
@manager_required
@require_http_methods(["POST"])
def analyse_simulation(request, project_id: int):
    """
    Run heuristic analysis on the manager's edited task state.
    Expects JSON body:
      {
        "tasks":            [ <task dicts with modified assignments/status> ],
        "employees":        [ <employee dicts> ],    // optional, uses DB if omitted
        "project_end_date": "YYYY-MM-DD"             // optional
      }
    Returns full analysis without touching the database.
    """
    from accounts.models import Manager
    try:
        manager = Manager.objects.get(user=request.user)
        project = Project.objects.get(id=project_id, manager=manager)
    except Manager.DoesNotExist:
        return JsonResponse({'error': 'Manager profile not found'}, status=404)
    except Project.DoesNotExist:
        return JsonResponse({'error': 'Project not found or access denied'}, status=404)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    sim_tasks = body.get('tasks', [])
    if not sim_tasks:
        return JsonResponse({'error': 'No tasks provided for analysis'}, status=400)

    # Use employees from request body if supplied, else load from DB
    employees_payload = body.get('employees')
    if employees_payload:
        all_employees = employees_payload
    else:
        all_employees = []
        for emp in Employee.objects.all():
            active_hours = Task.objects.filter(
                assigned_to=emp,
                status__in=['todo', 'in_progress', 'blocked']
            ).aggregate(total=Sum('estimated_hours'))['total'] or 0.0
            all_employees.append(_employee_to_dict(emp, float(active_hours)))

    project_end_date = body.get('project_end_date') or (
        project.end_date.isoformat() if project.end_date else None
    )

    result = run_simulation_analysis(sim_tasks, all_employees, project_end_date)

    return JsonResponse({
        'success': True,
        'analysis': result,
    })


# ── View: apply simulation to real DB ────────────────────────────────────────

@csrf_exempt
@manager_required
@require_http_methods(["POST"])
def apply_simulation(request, project_id: int):
    """
    Persist the simulated task changes to the real database.
    Only these fields are updated per task:
      - assigned_to  (employee user_id or null)
      - status
      - estimated_hours
    Everything else (title, description, due_date, priority) is left unchanged
    so the manager can't accidentally overwrite real task data via simulation.
    """
    from accounts.models import Manager
    try:
        manager = Manager.objects.get(user=request.user)
        project = Project.objects.get(id=project_id, manager=manager)
    except Manager.DoesNotExist:
        return JsonResponse({'error': 'Manager profile not found'}, status=404)
    except Project.DoesNotExist:
        return JsonResponse({'error': 'Project not found or access denied'}, status=404)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    tasks_payload = body.get('tasks', [])
    if not tasks_payload:
        return JsonResponse({'error': 'No tasks provided'}, status=400)

    # Build a quick employee lookup  user_id → Employee
    emp_lookup = {emp.user_id: emp for emp in Employee.objects.all()}

    updated    = []
    errors     = []

    for task_data in tasks_payload:
        task_id = task_data.get('id')
        try:
            task = Task.objects.get(id=task_id, project=project)
        except Task.DoesNotExist:
            errors.append({'task_id': task_id, 'error': 'Task not found in this project'})
            continue

        changed = False

        # Update assignee
        if 'assigned_to' in task_data:
            new_assignee_raw = task_data['assigned_to']
            if new_assignee_raw is None:
                if task.assigned_to is not None:
                    task.assigned_to = None
                    changed = True
            else:
                new_id = (
                    new_assignee_raw.get('user_id') or
                    new_assignee_raw.get('id')
                    if isinstance(new_assignee_raw, dict)
                    else int(new_assignee_raw)
                )
                emp = emp_lookup.get(new_id)
                if emp and task.assigned_to != emp:
                    task.assigned_to = emp
                    changed = True
                elif not emp:
                    errors.append({'task_id': task_id, 'error': f'Employee {new_id} not found'})
                    continue

        # Update status
        new_status = task_data.get('status')
        valid_statuses = [s[0] for s in Task.STATUS_CHOICES]
        if new_status and new_status != task.status:
            if new_status in valid_statuses:
                task.status = new_status
                changed = True
            else:
                errors.append({'task_id': task_id, 'error': f'Invalid status: {new_status}'})
                continue

        # Update estimated hours
        new_hours = task_data.get('estimated_hours')
        if new_hours is not None:
            try:
                new_hours = float(new_hours)
                if new_hours != task.estimated_hours:
                    task.estimated_hours = new_hours
                    changed = True
            except (ValueError, TypeError):
                errors.append({'task_id': task_id, 'error': 'Invalid estimated_hours value'})
                continue

        if changed:
            task.save()
            updated.append(task_id)

    return JsonResponse({
        'success':      True,
        'updated_tasks': updated,
        'errors':        errors,
        'message':       f'{len(updated)} task(s) updated successfully.',
    })