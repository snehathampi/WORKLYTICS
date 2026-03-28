"""
appraisal/views.py
==================
Single API endpoint:
  GET /appraisal/api/evaluate/
      Returns full team appraisal for ALL employees company-wide,
      scored on ALL tasks assigned to them (not limited to this manager).
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from functools import wraps

from accounts.models import Employee, Manager
from core.models import Task

from .heuristics import run_appraisal


def _manager_required(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Authentication required'}, status=401)
        if request.user.requested_role != 'manager':
            return JsonResponse({'error': 'Manager access required'}, status=403)
        return view_func(request, *args, **kwargs)
    return wrapper


@_manager_required
@require_http_methods(["GET"])
def evaluate_team(request):
    """
    Evaluate ALL employees in the company using ALL tasks assigned to them.
    Manager login is only required for access control — the appraisal scope
    is company-wide, not limited to this manager's projects.
    """
    try:
        Manager.objects.get(user=request.user)
    except Manager.DoesNotExist:
        return JsonResponse({'error': 'Manager profile not found'}, status=404)

    # ALL tasks across the entire company
    all_tasks_qs = Task.objects.all().select_related('assigned_to', 'project')

    all_tasks_dicts = []
    for t in all_tasks_qs:
        all_tasks_dicts.append({
            'id':              t.id,
            'title':           t.title,
            'status':          t.status,
            'priority':        t.priority,
            'estimated_hours': float(t.estimated_hours or 0),
            'actual_hours':    float(t.actual_hours) if t.actual_hours is not None else None,
            'due_date':        t.due_date.isoformat() if t.due_date else None,
            'completed_date':  t.completed_date.isoformat() if t.completed_date else None,
            'assigned_to_id':  t.assigned_to.user_id if t.assigned_to else None,
        })

    # ALL employees in the company
    all_employees = Employee.objects.all()
    employees_dicts = [{
        'id':               emp.user_id,
        'name':             emp.name,
        'email':            emp.email,
        'skills':           emp.skills or '',
        'experience_years': emp.experience_years or 0,
    } for emp in all_employees]

    result = run_appraisal(employees_dicts, all_tasks_dicts)

    return JsonResponse({'success': True, 'data': result})