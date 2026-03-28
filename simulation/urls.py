"""
simulation/urls.py
"""
from django.urls import path
from . import views

app_name = 'simulation'

urlpatterns = [
    # Load full project state for the sandbox
    path('api/project/<int:project_id>/load/',    views.load_project,       name='load_project'),
    # Run heuristic analysis (no DB write)
    path('api/project/<int:project_id>/analyse/', views.analyse_simulation,  name='analyse_simulation'),
    # Apply simulation changes to real DB
    path('api/project/<int:project_id>/apply/',   views.apply_simulation,    name='apply_simulation'),
]