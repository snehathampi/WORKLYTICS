from django.urls import path
from . import views

urlpatterns = [
    # API endpoints for projects
    path('api/projects/', views.get_projects, name='api_projects'),
    path('api/projects/create/', views.create_project, name='create_project'),
    path('api/projects/<int:project_id>/', views.get_project_details, name='api_project_details'),
    path('api/projects/<int:project_id>/update/', views.update_project, name='update_project'),
    path('api/projects/<int:project_id>/delete/', views.delete_project, name='delete_project'),
    
    # API endpoints for tasks
    path('api/tasks/create/', views.create_task, name='create_task'),
    path('api/tasks/<int:task_id>/', views.get_task_details, name='api_task_details'),
    path('api/tasks/<int:task_id>/update/', views.update_task, name='update_task'),
    path('api/tasks/<int:task_id>/delete/', views.delete_task, name='delete_task'),
    path('api/tasks/<int:task_id>/status/', views.update_task_status, name='update_task_status'),
    path('api/tasks/<int:task_id>/hours/', views.log_actual_hours, name='log_actual_hours'),
    
    # API endpoints for task dependencies
    path('api/tasks/dependencies/add/', views.add_task_dependency, name='add_task_dependency'),
    path('api/tasks/dependencies/<int:dependency_id>/remove/', views.remove_task_dependency, name='remove_task_dependency'),
    path('api/tasks/<int:task_id>/dependencies/', views.get_task_dependencies, name='get_task_dependencies'),
    
    # Data for dashboards
    path('api/manager/dashboard/', views.manager_dashboard_data, name='manager_dashboard_data'),
    path('api/employee/dashboard/', views.employee_dashboard_data, name='employee_dashboard_data'),
    path('api/employee/tasks/', views.get_my_tasks, name='get_my_tasks'),
    path('api/employee/workload/', views.get_my_workload, name='get_my_workload'),
]