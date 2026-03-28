"""
appraisal/heuristics.py
========================
Worklytics Performance Appraisal & Bonus Engine
------------------------------------------------
Evaluates each employee across 5 heuristic dimensions:

  1. Task Completion Rate   (30%) — % tasks completed on time
  2. Efficiency Index       (25%) — estimated vs actual hours ratio
  3. Workload Contribution  (20%) — share of team hours carried
  4. Deadline Adherence     (15%) — tasks completed before due date
  5. Priority Handling      (10%) — % of HIGH-priority tasks completed

Composite score → 0–100 → mapped to performance grade.

Bonus policy (only top 3 employees receive a bonus):
  - Rank 1  →  ₹1,50,000
  - Rank 2  →  ₹1,00,000
  - Rank 3  →  ₹75,000
  - Rank 4+ →  ₹0  (no bonus)
"""

from datetime import date, datetime
from typing import Any

# ── Configurable constants ────────────────────────────────────────────────────

WEEKLY_CAPACITY_HOURS = 40

DIMENSION_WEIGHTS = {
    'completion_rate':    0.30,
    'efficiency':         0.25,
    'workload':           0.20,
    'deadline_adherence': 0.15,
    'priority_handling':  0.10,
}

GRADE_BANDS = [
    (85, 'Outstanding',  '#22c55e'),
    (70, 'Excellent',    '#4ade80'),
    (55, 'Good',         '#6366f1'),
    (40, 'Average',      '#f59e0b'),
    (0,  'Below Average','#ef4444'),
]

# Only top 3 get a bonus — distinct fixed amounts in ₹
TOP3_BONUSES = {
    1: 50_000,   # ₹50,000  — 1st place
    2: 40_000,   # ₹40,000  — 2nd place
    3: 25_000,   # ₹25,000    — 3rd place
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _today() -> date:
    return date.today()


def _parse_date(val: Any) -> date | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    try:
        return date.fromisoformat(str(val)[:10])
    except (ValueError, TypeError):
        return None


def _grade(score: float) -> tuple[str, str]:
    """Return (grade_label, colour) for a 0–100 score."""
    for threshold, label, colour in GRADE_BANDS:
        if score >= threshold:
            return label, colour
    return 'Below Average', '#ef4444'


def _fmt_inr(amount: float) -> str:
    """Format a float as Indian Rupees with commas (e.g. ₹1,25,000)."""
    amount = int(round(amount))
    if amount <= 0:
        return '₹0'
    s = str(amount)
    # Indian numbering: last 3 digits, then groups of 2
    if len(s) <= 3:
        return f'₹{s}'
    result = s[-3:]
    s = s[:-3]
    while s:
        result = s[-2:] + ',' + result
        s = s[:-2]
    return '₹' + result.lstrip(',')


# ── Dimension scorers (each returns 0–100) ───────────────────────────────────

def _score_completion_rate(tasks: list[dict]) -> float:
    """% of assigned tasks that are completed."""
    if not tasks:
        return 0.0
    total     = len(tasks)
    completed = sum(1 for t in tasks if t.get('status') == 'completed')
    return round((completed / total) * 100, 2)


def _score_efficiency(tasks: list[dict]) -> float:
    """
    Efficiency = estimated_hours / actual_hours for completed tasks.
    Ratio > 1 → faster than estimated → higher score.
    If actual_hours is missing, assume neutral (score = 60).
    """
    completed_with_hours = [
        t for t in tasks
        if t.get('status') == 'completed'
        and t.get('actual_hours') is not None
        and float(t.get('actual_hours', 0) or 0) > 0
    ]
    if not completed_with_hours:
        return 60.0   # neutral when no data

    ratios = []
    for t in completed_with_hours:
        est = float(t.get('estimated_hours') or 1)
        act = float(t.get('actual_hours') or 1)
        # ratio > 1 means finished faster; cap at 2.0 so outliers don't dominate
        ratio = min(est / act, 2.0)
        ratios.append(ratio)

    avg_ratio = sum(ratios) / len(ratios)
    # Map [0, 2] → [0, 100]
    return round(min(avg_ratio * 50, 100), 2)


def _score_workload_contribution(tasks: list[dict], all_tasks: list[dict]) -> float:
    """
    Share of total team active hours carried by this employee.
    Employees who shoulder a higher proportion score higher,
    but we cap the score at 100 so overload doesn't infinitely reward.
    """
    team_hours = sum(
        float(t.get('estimated_hours') or 0)
        for t in all_tasks
        if t.get('status') != 'completed'
    )
    my_hours = sum(
        float(t.get('estimated_hours') or 0)
        for t in tasks
        if t.get('status') != 'completed'
    )
    if team_hours == 0:
        return 50.0   # no tasks at all → neutral

    share = my_hours / team_hours
    n_employees = max(len({
        t.get('assigned_to_id') for t in all_tasks
        if t.get('assigned_to_id')
    }), 1)
    fair_share = 1 / n_employees

    # Score 100 if at fair share, scale below/above
    ratio = share / fair_share
    # [0, 2] → [0, 100], peak at 1.0 (fair share)
    score = max(0, 100 - abs(ratio - 1.0) * 50)
    return round(score, 2)


def _score_deadline_adherence(tasks: list[dict]) -> float:
    """
    % of completed tasks that were finished on or before their due date.
    Non-completed tasks are ignored (they aren't yet done).
    """
    completed = [t for t in tasks if t.get('status') == 'completed']
    if not completed:
        return 70.0   # neutral default

    on_time = 0
    for t in completed:
        due        = _parse_date(t.get('due_date'))
        completed_on = _parse_date(t.get('completed_date'))
        if due is None:
            on_time += 1   # no deadline = can't be late
            continue
        if completed_on is None:
            # completed_date not set; assume on time if status=completed
            on_time += 1
            continue
        if completed_on <= due:
            on_time += 1

    return round((on_time / len(completed)) * 100, 2)


def _score_priority_handling(tasks: list[dict]) -> float:
    """
    % of HIGH-priority tasks that are completed.
    If employee has no high-priority tasks, score = 70 (neutral).
    """
    high = [t for t in tasks if t.get('priority') == 'high']
    if not high:
        return 70.0
    completed_high = sum(1 for t in high if t.get('status') == 'completed')
    return round((completed_high / len(high)) * 100, 2)


# ── Per-employee composite ────────────────────────────────────────────────────

def evaluate_employee(employee: dict, emp_tasks: list[dict], all_tasks: list[dict]) -> dict:
    """
    Returns a full appraisal record for one employee.

    Parameters
    ----------
    employee  : dict with keys: id, name, email, skills, experience_years
    emp_tasks : all tasks assigned to this employee (across all projects)
    all_tasks : all tasks in the manager's scope (for workload share calc)
    """
    d = {
        'completion_rate':    _score_completion_rate(emp_tasks),
        'efficiency':         _score_efficiency(emp_tasks),
        'workload':           _score_workload_contribution(emp_tasks, all_tasks),
        'deadline_adherence': _score_deadline_adherence(emp_tasks),
        'priority_handling':  _score_priority_handling(emp_tasks),
    }

    composite = round(sum(
        d[dim] * DIMENSION_WEIGHTS[dim]
        for dim in DIMENSION_WEIGHTS
    ), 2)

    grade, grade_colour = _grade(composite)
    # Bonus is NOT assigned here — assigned after ranking in run_appraisal()

    total_tasks     = len(emp_tasks)
    completed_tasks = sum(1 for t in emp_tasks if t.get('status') == 'completed')
    active_tasks    = sum(1 for t in emp_tasks if t.get('status') in ('todo', 'in_progress', 'blocked'))
    overdue_tasks   = sum(
        1 for t in emp_tasks
        if t.get('status') != 'completed'
        and _parse_date(t.get('due_date'))
        and _parse_date(t.get('due_date')) < _today()
    )
    total_hours     = sum(float(t.get('estimated_hours') or 0) for t in emp_tasks)
    actual_hours    = sum(
        float(t.get('actual_hours') or 0)
        for t in emp_tasks
        if t.get('actual_hours') is not None
    )

    return {
        'employee_id':      employee.get('id'),
        'name':             employee.get('name', 'Unknown'),
        'email':            employee.get('email', ''),
        'skills':           employee.get('skills', ''),
        'experience_years': employee.get('experience_years', 0),

        # Scores
        'dimensions':       d,
        'composite_score':  composite,
        'grade':            grade,
        'grade_colour':     grade_colour,

        # Bonus — set to zero here, overwritten for top 3 in run_appraisal()
        'bonus_raw':        0,
        'bonus_inr':        '₹0',

        # Task stats
        'total_tasks':      total_tasks,
        'completed_tasks':  completed_tasks,
        'active_tasks':     active_tasks,
        'overdue_tasks':    overdue_tasks,
        'total_hours':      round(total_hours, 1),
        'actual_hours':     round(actual_hours, 1),
    }


# ── Team-level appraisal ──────────────────────────────────────────────────────

def run_appraisal(employees: list[dict], all_tasks: list[dict]) -> dict:
    """
    Full appraisal pipeline for a manager's entire team.

    Parameters
    ----------
    employees : list of employee dicts (id, name, email, skills, experience_years)
    all_tasks : all Task records in manager's scope, serialised as dicts with keys:
                id, title, status, priority, estimated_hours, actual_hours,
                due_date, completed_date, assigned_to_id

    Returns
    -------
    {
        appraisals     : [ <employee appraisal dict>, … ] sorted by composite desc
        team_summary   : { avg_score, total_bonus_pool, top_scorer, … }
        score_distribution : { 'Outstanding': N, … }
        dimension_averages : { 'completion_rate': X, … }
        chart_data     : { labels, scores, bonuses, colours }
    }
    """
    if not employees:
        return {
            'appraisals':          [],
            'team_summary':        {},
            'score_distribution':  {},
            'dimension_averages':  {},
            'chart_data':          {},
        }

    # Group tasks per employee
    task_map: dict[int, list[dict]] = {e['id']: [] for e in employees}
    for t in all_tasks:
        aid = t.get('assigned_to_id')
        if aid in task_map:
            task_map[aid].append(t)

    appraisals = []
    for emp in employees:
        emp_tasks = task_map.get(emp['id'], [])
        appraisals.append(evaluate_employee(emp, emp_tasks, all_tasks))

    # Sort by composite score descending
    appraisals.sort(key=lambda a: a['composite_score'], reverse=True)

    # Assign rank AND bonuses — only top 3 receive anything
    for i, a in enumerate(appraisals):
        a['rank']      = i + 1
        bonus_raw      = TOP3_BONUSES.get(i + 1, 0)   # 0 for rank 4+
        a['bonus_raw'] = bonus_raw
        a['bonus_inr'] = _fmt_inr(bonus_raw)

    # Team summary — total pool is just the three awarded bonuses
    scores      = [a['composite_score'] for a in appraisals]
    total_bonus = sum(TOP3_BONUSES.values()) if len(appraisals) >= 3 else sum(
        TOP3_BONUSES[r] for r in range(1, len(appraisals) + 1)
    )
    avg_score   = round(sum(scores) / len(scores), 2) if scores else 0

    team_summary = {
        'avg_score':         avg_score,
        'highest_score':     max(scores) if scores else 0,
        'lowest_score':      min(scores) if scores else 0,
        'total_bonus_pool':  _fmt_inr(total_bonus),
        'total_bonus_raw':   total_bonus,
        'top_scorer':        appraisals[0]['name'] if appraisals else '—',
        'team_size':         len(appraisals),
    }

    # Grade distribution
    score_dist: dict[str, int] = {}
    for a in appraisals:
        score_dist[a['grade']] = score_dist.get(a['grade'], 0) + 1

    # Dimension averages
    dim_avgs = {}
    for dim in DIMENSION_WEIGHTS:
        vals = [a['dimensions'][dim] for a in appraisals]
        dim_avgs[dim] = round(sum(vals) / len(vals), 2) if vals else 0

    # Chart data
    chart_data = {
        'labels':   [a['name'].split()[0] for a in appraisals],      # first names
        'full_names': [a['name'] for a in appraisals],
        'scores':   [a['composite_score'] for a in appraisals],
        'bonuses':  [a['bonus_raw'] for a in appraisals],
        'colours':  [a['grade_colour'] for a in appraisals],
        'grades':   [a['grade'] for a in appraisals],
    }

    return {
        'appraisals':          appraisals,
        'team_summary':        team_summary,
        'score_distribution':  score_dist,
        'dimension_averages':  dim_avgs,
        'chart_data':          chart_data,
    }