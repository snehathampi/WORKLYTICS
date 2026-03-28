from django.urls import path
from . import views

app_name = 'appraisal'

urlpatterns = [
    path('api/evaluate/', views.evaluate_team, name='evaluate_team'),
]