from django.shortcuts import redirect
from django.contrib import messages
from .models import Admin, Manager, Employee

def unauthenticated_required(view_func):
    """Redirect to dashboard if user is already logged in"""
    def wrapper_func(request, *args, **kwargs):
        if request.session.get('user_email'):
            return redirect('dashboard_redirect')
        return view_func(request, *args, **kwargs)
    return wrapper_func

def admin_required(view_func):
    """Check if logged in user is admin (using custom Admin model)"""
    def wrapper_func(request, *args, **kwargs):
        user_email = request.session.get('user_email')
        if not user_email:
            messages.error(request, "Please login first.")
            return redirect('login')
        
        # Check session flag first
        if request.session.get('is_admin'):
            return view_func(request, *args, **kwargs)
        
        # Check if user exists in custom Admin model
        try:
            admin = Admin.objects.get(email=user_email)
            request.session['is_admin'] = True
            return view_func(request, *args, **kwargs)
        except Admin.DoesNotExist:
            messages.error(request, "Access denied. Admin only.")
            return redirect('dashboard_redirect')
    return wrapper_func

def manager_required(view_func):
    """Check if logged in user is manager"""
    def wrapper_func(request, *args, **kwargs):
        user_email = request.session.get('user_email')
        if not user_email:
            messages.error(request, "Please login first.")
            return redirect('login')
        
        try:
            manager = Manager.objects.get(email=user_email)
            return view_func(request, *args, **kwargs)
        except Manager.DoesNotExist:
            messages.error(request, "Access denied. Manager only.")
            return redirect('dashboard_redirect')
    return wrapper_func

def employee_required(view_func):
    """Check if logged in user is employee"""
    def wrapper_func(request, *args, **kwargs):
        user_email = request.session.get('user_email')
        if not user_email:
            messages.error(request, "Please login first.")
            return redirect('login')
        
        try:
            employee = Employee.objects.get(email=user_email)
            return view_func(request, *args, **kwargs)
        except Employee.DoesNotExist:
            messages.error(request, "Access denied. Employee only.")
            return redirect('dashboard_redirect')
    return wrapper_func

def role_required(allowed_roles):
    """Generic role checker for custom roles"""
    def decorator(view_func):
        def wrapper_func(request, *args, **kwargs):
            user_email = request.session.get('user_email')
            if not user_email:
                messages.error(request, "Please login first.")
                return redirect('login')
            
            # Check admin role (custom Admin model)
            if 'admin' in allowed_roles:
                try:
                    admin = Admin.objects.get(email=user_email)
                    return view_func(request, *args, **kwargs)
                except Admin.DoesNotExist:
                    pass
            
            # Check manager role
            if 'manager' in allowed_roles:
                try:
                    manager = Manager.objects.get(email=user_email)
                    return view_func(request, *args, **kwargs)
                except Manager.DoesNotExist:
                    pass
            
            # Check employee role
            if 'employee' in allowed_roles:
                try:
                    employee = Employee.objects.get(email=user_email)
                    return view_func(request, *args, **kwargs)
                except Employee.DoesNotExist:
                    pass
            
            messages.error(request, "Access denied. Insufficient permissions.")
            return redirect('dashboard_redirect')
        return wrapper_func
    return decorator