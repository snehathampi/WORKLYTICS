from django.urls import path
from . import views

urlpatterns = [
    # Authentication
    path('register/', views.register_view, name='register'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('verification-sent/', views.verification_sent, name='verification_sent'),
    path('verify/<str:uidb64>/<str:token>/', views.verify_email, name='verify_email'),
    
    # Dashboard
    path('dashboard/', views.dashboard_redirect, name='dashboard_redirect'),
    path('dashboard/admin/', views.admin_dashboard, name='admin_dashboard'),
    path('dashboard/manager/', views.manager_dashboard, name='manager_dashboard'),
    path('dashboard/employee/', views.employee_dashboard, name='employee_dashboard'),
    
    # Admin actions
    path('admin/approve/<int:user_id>/', views.approve_user, name='approve_user'),
    path('admin/reject/<int:user_id>/', views.reject_user, name='reject_user'),
    path('admin/remove/<str:user_type>/<int:user_id>/', views.remove_user, name='remove_user'),
]