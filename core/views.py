from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import Q, Sum, Count, F
from django.db import models
from django.core.exceptions import ValidationError
from functools import wraps
import json
from datetime import datetime, timedelta

from accounts.models import Manager, Employee
from .models import Project, Task, TaskDependency

# Create your views here.

# ==================== API DECORATOR ====================
def api_login_required(view_func):
    """Decorator that returns 401 instead of redirecting for API views"""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        print(f"🔍 API Auth Check - User: {request.user}")
        print(f"🔍 API Auth Check - Authenticated: {request.user.is_authenticated}")
        print(f"🔍 API Auth Check - Session Key: {request.session.session_key}")
        print(f"🔍 API Auth Check - Cookies: {request.COOKIES}")
        
        if not request.user.is_authenticated:
            print("❌ API Auth Failed - User not authenticated")
            response = JsonResponse({'error': 'Authentication required'}, status=401)
            response['WWW-Authenticate'] = 'Session'
            return response
        
        print("✅ API Auth Success - User authenticated")
        return view_func(request, *args, **kwargs)
    return wrapper

# ==================== PROJECT APIs ====================

@api_login_required
def get_projects(request):
    """Get all projects for the logged-in manager"""
    if request.user.requested_role != 'manager':
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    
    try:
        manager = Manager.objects.get(user=request.user)
        projects = Project.objects.filter(manager=manager).values(
            'id', 'name', 'description', 'priority', 'status', 
            'end_date', 'color', 'progress'
        )
        return JsonResponse(list(projects), safe=False)
    except Manager.DoesNotExist:
        return JsonResponse({'error': 'Manager not found'}, status=404)

@api_login_required
@csrf_exempt
def create_project(request):
    """Create a new project"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    if request.user.requested_role != 'manager':
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    
    try:
        manager = Manager.objects.get(user=request.user)
        
        # Debug: print the received data
        print("="*50)
        print("CREATE PROJECT - Received data:")
        
        if request.content_type == 'application/json':
            data = json.loads(request.body)
            print("JSON data:", data)
        else:
            data = request.POST
            print("POST data:", dict(request.POST))
        
        print("="*50)
        
        # Validate required fields
        name = data.get('name')
        due_date = data.get('due_date')
        
        if not name:
            return JsonResponse({'success': False, 'error': 'Project name is required'}, status=400)
        
        if not due_date:
            return JsonResponse({'success': False, 'error': 'Due date is required'}, status=400)
        
        # Create project
        project = Project.objects.create(
            name=name,
            description=data.get('description', ''),
            manager=manager,
            priority=data.get('priority', 'medium'),
            end_date=due_date,
            color=data.get('color', '#6366f1')
        )
        
        print(f"✅ Project created: {project.name} (ID: {project.id})")
        print(f"✅ End date type: {type(project.end_date)}")
        print(f"✅ End date value: {project.end_date}")
        
        # Format the end date safely
        end_date_str = ''
        if project.end_date:
            try:
                # If it's a date/datetime object
                end_date_str = project.end_date.strftime('%Y-%m-%d')
            except AttributeError:
                # If it's already a string
                end_date_str = str(project.end_date)
        
        return JsonResponse({
            'success': True,
            'project_id': project.id,
            'project': {
                'id': project.id,
                'name': project.name,
                'priority': project.priority,
                'end_date': end_date_str,  # Use safe formatted string
                'color': project.color
            }
        })
    except Manager.DoesNotExist:
        print("❌ Manager not found for user:", request.user)
        return JsonResponse({'success': False, 'error': 'Manager profile not found'}, status=400)
    except Exception as e:
        print(f"❌ ERROR in create_project: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@api_login_required
def get_project_details(request, project_id):
    """Get details of a specific project with its tasks"""
    try:
        project = Project.objects.get(id=project_id)
        
        # Check permissions
        if request.user.requested_role == 'manager':
            manager = Manager.objects.get(user=request.user)
            if project.manager != manager:
                return JsonResponse({'error': 'Unauthorized'}, status=403)
        elif request.user.requested_role == 'employee':
            employee = Employee.objects.get(user=request.user)
            # Check if employee has any tasks in this project
            if not Task.objects.filter(project=project, assigned_to=employee).exists():
                return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        tasks = []
        for task in Task.objects.filter(project=project):
            tasks.append({
                'id': task.id,
                'title': task.title,
                'description': task.description,
                'assigned_to': task.assigned_to.name if task.assigned_to else None,
                'assigned_to_id': task.assigned_to.user_id if task.assigned_to else None,
                'priority': task.priority,
                'status': task.status,
                'estimated_hours': task.estimated_hours,
                'actual_hours': task.actual_hours,
                'due_date': task.due_date.strftime('%Y-%m-%d'),
                'is_overdue': task.is_overdue,
                'has_pending_dependencies': task.has_pending_dependencies
            })
        
        return JsonResponse({
            'id': project.id,
            'name': project.name,
            'description': project.description,
            'priority': project.priority,
            'status': project.status,
            'progress': project.progress,
            'end_date': project.end_date.strftime('%Y-%m-%d'),
            'tasks': tasks,
            'task_count': project.task_count,
            'completed_tasks': project.completed_tasks
        })
    except Project.DoesNotExist:
        return JsonResponse({'error': 'Project not found'}, status=404)

@csrf_exempt
@api_login_required
def update_project(request, project_id):
    """Update project details"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    try:
        project = Project.objects.get(id=project_id)
        
        # Check permissions
        if request.user.requested_role != 'manager':
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        manager = Manager.objects.get(user=request.user)
        if project.manager != manager:
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        data = json.loads(request.body) if request.content_type == 'application/json' else request.POST
        
        if data.get('name'):
            project.name = data.get('name')
        if data.get('description') is not None:
            project.description = data.get('description')
        if data.get('priority'):
            project.priority = data.get('priority')
        if data.get('status'):
            project.status = data.get('status')
        if data.get('end_date'):
            project.end_date = data.get('end_date')
        if data.get('due_date'):
            project.end_date = data.get('due_date')
        
        project.save()
        
        return JsonResponse({'success': True})
    except Project.DoesNotExist:
        return JsonResponse({'error': 'Project not found'}, status=404)

@csrf_exempt
@api_login_required
def delete_project(request, project_id):
    """Delete a project"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    try:
        project = Project.objects.get(id=project_id)
        
        # Check permissions
        if request.user.requested_role != 'manager':
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        manager = Manager.objects.get(user=request.user)
        if project.manager != manager:
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        project.delete()
        return JsonResponse({'success': True})
    except Project.DoesNotExist:
        return JsonResponse({'error': 'Project not found'}, status=404)


# ==================== TASK APIs ====================
@api_login_required
@csrf_exempt
def create_task(request):
    """Create a new task"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    if request.user.requested_role != 'manager':
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    
    try:
        # Parse data
        if request.content_type == 'application/json':
            data = json.loads(request.body)
        else:
            data = request.POST
            
        project = Project.objects.get(id=data.get('project_id'))
        
        # Check if manager owns this project
        manager = Manager.objects.get(user=request.user)
        if project.manager != manager:
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        # Get employee if assigned
        employee = None
        assigned_to = data.get('assigned_to')
        
        print(f"CREATE TASK - assigned_to raw value: '{assigned_to}' (type: {type(assigned_to)})")
        
        if assigned_to and assigned_to not in ['', 'undefined', 'null']:
            try:
                # Try to find the employee by user_id (since Employee uses user as PK)
                # Convert to int if it's a string
                if isinstance(assigned_to, str):
                    user_id = int(assigned_to)
                else:
                    user_id = assigned_to
                
                # Look up Employee by user_id (this is correct because Employee's PK = user_id)
                employee = Employee.objects.get(user_id=user_id)
                print(f"✅ Found employee: {employee.name} (user_id: {user_id})")
            except (ValueError, TypeError) as e:
                print(f"❌ Error converting to int: {e}")
            except Employee.DoesNotExist:
                print(f"❌ Employee not found with user_id: {assigned_to}")
                
                # Debug: List all employees
                print("📋 All employees in database:")
                for emp in Employee.objects.all():
                    print(f"   - {emp.name}: user_id={emp.user_id}, email={emp.email}")
        else:
            print("⚠️ No employee assigned or empty value received")
        
        # Create task
        task = Task.objects.create(
            title=data.get('title'),
            description=data.get('description', ''),
            project=project,
            assigned_to=employee,
            priority=data.get('priority', 'medium'),
            estimated_hours=float(data.get('estimated_hours')),
            due_date=data.get('due_date'),
            status='todo'
        )
        
        print(f"✅ Task created - ID: {task.id}")
        print(f"   assigned_to: {task.assigned_to}")
        print(f"   assigned_to_id: {task.assigned_to_id}")
        
                # Save dependencies if provided
        dependencies_raw = data.get('dependencies')
        if dependencies_raw:
            try:
                import json as _json
                dep_list = _json.loads(dependencies_raw) if isinstance(dependencies_raw, str) else dependencies_raw
                for dep_id in dep_list:
                    try:
                        depends_on = Task.objects.get(id=dep_id, project=project)
                        TaskDependency.objects.create(task=task, depends_on=depends_on)
                        print(f"✅ Added dependency: {task.title} depends on {depends_on.title}")
                    except Task.DoesNotExist:
                        print(f"❌ Dependency task {dep_id} not found")
                    except ValidationError as ve:
                        print(f"❌ Dependency validation error: {ve}")
            except Exception as de:
                print(f"❌ Error saving dependencies: {de}")

        return JsonResponse({'success': True, 'task_id': task.id})
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@api_login_required
def get_task_details(request, task_id):
    """Get details of a specific task"""
    try:
        task = Task.objects.get(id=task_id)
        
        # Check permissions
        if request.user.requested_role == 'manager':
            manager = Manager.objects.get(user=request.user)
            if task.project.manager != manager:
                return JsonResponse({'error': 'Unauthorized'}, status=403)
        elif request.user.requested_role == 'employee':
            employee = Employee.objects.get(user=request.user)
            if task.assigned_to != employee:
                return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        # Get dependencies
        dependencies = []
        for dep in task.dependencies.select_related('depends_on'):
            dependencies.append({
                'id': dep.id,
                'task_id': dep.depends_on.id,
                'task_title': dep.depends_on.title,
                'task_status': dep.depends_on.status,
                'is_completed': dep.depends_on.status == 'completed'
            })
        
        # Get dependent tasks
        dependents = []
        for dep in TaskDependency.objects.filter(depends_on=task).select_related('task'):
            dependents.append({
                'id': dep.id,
                'task_id': dep.task.id,
                'task_title': dep.task.title,
                'task_status': dep.task.status
            })
        
        return JsonResponse({
            'id': task.id,
            'title': task.title,
            'description': task.description,
            'project': task.project.name,
            'project_id': task.project.id,
            'assigned_to': task.assigned_to.name if task.assigned_to else None,
            'assigned_to_id': task.assigned_to.user_id if task.assigned_to else None,
            'priority': task.priority,
            'status': task.status,
            'estimated_hours': task.estimated_hours,
            'actual_hours': task.actual_hours,
            'due_date': task.due_date.strftime('%Y-%m-%d'),
            'completed_date': task.completed_date.strftime('%Y-%m-%d') if task.completed_date else None,
            'is_overdue': task.is_overdue,
            'has_pending_dependencies': task.has_pending_dependencies,
            'dependencies': dependencies,
            'dependent_tasks': dependents,
            'created_at': task.created_at.strftime('%Y-%m-%d %H:%M:%S')
        })
    except Task.DoesNotExist:
        return JsonResponse({'error': 'Task not found'}, status=404)

@csrf_exempt
@api_login_required
def update_task(request, task_id):
    """Update task details"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    try:
        task = Task.objects.get(id=task_id)
        
        print("\n" + "="*60)
        print(f"🔧 UPDATE TASK - ID: {task_id}")
        print(f"📝 Current task: {task.title}")
        print(f"📝 Current assigned_to: {task.assigned_to}")
        print(f"📝 Current assigned_to_id: {task.assigned_to_id}")
        
        # Only managers can update task details
        if request.user.requested_role != 'manager':
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        manager = Manager.objects.get(user=request.user)
        if task.project.manager != manager:
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        # Parse data
        if request.content_type == 'application/json':
            data = json.loads(request.body)
        else:
            data = request.POST
            
        print("\n📦 UPDATE TASK - Received data:")
        for key, value in data.items():
            print(f"   {key}: {value} (type: {type(value)})")
        
        # Update basic fields
        if data.get('title'):
            task.title = data.get('title')
            print(f"✅ Updated title to: {task.title}")
        
        if data.get('description') is not None:
            task.description = data.get('description')
            print(f"✅ Updated description")
        
        if data.get('priority'):
            task.priority = data.get('priority')
            print(f"✅ Updated priority to: {task.priority}")
        
        if data.get('estimated_hours'):
            task.estimated_hours = float(data.get('estimated_hours'))
            print(f"✅ Updated estimated_hours to: {task.estimated_hours}")
        
        if data.get('due_date'):
            task.due_date = data.get('due_date')
            print(f"✅ Updated due_date to: {task.due_date}")
        
        ## Update assignment
        assigned_to_value = data.get('assigned_to')
        print(f"\n🔍 ASSIGNMENT UPDATE:")
        print(f"   Raw assigned_to value: '{assigned_to_value}'")
        print(f"   Value type: {type(assigned_to_value)}")

        # Check if assigned_to field was sent
        if 'assigned_to' in data:
            print(f"   assigned_to field IS present in request")
            
            if assigned_to_value and assigned_to_value != '' and assigned_to_value != 'undefined' and assigned_to_value != 'null':
                try:
                    # Convert to int if needed
                    if isinstance(assigned_to_value, str):
                        user_id = int(assigned_to_value)
                    else:
                        user_id = assigned_to_value
                    
                    print(f"   Looking for Employee with user_id = {user_id}")
                    
                    # Find employee by user_id (since Employee's PK = user_id)
                    employee = Employee.objects.get(user_id=user_id)
                    task.assigned_to = employee
                    print(f"   ✅ Assigned to employee: {employee.name} (user_id: {employee.user_id})")
                    
                except (ValueError, TypeError) as e:
                    print(f"   ❌ Error converting to int: {e}")
                    print(f"   ⚠️ Keeping existing assignment")
                except Employee.DoesNotExist:
                    print(f"   ❌ Employee not found with user_id: {user_id}")
                    
                    # Debug: List all employees
                    print("   📋 All employees in database:")
                    for emp in Employee.objects.all():
                        print(f"      - {emp.name}: user_id={emp.user_id}")
                    
                    print(f"   ⚠️ Keeping existing assignment")
                except Exception as e:
                    print(f"   ❌ Unexpected error: {e}")
                    print(f"   ⚠️ Keeping existing assignment")
            else:
                # Explicitly set to None (unassigned)
                task.assigned_to = None
                print(f"   ⚠️ Task explicitly unassigned (empty value)")
        else:
            print(f"   assigned_to field NOT present - keeping current value: {task.assigned_to}")
        
        print(f"\n💾 Saving task...")
        print(f"   assigned_to before save: {task.assigned_to}")
        print(f"   assigned_to_id before save: {task.assigned_to_id}")
        
        task.save()
        
        # Refresh from database
        task.refresh_from_db()
        print(f"\n🔄 After save and refresh:")
        print(f"   assigned_to: {task.assigned_to}")
        print(f"   assigned_to_id: {task.assigned_to_id}")
        if task.assigned_to:
            print(f"   assigned_to name: {task.assigned_to.name}")
        
        # Update dependencies if provided
        if data.get('dependencies'):
            try:
                import json
                dep_list = json.loads(data.get('dependencies'))
                print(f"\n📦 Dependencies to update: {dep_list}")
                # Clear existing dependencies
                TaskDependency.objects.filter(task=task).delete()
                # Add new dependencies
                for dep_id in dep_list:
                    try:
                        depends_on = Task.objects.get(id=dep_id, project=task.project)
                        TaskDependency.objects.create(task=task, depends_on=depends_on)
                        print(f"   ✅ Added dependency: {task.title} depends on {depends_on.title}")
                    except Task.DoesNotExist:
                        print(f"   ❌ Dependency task {dep_id} not found")
            except Exception as e:
                print(f"   ❌ Error updating dependencies: {e}")
        
        print("="*60 + "\n")
        return JsonResponse({'success': True})
        
    except Task.DoesNotExist:
        return JsonResponse({'error': 'Task not found'}, status=404)
    except Exception as e:
        print(f"❌ ERROR in update_task: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

@csrf_exempt
@api_login_required
def delete_task(request, task_id):
    """Delete a task, cleaning up all dependencies"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    try:
        task = Task.objects.get(id=task_id)
        
        # Check permissions
        if request.user.requested_role != 'manager':
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        manager = Manager.objects.get(user=request.user)
        if task.project.manager != manager:
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        # Find tasks that were depending on THIS task (they become unblocked)
        dependent_tasks = Task.objects.filter(
            dependencies__depends_on=task
        ).exclude(status='completed')
        
        for dep_task in dependent_tasks:
            # Remove the dependency row for this specific blocker
            TaskDependency.objects.filter(task=dep_task, depends_on=task).delete()
            # If that was their only blocker, unblock them
            if not dep_task.has_pending_dependencies and dep_task.status == 'blocked':
                dep_task.status = 'todo'
                dep_task.save()
                print(f"✅ Unblocked task: {dep_task.title}")
        
        # Django CASCADE handles deleting TaskDependency rows where
        # this task is the dependent (task.dependencies) automatically.
        # The manual cleanup above handles rows where it's the blocker.
        
        task_title = task.title
        task.delete()
        print(f"✅ Deleted task: {task_title}")
        return JsonResponse({'success': True})
    except Task.DoesNotExist:
        return JsonResponse({'error': 'Task not found'}, status=404)

@csrf_exempt
@api_login_required
def update_task_status(request, task_id):
    """Update task status (for employees)"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    try:
        task = Task.objects.get(id=task_id)
        
        # Check if task is assigned to this employee
        if request.user.requested_role == 'employee':
            employee = Employee.objects.get(user=request.user)
            if task.assigned_to != employee:
                return JsonResponse({'error': 'Task not assigned to you'}, status=403)
        
        data = json.loads(request.body) if request.content_type == 'application/json' else request.POST
        new_status = data.get('status')
        
        # Check dependencies if trying to start task
        if new_status == 'in_progress' and task.has_pending_dependencies:
            return JsonResponse({
                'error': 'Cannot start task - pending dependencies',
                'blocking_tasks': [{'id': t.id, 'title': t.title} for t in task.blocking_tasks]
            }, status=400)
        
        if new_status in dict(Task.STATUS_CHOICES).keys():
            task.status = new_status
            
            # If completed, set completed date
            if new_status == 'completed':
                task.completed_date = timezone.now().date()
                
                # Check if this unblocks any dependent tasks
                dependent_tasks = Task.objects.filter(dependencies__depends_on=task)
                for dep_task in dependent_tasks:
                    if not dep_task.has_pending_dependencies and dep_task.status == 'blocked':
                        dep_task.status = 'todo'
                        dep_task.save()
            
            task.save()
            return JsonResponse({'success': True, 'status': new_status})
        
        return JsonResponse({'error': 'Invalid status'}, status=400)
    except Task.DoesNotExist:
        return JsonResponse({'error': 'Task not found'}, status=404)

@csrf_exempt
@api_login_required
def log_actual_hours(request, task_id):
    """Log actual hours spent on task"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    try:
        task = Task.objects.get(id=task_id)
        
        # Check if task is assigned to this employee
        if request.user.requested_role == 'employee':
            employee = Employee.objects.get(user=request.user)
            if task.assigned_to != employee:
                return JsonResponse({'error': 'Task not assigned to you'}, status=403)
        
        data = json.loads(request.body) if request.content_type == 'application/json' else request.POST
        actual_hours = float(data.get('actual_hours'))
        
        task.actual_hours = actual_hours
        task.save()
        
        return JsonResponse({'success': True})
    except Task.DoesNotExist:
        return JsonResponse({'error': 'Task not found'}, status=404)
    except ValueError:
        return JsonResponse({'error': 'Invalid hours value'}, status=400)


# ==================== TASK DEPENDENCY APIs ====================
@csrf_exempt
@api_login_required
def add_task_dependency(request):
    """Add a dependency between tasks"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    if request.user.requested_role != 'manager':
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    
    try:
        data = json.loads(request.body) if request.content_type == 'application/json' else request.POST
        
        task_id = data.get('task_id')
        depends_on_id = data.get('depends_on_id')
        
        task = Task.objects.get(id=task_id)
        depends_on = Task.objects.get(id=depends_on_id)
        
        # Check if manager owns both tasks' projects
        manager = Manager.objects.get(user=request.user)
        if task.project.manager != manager or depends_on.project.manager != manager:
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        # Check if tasks are in the same project
        if task.project != depends_on.project:
            return JsonResponse({'error': 'Dependencies must be within the same project'}, status=400)
        
        # Create dependency
        dependency = TaskDependency.objects.create(
            task=task,
            depends_on=depends_on
        )
        
        return JsonResponse({
            'success': True,
            'dependency_id': dependency.id
        })
    except Task.DoesNotExist:
        return JsonResponse({'error': 'Task not found'}, status=404)
    except ValidationError as e:
        return JsonResponse({'error': str(e)}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

@csrf_exempt
@api_login_required
def remove_task_dependency(request, dependency_id):
    """Remove a task dependency"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    try:
        dependency = TaskDependency.objects.get(id=dependency_id)
        
        # Check permissions
        if request.user.requested_role == 'manager':
            manager = Manager.objects.get(user=request.user)
            if dependency.task.project.manager != manager:
                return JsonResponse({'error': 'Unauthorized'}, status=403)
        else:
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        dependency.delete()
        return JsonResponse({'success': True})
    except TaskDependency.DoesNotExist:
        return JsonResponse({'error': 'Dependency not found'}, status=404)


@api_login_required
def get_task_dependencies(request, task_id):
    """Get all dependencies for a task"""
    try:
        task = Task.objects.get(id=task_id)
        
        # Check permissions
        if request.user.requested_role == 'manager':
            manager = Manager.objects.get(user=request.user)
            if task.project.manager != manager:
                return JsonResponse({'error': 'Unauthorized'}, status=403)
        elif request.user.requested_role == 'employee':
            employee = Employee.objects.get(user=request.user)
            if task.assigned_to != employee:
                return JsonResponse({'error': 'Unauthorized'}, status=403)
        
        # Get tasks this task depends on
        dependencies = TaskDependency.objects.filter(task=task).select_related('depends_on')
        depends_on_list = []
        for dep in dependencies:
            depends_on_list.append({
                'id': dep.id,
                'task_id': dep.depends_on.id,
                'task_title': dep.depends_on.title,
                'task_status': dep.depends_on.status,
                'is_completed': dep.depends_on.status == 'completed'
            })
        
        # Get tasks that depend on this task
        dependents = TaskDependency.objects.filter(depends_on=task).select_related('task')
        dependent_list = []
        for dep in dependents:
            dependent_list.append({
                'id': dep.id,
                'task_id': dep.task.id,
                'task_title': dep.task.title,
                'task_status': dep.task.status
            })
        
        return JsonResponse({
            'depends_on': depends_on_list,
            'dependent_tasks': dependent_list
        })
    except Task.DoesNotExist:
        return JsonResponse({'error': 'Task not found'}, status=404)


# ==================== MANAGER DASHBOARD DATA ====================

@api_login_required
def manager_dashboard_data(request):
    """Get all data needed for manager dashboard"""
    if request.user.requested_role != 'manager':
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    
    try:
        manager = Manager.objects.get(user=request.user)
        print("✅ Got manager:", manager.name)
        
        # Get all projects
        projects = Project.objects.filter(manager=manager)
        print(f"✅ Found {projects.count()} projects")
        
        # Get all employees
        employees = Employee.objects.all()
        print(f"✅ Found {employees.count()} employees")
        
        # Get all tasks across all projects
        all_tasks = Task.objects.filter(project__manager=manager)
        print(f"✅ Found {all_tasks.count()} tasks")
        
        # Calculate statistics
        active_projects = projects.filter(
            tasks__status__in=['todo', 'in_progress', 'blocked']
        ).distinct().count()
        # Weekly activity — past 4 weeks (Sunday to Saturday)
        from datetime import date, timedelta, datetime as dt
        from django.utils.timezone import make_aware, is_naive
        today = date.today()
        # Find most recent Sunday (Mon=0 ... Sun=6)
        days_since_sunday = (today.weekday() + 1) % 7
        this_sunday = today - timedelta(days=days_since_sunday)

        weekly_activity = []
        for i in range(3, -1, -1):  # 3 weeks ago → current week
            week_start = this_sunday - timedelta(weeks=i)
            week_end   = week_start + timedelta(days=6)  # Saturday

            # Use timezone-aware datetimes for created_at (DateTimeField)
            week_start_dt = make_aware(dt.combine(week_start, dt.min.time()))
            week_end_dt   = make_aware(dt.combine(week_end,   dt.max.time()))

            created = all_tasks.filter(
                created_at__gte=week_start_dt,
                created_at__lte=week_end_dt
            ).count()

            # completed_date is a plain DateField — no timezone needed
            completed = all_tasks.filter(
                completed_date__gte=week_start,
                completed_date__lte=week_end
            ).count()

            if i == 0:
                label = f'This Week ({week_start.strftime("%b %d")})'
            else:
                label = week_start.strftime('%b %d')

            weekly_activity.append({
                'label':     label,
                'created':   created,
                'completed': completed,
            })
        total_tasks = all_tasks.count()
        completed_tasks = all_tasks.filter(status='completed').count()
        in_progress_tasks = all_tasks.filter(status='in_progress').count()
        blocked_tasks = all_tasks.filter(status='blocked').count()
        
        print("✅ Statistics calculated")
        
        # Calculate workload for each employee
        employee_workload = []
        for emp in employees:
            try:
                emp_tasks = Task.objects.filter(assigned_to=emp, status__in=['todo', 'in_progress', 'blocked'])
                total_hours = emp_tasks.aggregate(total=Sum('estimated_hours'))['total'] or 0
                task_count = emp_tasks.count()
                completed = Task.objects.filter(assigned_to=emp, status='completed').count()
                in_progress = Task.objects.filter(assigned_to=emp, status='in_progress').count()
                
                # Determine status — capacity is 160h/month
                CAPACITY = 160
                utilization = round((total_hours / CAPACITY) * 100) if total_hours > 0 else 0

                if total_hours > 120:
                    status = 'overloaded'
                    status_class = 'danger'
                elif total_hours >= 60:
                    status = 'balanced'
                    status_class = 'success'
                else:
                    status = 'underutilized'
                    status_class = 'warning'
                
                employee_workload.append({
                    'id': emp.user.id,
                    'name': emp.name,
                    'initials': ''.join([n[0] for n in emp.name.split()[:2]]).upper(),
                    'email': emp.email,
                    'skills': emp.skills,
                    'task_count': task_count,
                    'completed': completed,
                    'inProgress': in_progress,
                    'hours': total_hours,
                    'status': status,
                    'status_class': status_class,
                    'utilization': min(utilization, 100),
                    'color': f'#{hash(emp.name) % 0xFFFFFF:06x}'
                })
            except Exception as e:
                print(f"❌ Error processing employee {emp.name}: {str(e)}")
                import traceback
                traceback.print_exc()
        
        print(f"✅ Processed {len(employee_workload)} employees")
        
        # Recent projects for home page
        recent_projects = []
        for p in projects.order_by('-created_at')[:5]:
            try:
                recent_projects.append({
                    'id': p.id,
                    'name': p.name,
                    'status': p.get_status_display(),
                    'progress': p.progress,
                    'task_count': p.task_count,
                    'color': p.color
                })
            except Exception as e:
                print(f"❌ Error processing recent project {p.name}: {str(e)}")
        
        print(f"✅ Processed {len(recent_projects)} recent projects")
        
        # All projects for projects page — re-fetch fresh to get latest progress
        all_projects_list = []
        for p in Project.objects.filter(manager=manager).prefetch_related('tasks'):
            try:
                # Test date formatting separately
                end_date_str = ''
                if p.end_date:
                    try:
                        end_date_str = p.end_date.strftime('%b %d, %Y')
                    except AttributeError:
                        end_date_str = str(p.end_date)
                all_projects_list.append({
                    'id': p.id,
                    'name': p.name,
                    'description': p.description,
                    'priority': p.priority,
                    'status': p.status,
                    'progress': p.progress,
                    'end_date': end_date_str,
                    'completed_tasks': p.completed_tasks,
                    'pending_tasks': p.pending_tasks,
                    'task_count': p.task_count
                })
            except Exception as e:
                print(f"❌ Error processing project {p.name}: {str(e)}")
                print(f"   p.end_date type: {type(p.end_date)}")
                print(f"   p.end_date value: {p.end_date}")
                import traceback
                traceback.print_exc()
        
        print(f"✅ Processed {len(all_projects_list)} projects")
        
        # All tasks for simulation page
        all_tasks_list = []
        for t in all_tasks.order_by('-created_at')[:50]:
            try:
            # Safely get assigned_to info
                assigned_to_info = None
                if t.assigned_to:
                    assigned_to_info = {
                        'id': t.assigned_to.user_id,
                        'name': t.assigned_to.name,
                        'user_id': t.assigned_to.user_id
                    }
                    print(f"Task {t.id} assigned to: {t.assigned_to.name} (ID: {t.assigned_to.user_id})")
                else:
                    print(f"Task {t.id} is unassigned")
        
                all_tasks_list.append({
                'id': t.id,
                'title': t.title,
                'description': t.description,
                'project': {'id': t.project.id, 'name': t.project.name},
                'assigned_to': assigned_to_info,
                'estimated_hours': t.estimated_hours,
                'priority': t.priority,
                'status': t.status,
                'has_pending_dependencies': t.has_pending_dependencies
                })
            except Exception as e:
                print(f"❌ Error processing task {t.title}: {str(e)}")
                continue
        
        print(f"✅ Processed {len(all_tasks_list)} tasks")
        
        # Workload distribution for charts
        workload_dist = [{
            'employee': emp['name'],
            'hours': emp['hours'],
            'status': emp['status']
        } for emp in employee_workload]
        
        # Calculate totals for performance page
        total_pending_tasks = total_tasks - completed_tasks
        
        print("✅ Preparing final response")
        
        response_data = {
            'manager_name': manager.name,
            'manager_initials': ''.join([n[0] for n in manager.name.split()[:2]]).upper(),
            'manager_email': manager.email,
            
            # Home page data
            'weekly_activity': weekly_activity,
            'active_projects': active_projects,
            'completed_tasks': completed_tasks,
            'in_progress_tasks': in_progress_tasks,
            'blocked_tasks': blocked_tasks,
            'todo_tasks': all_tasks.filter(status='todo').count(),
            'total_team_members': employees.count(),
            'completion_rate': round((completed_tasks / total_tasks * 100)) if total_tasks > 0 else 0,
            'recent_projects': recent_projects,
            'employee_workload': employee_workload,
            
            # Projects page data
            'all_projects': all_projects_list,
            
            # Workload page data
            'overloaded_count': sum(1 for w in employee_workload if w['status'] == 'overloaded'),
            'balanced_count': sum(1 for w in employee_workload if w['status'] == 'balanced'),
            'underutilized_count': sum(1 for w in employee_workload if w['status'] == 'underutilized'),
            'workload_distribution': workload_dist,
            
            # Simulation page data
            'all_tasks': all_tasks_list,
            'all_employees': [{'user_id': e.user.id, 'name': e.name, 'skills': e.skills or 'No skills'} for e in employees],
            
            # Performance page data
            'total_completed_tasks': completed_tasks,
            'total_pending_tasks': total_pending_tasks,
            'overall_completion_rate': round((completed_tasks / total_tasks * 100)) if total_tasks > 0 else 0,
        }
        
        print("✅ Response prepared successfully")
        return JsonResponse(response_data)
        
    except Exception as e:
        print(f"❌ CRITICAL ERROR in manager_dashboard_data: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


# ==================== EMPLOYEE DASHBOARD DATA ====================

@api_login_required
def employee_dashboard_data(request):
    """Get all data needed for employee dashboard"""
    if request.user.requested_role != 'employee':
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    
    try:
        employee = Employee.objects.get(user=request.user)
        
        # Get all tasks for this employee
        all_tasks = Task.objects.filter(assigned_to=employee)
        
        # Separate by status
        todo_tasks = all_tasks.filter(status='todo')
        in_progress_tasks = all_tasks.filter(status='in_progress')
        completed_tasks = all_tasks.filter(status='completed')
        blocked_tasks = all_tasks.filter(status='blocked')
        
        # Calculate stats
        total_tasks = all_tasks.count()
        in_progress_count = in_progress_tasks.count()
        completed_count = completed_tasks.count()
        blocked_count = blocked_tasks.count()
        overdue_count = all_tasks.filter(status__in=['todo', 'in_progress', 'blocked'], due_date__lt=timezone.now().date()).count()
        
        # Completion rate
        completion_rate = round((completed_count / total_tasks * 100)) if total_tasks > 0 else 0
        
        # Hours
        estimated_hours = all_tasks.aggregate(total=Sum('estimated_hours'))['total'] or 0
        actual_hours = all_tasks.filter(actual_hours__isnull=False).aggregate(total=Sum('actual_hours'))['total'] or 0
        variance = abs(actual_hours - estimated_hours)
        
        # Priority counts
        high_priority = all_tasks.filter(priority='high', status__in=['todo', 'in_progress', 'blocked']).count()
        medium_priority = all_tasks.filter(priority='medium', status__in=['todo', 'in_progress', 'blocked']).count()
        low_priority = all_tasks.filter(priority='low', status__in=['todo', 'in_progress', 'blocked']).count()
        
        # Recent tasks
        recent_tasks = []
        for t in all_tasks.order_by('-updated_at')[:5]:
            recent_tasks.append({
                'id': t.id,
                'title': t.title,
                'priority': t.priority,
                'status': t.status,
                'project': t.project.name,
                'has_pending_dependencies': t.has_pending_dependencies
            })
        
        # All tasks for tasks page
        all_tasks_list = []
        for t in all_tasks.order_by('due_date'):
            all_tasks_list.append({
                'id': t.id,
                'title': t.title,
                'project': t.project.name,
                'priority': t.priority,
                'status': t.status,
                'due_date': t.due_date.strftime('%Y-%m-%d'),
                'is_overdue': t.is_overdue,
                'has_pending_dependencies': t.has_pending_dependencies
            })
        
        return JsonResponse({
            'employee_name': employee.name,
            'employee_initials': ''.join([n[0] for n in employee.name.split()[:2]]).upper(),
            'employee_email': employee.email,
            'employee_skills': employee.skills or 'No skills added yet',
            'employee_experience': f"{employee.experience_years} years" if employee.experience_years else 'Not set',
            
            # Home page data
            'total_tasks': total_tasks,
            'in_progress_tasks': in_progress_count,
            'completed_tasks': completed_count,
            'blocked_tasks': blocked_count,
            'overdue_tasks': overdue_count,
            'completion_rate': completion_rate,
            'estimated_hours': estimated_hours,
            'actual_hours': actual_hours,
            'variance_hours': variance,
            'high_priority_tasks': high_priority,
            'medium_priority_tasks': medium_priority,
            'low_priority_tasks': low_priority,
            'recent_tasks': recent_tasks,
            
            # Tasks page data
            'all_tasks': all_tasks_list,
            'todo_tasks': [t for t in all_tasks_list if t['status'] == 'todo'],
            'in_progress_tasks_list': [t for t in all_tasks_list if t['status'] == 'in_progress'],
            'completed_tasks_list': [t for t in all_tasks_list if t['status'] == 'completed'],
            'blocked_tasks_list': [t for t in all_tasks_list if t['status'] == 'blocked'],
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@api_login_required
def get_my_tasks(request):
    """Get tasks for the logged-in employee"""
    if request.user.requested_role != 'employee':
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    
    try:
        employee = Employee.objects.get(user=request.user)
        tasks = Task.objects.filter(assigned_to=employee).order_by('due_date')
        
        tasks_list = []
        for t in tasks:
            tasks_list.append({
                'id': t.id,
                'title': t.title,
                'description': t.description,
                'project': t.project.name,
                'project_id': t.project.id,
                'priority': t.priority,
                'status': t.status,
                'estimated_hours': t.estimated_hours,
                'actual_hours': t.actual_hours,
                'due_date': t.due_date.strftime('%Y-%m-%d'),
                'is_overdue': t.is_overdue,
                'has_pending_dependencies': t.has_pending_dependencies
            })
        
        return JsonResponse(tasks_list, safe=False)
    except Employee.DoesNotExist:
        return JsonResponse({'error': 'Employee not found'}, status=404)


@api_login_required
def get_my_workload(request):
    """Get workload analysis for the logged-in employee"""
    if request.user.requested_role != 'employee':
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    
    try:
        employee = Employee.objects.get(user=request.user)
        
        # Get tasks
        all_tasks = Task.objects.filter(assigned_to=employee)
        active_tasks = all_tasks.filter(status__in=['todo', 'in_progress', 'blocked'])
        completed_tasks = all_tasks.filter(status='completed')
        
        # Calculate workload
        total_hours = active_tasks.aggregate(total=Sum('estimated_hours'))['total'] or 0
        capacity = 160  # Default monthly capacity
        workload_percentage = round((total_hours / capacity * 100)) if capacity > 0 else 0
        
        # Workload by project
        project_workload = []
        for project in Project.objects.filter(tasks__assigned_to=employee).distinct():
            project_tasks = active_tasks.filter(project=project)
            if project_tasks.exists():
                hours = project_tasks.aggregate(total=Sum('estimated_hours'))['total'] or 0
                project_workload.append({
                    'project': project.name,
                    'hours': hours,
                    'color': project.color
                })
        
        return JsonResponse({
            'total_hours': total_hours,
            'capacity': capacity,
            'workload_percentage': workload_percentage,
            'project_workload': project_workload,
            'active_task_count': active_tasks.count(),
            'completed_task_count': completed_tasks.count(),
            'blocked_task_count': active_tasks.filter(status='blocked').count()
        })
    except Employee.DoesNotExist:
        return JsonResponse({'error': 'Employee not found'}, status=404)