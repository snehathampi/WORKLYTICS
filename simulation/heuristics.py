"""
simulation/heuristics.py
========================
Worklytics What-If Heuristic Engine
------------------------------------
Scores tasks and employees across four dimensions:
  1. Workload Balance   (40 % weight)
  2. Skill Match        (25 % weight)
  3. Deadline / Urgency (20 % weight)
  4. Dependency Risk    (15 % weight)

All scoring functions return a value in [0, 1] where
  1.0 = maximum risk / worst case
  0.0 = no risk

The engine operates entirely on plain Python dicts so it can be
called with either live DB objects or the virtual sandbox state
that comes in from the simulation API — no Django ORM required.
"""

from datetime import date, datetime
from typing import Any

# ── Constants ────────────────────────────────────────────────────────────────

WEEKLY_CAPACITY_HOURS = 40          # Standard work-week
OVERLOAD_THRESHOLD    = 40          # Hours/week → overloaded
UNDERUTIL_THRESHOLD   = 20          # Hours/week → underutilised
MAX_REASONABLE_HOURS  = 80          # Cap for normalisation

# Risk score thresholds → labels
RISK_LEVELS = [
    (0.75, 'critical', '#ef4444'),
    (0.50, 'high',     '#f97316'),
    (0.30, 'medium',   '#f59e0b'),
    (0.00, 'low',      '#22c55e'),
]

DIMENSION_WEIGHTS = {
    'workload':    0.40,
    'skill':       0.25,
    'deadline':    0.20,
    'dependency':  0.15,
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def _today() -> date:
    return date.today()


def _parse_date(val: Any) -> date | None:
    """Accept a date, datetime, or ISO string."""
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


def _risk_label(score: float) -> tuple[str, str]:
    """Return (level_name, hex_colour) for a 0–1 risk score."""
    for threshold, label, colour in RISK_LEVELS:
        if score >= threshold:
            return label, colour
    return 'low', '#22c55e'


def _tokenise_skills(skill_str: str) -> set[str]:
    """
    Convert 'Python, Django, REST APIs' → {'python', 'django', 'rest apis'}
    Also explodes compound tokens: 'restapi' → {'restapi', 'rest', 'api'}
    """
    if not skill_str:
        return set()
    tokens = set()
    for raw in skill_str.split(','):
        token = raw.strip().lower()
        if token:
            tokens.add(token)
            # also add individual words for partial matching
            for word in token.split():
                if len(word) > 2:
                    tokens.add(word)
    return tokens


# ── Employee workload snapshot ───────────────────────────────────────────────

def build_employee_workload_map(sim_tasks: list[dict], all_employees: list[dict]) -> dict:
    """
    Returns  { employee_user_id: { hours, task_count, utilization, status } }
    based on the *simulated* task assignments (not DB).
    Only counts active (non-completed) tasks.
    """
    workload: dict[int, dict] = {}

    # Seed all employees with zero load
    for emp in all_employees:
        eid = emp.get('user_id') or emp.get('id')
        workload[eid] = {
            'name':        emp.get('name', 'Unknown'),
            'skills':      emp.get('skills', ''),
            'hours':       0.0,
            'task_count':  0,
        }

    for task in sim_tasks:
        if task.get('status') == 'completed':
            continue
        assignee = task.get('assigned_to')
        if not assignee:
            continue
        eid = assignee.get('user_id') or assignee.get('id')
        if eid not in workload:
            workload[eid] = {'name': assignee.get('name', '?'), 'skills': '', 'hours': 0.0, 'task_count': 0}
        workload[eid]['hours']      += float(task.get('estimated_hours', 0) or 0)
        workload[eid]['task_count'] += 1

    # Compute utilization & status
    for eid, w in workload.items():
        util = min(round((w['hours'] / WEEKLY_CAPACITY_HOURS) * 100), 200)
        if w['hours'] > OVERLOAD_THRESHOLD:
            status = 'overloaded'
        elif w['hours'] > UNDERUTIL_THRESHOLD:
            status = 'balanced'
        else:
            status = 'underutilised'
        w['utilization'] = util
        w['status']      = status

    return workload


# ── Dimension scorers ────────────────────────────────────────────────────────

def score_workload(employee_hours: float) -> float:
    """
    Score = how overloaded the assignee is.
    0  → ≤ 20 h   (underutilised, but not risky)
    0.3 → 20-40 h (balanced)
    1.0 → ≥ 80 h  (extreme overload)
    """
    if employee_hours <= UNDERUTIL_THRESHOLD:
        return 0.1   # slight nudge — they could take more
    if employee_hours <= OVERLOAD_THRESHOLD:
        return 0.3
    # Overloaded zone: scale 0.5 → 1.0 between 40 h and 80 h
    excess_ratio = min((employee_hours - OVERLOAD_THRESHOLD) / (MAX_REASONABLE_HOURS - OVERLOAD_THRESHOLD), 1.0)
    return 0.5 + 0.5 * excess_ratio


def score_skill_match(task_title: str, task_description: str, employee_skills: str) -> float:
    """
    Lower score  = better match  (returns RISK, not fitness).
    If the employee has ALL keywords from the task → score 0.0 (no skill risk).
    If no employee skills at all → score 0.8 (high risk, skill unknown).
    Uses keyword overlap heuristic; no NLP required.
    """
    if not employee_skills:
        return 0.8

    emp_tokens  = _tokenise_skills(employee_skills)
    task_text   = (task_title + ' ' + (task_description or '')).lower()
    task_tokens = _tokenise_skills(task_text)

    if not task_tokens:
        return 0.1   # task has no discernible skill keywords → low risk

    matched = len(emp_tokens & task_tokens)
    total   = len(task_tokens)
    match_ratio = matched / total

    # Invert: high match → low risk
    return round(1.0 - min(match_ratio * 1.5, 1.0), 3)   # 1.5× boost for partial matches


def score_deadline(due_date_val: Any, task_status: str, estimated_hours: float) -> float:
    """
    Risk based on days remaining vs estimated effort:
      - Already completed → 0 risk
      - Overdue            → 1.0 risk
      - Days remaining < estimated_hours → very high risk
      - Comfortable buffer  → low risk
    """
    if task_status == 'completed':
        return 0.0

    due = _parse_date(due_date_val)
    if due is None:
        return 0.4   # no deadline info — moderate risk

    days_left  = (due - _today()).days
    hours_left = days_left * 8   # assume 8 h/day

    if days_left < 0:
        return 1.0   # overdue

    if hours_left <= 0:
        return 0.95

    effort = float(estimated_hours or 8)
    ratio  = effort / max(hours_left, 1)

    # ratio > 1 means more work than time available
    return min(ratio * 0.6, 1.0)


def score_dependency_risk(task_id: int, sim_tasks: list[dict]) -> float:
    """
    Risk from blocked dependencies:
      - Task has no unresolved deps → 0
      - All blockers completed     → 0
      - Has blockers in todo / blocked → high risk
      - Has blockers in progress   → medium risk
    """
    # Build a quick lookup
    task_map = {t.get('id'): t for t in sim_tasks}
    dep_ids  = [
        d.get('depends_on_id')
        for d in (task_map.get(task_id, {}).get('dependencies', []) or [])
    ]
    if not dep_ids:
        return 0.0

    risk = 0.0
    for dep_id in dep_ids:
        blocker = task_map.get(dep_id)
        if not blocker:
            continue
        s = blocker.get('status', 'todo')
        if s in ('todo', 'blocked'):
            risk = max(risk, 0.9)
        elif s == 'in_progress':
            risk = max(risk, 0.4)
        # completed → no risk contribution

    return risk


# ── Composite task risk ───────────────────────────────────────────────────────

def compute_task_risk(task: dict, workload_map: dict) -> dict:
    """
    Compute composite risk score + dimension breakdown for a single task.
    Returns a dict with scores, label, colour, and a human-readable reason.
    """
    assignee    = task.get('assigned_to')
    task_id     = task.get('id')
    status      = task.get('status', 'todo')
    est_hours   = float(task.get('estimated_hours') or 0)
    due_date    = task.get('due_date')
    title       = task.get('title', '')
    description = task.get('description', '')

    if status == 'completed':
        return {
            'task_id':    task_id,
            'composite':  0.0,
            'label':      'low',
            'colour':     '#22c55e',
            'dimensions': {'workload': 0, 'skill': 0, 'deadline': 0, 'dependency': 0},
            'reason':     'Task is completed.',
        }

    # ── Workload score ──────────────────────────────────────────────────────
    if assignee:
        eid         = assignee.get('user_id') or assignee.get('id')
        emp_data    = workload_map.get(eid, {})
        emp_hours   = emp_data.get('hours', 0)
        emp_skills  = emp_data.get('skills', '')
    else:
        emp_hours   = 0
        emp_skills  = ''

    s_workload   = score_workload(emp_hours) if assignee else 0.6   # unassigned = moderate load risk
    s_skill      = score_skill_match(title, description, emp_skills) if assignee else 0.7
    s_deadline   = score_deadline(due_date, status, est_hours)
    s_dependency = score_dependency_risk(task_id, [])   # full dep scoring done in project-level

    composite = (
        s_workload   * DIMENSION_WEIGHTS['workload']   +
        s_skill      * DIMENSION_WEIGHTS['skill']      +
        s_deadline   * DIMENSION_WEIGHTS['deadline']   +
        s_dependency * DIMENSION_WEIGHTS['dependency']
    )
    composite = round(composite, 3)
    label, colour = _risk_label(composite)

    # Build a short human reason string
    reasons = []
    if s_workload >= 0.5:
        reasons.append(f"assignee overloaded ({emp_hours:.0f}h)")
    if s_skill >= 0.6:
        reasons.append("poor skill match")
    if s_deadline >= 0.6:
        reasons.append("tight deadline")
    if s_dependency >= 0.5:
        reasons.append("blocked by dependencies")
    if not assignee:
        reasons.append("unassigned")
    reason = '; '.join(reasons) if reasons else 'On track'

    return {
        'task_id':    task_id,
        'composite':  composite,
        'label':      label,
        'colour':     colour,
        'dimensions': {
            'workload':   round(s_workload,   3),
            'skill':      round(s_skill,      3),
            'deadline':   round(s_deadline,   3),
            'dependency': round(s_dependency, 3),
        },
        'reason': reason,
    }


# ── Project-level risk ────────────────────────────────────────────────────────

def compute_project_risk(sim_tasks: list[dict], workload_map: dict, project_end_date: Any) -> dict:
    """
    Aggregate per-task risks into a project-level score.
    Also layers in a timeline risk (is the project itself overdue/close?).
    Returns { composite, label, colour, breakdown, task_risks[] }
    """
    if not sim_tasks:
        return {
            'composite': 0.0, 'label': 'low', 'colour': '#22c55e',
            'breakdown': {}, 'task_risks': [],
        }

    task_risks = []
    for t in sim_tasks:
        # Pass full task list so dep-scoring is accurate
        dep_score = score_dependency_risk(t.get('id'), sim_tasks)
        risk = compute_task_risk(t, workload_map)
        risk['dimensions']['dependency'] = round(dep_score, 3)
        # Recompute composite with accurate dep score
        d = risk['dimensions']
        risk['composite'] = round(
            d['workload']   * DIMENSION_WEIGHTS['workload']   +
            d['skill']      * DIMENSION_WEIGHTS['skill']      +
            d['deadline']   * DIMENSION_WEIGHTS['deadline']   +
            d['dependency'] * DIMENSION_WEIGHTS['dependency'],
            3
        )
        risk['label'], risk['colour'] = _risk_label(risk['composite'])
        risk['task_title'] = t.get('title', '')
        task_risks.append(risk)

    # Aggregate
    active_risks  = [r for r in task_risks if r['composite'] > 0]
    if not active_risks:
        avg = 0.0
    else:
        avg = sum(r['composite'] for r in active_risks) / len(active_risks)

    # Factor in project-level deadline
    proj_deadline_score = 0.0
    due = _parse_date(project_end_date)
    if due:
        days_left = (due - _today()).days
        if days_left < 0:
            proj_deadline_score = 1.0
        elif days_left < 7:
            proj_deadline_score = 0.8
        elif days_left < 14:
            proj_deadline_score = 0.5
        elif days_left < 30:
            proj_deadline_score = 0.25

    composite = round(avg * 0.75 + proj_deadline_score * 0.25, 3)
    label, colour = _risk_label(composite)

    # Dimension breakdown averages
    breakdown = {}
    for dim in DIMENSION_WEIGHTS:
        vals = [r['dimensions'].get(dim, 0) for r in task_risks]
        breakdown[dim] = round(sum(vals) / len(vals), 3) if vals else 0

    return {
        'composite':  composite,
        'label':      label,
        'colour':     colour,
        'breakdown':  breakdown,
        'task_risks': task_risks,
    }


# ── Suggestion engine ─────────────────────────────────────────────────────────

def generate_suggestions(sim_tasks: list[dict], workload_map: dict, all_employees: list[dict]) -> list[dict]:
    """
    Returns a list of actionable suggestion dicts, each with:
      type, priority, title, detail, task_id (optional), target_employee (optional)

    Suggestion types:
      - reassign      : move task from overloaded → underutilised employee
      - skill_mismatch: task assigned to someone whose skills don't match
      - unassigned    : task has no assignee
      - deadline      : task is at risk of missing deadline
      - dependency    : task is blocked
    """
    suggestions = []
    seen_reassign_pairs: set[tuple] = set()

    # Build employee lookup
    emp_lookup = {
        (e.get('user_id') or e.get('id')): e
        for e in all_employees
    }

    # Identify underutilised employees
    underutil_emps = [
        (eid, w) for eid, w in workload_map.items()
        if w['status'] == 'underutilised'
    ]

    for task in sim_tasks:
        if task.get('status') == 'completed':
            continue

        task_id    = task.get('id')
        task_title = task.get('title', 'Unnamed task')
        assignee   = task.get('assigned_to')
        est_hours  = float(task.get('estimated_hours') or 0)
        due_date   = _parse_date(task.get('due_date'))
        deps       = task.get('dependencies', []) or []

        # ── 1. Unassigned task ────────────────────────────────────────────
        if not assignee:
            # Find best match among underutilised
            best_emp = None
            best_skill_score = 1.0
            for eid, w in underutil_emps:
                s = score_skill_match(task.get('title',''), task.get('description',''), w.get('skills',''))
                if s < best_skill_score:
                    best_skill_score = s
                    best_emp = (eid, w)

            if best_emp:
                eid, w = best_emp
                suggestions.append({
                    'type':     'unassigned',
                    'priority': 'high',
                    'icon':     '👤',
                    'title':    f'Assign "{task_title}"',
                    'detail':   (
                        f'{w["name"]} is currently underutilised '
                        f'({w["hours"]:.0f}h / {WEEKLY_CAPACITY_HOURS}h) and '
                        f'{"has relevant skills" if best_skill_score < 0.5 else "is available"}. '
                        f'Consider assigning this task to them.'
                    ),
                    'task_id':          task_id,
                    'target_employee':  {'id': eid, 'name': w['name']},
                })
            else:
                suggestions.append({
                    'type':     'unassigned',
                    'priority': 'medium',
                    'icon':     '👤',
                    'title':    f'"{task_title}" is unassigned',
                    'detail':   'No employee has been assigned. Assign someone to avoid project delays.',
                    'task_id':  task_id,
                    'target_employee': None,
                })
            continue   # skip other checks for unassigned tasks

        # ── 2. Reassignment due to overload ──────────────────────────────
        eid = assignee.get('user_id') or assignee.get('id')
        emp_w = workload_map.get(eid, {})

        if emp_w.get('status') == 'overloaded':
            for target_eid, target_w in underutil_emps:
                pair = (eid, target_eid, task_id)
                if pair in seen_reassign_pairs:
                    continue
                # Check skill compatibility
                s = score_skill_match(
                    task.get('title',''), task.get('description',''),
                    target_w.get('skills','')
                )
                match_text = 'strong skill match' if s < 0.3 else ('partial skill match' if s < 0.6 else 'limited skill overlap')
                suggestions.append({
                    'type':     'reassign',
                    'priority': 'high',
                    'icon':     '🔄',
                    'title':    f'Redistribute "{task_title}"',
                    'detail':   (
                        f'{emp_w.get("name","?")} is overloaded '
                        f'({emp_w.get("hours",0):.0f}h this week). '
                        f'{target_w["name"]} is underutilised '
                        f'({target_w["hours"]:.0f}h / {WEEKLY_CAPACITY_HOURS}h) '
                        f'with {match_text}. '
                        f'Moving this task would save ~{est_hours:.0f}h from the overloaded employee.'
                    ),
                    'task_id':         task_id,
                    'from_employee':   {'id': eid, 'name': emp_w.get('name','?')},
                    'target_employee': {'id': target_eid, 'name': target_w['name']},
                })
                seen_reassign_pairs.add(pair)
                break   # one suggestion per overloaded task is enough

        # ── 3. Skill mismatch ─────────────────────────────────────────────
        skill_score = score_skill_match(
            task.get('title',''), task.get('description',''),
            emp_w.get('skills','')
        )
        if skill_score >= 0.7 and emp_w.get('status') != 'overloaded':
            # Find a better-matching alternative
            best_alt = None
            best_s   = skill_score
            for e in all_employees:
                alt_eid = e.get('user_id') or e.get('id')
                if alt_eid == eid:
                    continue
                alt_w   = workload_map.get(alt_eid, {})
                alt_s   = score_skill_match(task.get('title',''), task.get('description',''), e.get('skills',''))
                alt_hrs = alt_w.get('hours', 0)
                if alt_s < best_s and alt_hrs < OVERLOAD_THRESHOLD:
                    best_s   = alt_s
                    best_alt = (alt_eid, e, alt_w)

            if best_alt:
                alt_eid, alt_e, alt_w = best_alt
                suggestions.append({
                    'type':     'skill_mismatch',
                    'priority': 'medium',
                    'icon':     '🎯',
                    'title':    f'Better skill fit for "{task_title}"',
                    'detail':   (
                        f'{emp_w.get("name","?")} has limited skill overlap with this task. '
                        f'{alt_e.get("name","?")} has a stronger match '
                        f'and currently carries {alt_w.get("hours",0):.0f}h '
                        f'({alt_w.get("status","?")}). '
                        f'This could improve execution quality.'
                    ),
                    'task_id':         task_id,
                    'from_employee':   {'id': eid,     'name': emp_w.get('name','?')},
                    'target_employee': {'id': alt_eid, 'name': alt_e.get('name','?')},
                })

        # ── 4. Deadline risk ──────────────────────────────────────────────
        dl_score = score_deadline(task.get('due_date'), task.get('status','todo'), est_hours)
        if dl_score >= 0.6:
            if due_date:
                days_left = (due_date - _today()).days
                due_text = f"due in {days_left} day{'s' if days_left != 1 else ''}" if days_left >= 0 else f"overdue by {abs(days_left)} days"
            else:
                due_text = "deadline unset"

            suggestions.append({
                'type':     'deadline',
                'priority': 'high' if dl_score >= 0.8 else 'medium',
                'icon':     '⏰',
                'title':    f'Deadline risk on "{task_title}"',
                'detail':   (
                    f'This task is {due_text} with {est_hours:.0f}h estimated effort remaining. '
                    f'Consider splitting the task, increasing priority, or adjusting the deadline.'
                ),
                'task_id': task_id,
            })

        # ── 5. Dependency blockage ────────────────────────────────────────
        dep_score = score_dependency_risk(task_id, sim_tasks)
        if dep_score >= 0.5:
            suggestions.append({
                'type':     'dependency',
                'priority': 'high' if dep_score >= 0.8 else 'medium',
                'icon':     '🔗',
                'title':    f'"{task_title}" is blocked',
                'detail':   (
                    'This task has unresolved dependencies. '
                    'Prioritise completing the blocking tasks first, '
                    'or review whether the dependency is still necessary.'
                ),
                'task_id': task_id,
            })

    # Sort: high first, then medium, then low
    order = {'high': 0, 'medium': 1, 'low': 2}
    suggestions.sort(key=lambda s: order.get(s.get('priority', 'low'), 2))

    return suggestions


# ── Main entry point ──────────────────────────────────────────────────────────

def run_simulation_analysis(
    sim_tasks:       list[dict],
    all_employees:   list[dict],
    project_end_date: Any = None,
) -> dict:
    """
    Full analysis pipeline. Returns everything the frontend needs:
      {
        project_risk:   { composite, label, colour, breakdown, task_risks[] }
        workload_map:   { employee_id: { name, hours, utilization, status } }
        suggestions:    [ { type, priority, icon, title, detail, ... } ]
        summary: {
          overall_risk_score,
          overall_risk_label,
          total_tasks,
          at_risk_tasks,
          overloaded_employees,
          underutilised_employees,
        }
      }
    """
    workload_map  = build_employee_workload_map(sim_tasks, all_employees)
    project_risk  = compute_project_risk(sim_tasks, workload_map, project_end_date)
    suggestions   = generate_suggestions(sim_tasks, workload_map, all_employees)

    total_tasks        = len([t for t in sim_tasks if t.get('status') != 'completed'])
    at_risk_tasks      = len([r for r in project_risk['task_risks'] if r['label'] in ('high', 'critical')])
    overloaded_count   = sum(1 for w in workload_map.values() if w['status'] == 'overloaded')
    underutil_count    = sum(1 for w in workload_map.values() if w['status'] == 'underutilised')

    # Build a workload list sorted by hours desc for the UI
    workload_list = sorted(
        [{'employee_id': eid, **w} for eid, w in workload_map.items()],
        key=lambda x: x['hours'],
        reverse=True,
    )

    return {
        'project_risk':           project_risk,
        'workload_map':           workload_list,
        'suggestions':            suggestions,
        'summary': {
            'overall_risk_score':     project_risk['composite'],
            'overall_risk_label':     project_risk['label'],
            'overall_risk_colour':    project_risk['colour'],
            'total_active_tasks':     total_tasks,
            'at_risk_tasks':          at_risk_tasks,
            'overloaded_employees':   overloaded_count,
            'underutilised_employees': underutil_count,
            'suggestion_count':       len(suggestions),
        },
    }