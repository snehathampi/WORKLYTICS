from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.contrib.auth.hashers import make_password, check_password
from django.http import HttpResponse
from .models import User, Manager, Employee, Admin
from .forms import RegisterForm, LoginForm
from .utils import generate_verification_token, send_verification_email
from .decorators import unauthenticated_required, admin_required, role_required
from django.contrib.auth.tokens import default_token_generator
from datetime import timedelta
from core.models import Project 

# Public pages
def index(request):
    return render(request, 'index.html')

@unauthenticated_required
def register_view(request):
    if request.method == 'POST':
        form = RegisterForm(request.POST)

        print("=" * 50)
        print("RAW POST DATA:")
        print(request.POST)
        print("=" * 50)
        if form.is_valid():
            print("✅ FORM IS VALID")
            print("CLEANED DATA:")
            print(form.cleaned_data)
            # Get common data
            email = form.cleaned_data['email']
            employee_id = form.cleaned_data['employee_id']
            role = form.cleaned_data['role']
            password = form.cleaned_data['password']
            
            # Create user with pending_verification status
            user = User.objects.create(
                email=email,
                employee_id=employee_id,
                requested_role=role,
                password=make_password(password),
                status='pending_verification',
                is_active=False
            )
            
            # Generate verification token
            token = generate_verification_token(user)
            user.verification_token = token
            user.token_created_at = timezone.now()
            user.save()
            
            # Store role-specific data in session temporarily
            # (will be used when admin approves to populate manager/employee tables)
            if role == 'employee':
                print("🔵 EMPLOYEE PATH - role is:", role)
                print(f"Skills from cleaned_data: {form.cleaned_data.get('skills')}")
                print(f"Experience: {form.cleaned_data.get('experience_years')}")
                print(f"Name: {form.cleaned_data.get('name')}")
                request.session['pending_user_data'] = {
                    'user_id': user.id,
                    'role': role,
                    'name': form.cleaned_data.get('name'),
                    'skills': form.cleaned_data.get('skills'),
                    'experience_years': form.cleaned_data.get('experience_years'),
                }
                print(f"✅ Session data set: {request.session['pending_user_data']}")
            else:  # manager
                request.session['pending_user_data'] = {
                    'user_id': user.id,
                    'role': role,
                    'name': form.cleaned_data.get('name'),
                    'years_of_experience': form.cleaned_data.get('mgr_experience_years'),
                    'department': form.cleaned_data.get('department'),
                }
            
            # Send verification email
            try:
                send_verification_email(request, user, token)
                messages.success(request, "Registration successful! Please check your email to verify your account.")
            except Exception as e:
                messages.warning(request, f"Registration successful but email could not be sent: {str(e)}")
            
            return redirect('verification_sent')
    else:
        form = RegisterForm()
    
    return render(request, 'register.html', {'form': form})

def verification_sent(request):
    return render(request, 'accounts/verification_sent.html')

def verify_email(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
        
        # Check if token matches and is not expired (24 hours)
        if user.verification_token == token and user.token_created_at:
            time_diff = timezone.now() - user.token_created_at
            if time_diff < timedelta(hours=24):
                # Move to pending_approval
                user.status = 'pending_approval'
                user.is_active = True
                user.verification_token = None
                user.save()
                
                messages.success(request, "Email verified successfully! Please wait for admin approval.")
                return redirect('login')
            else:
                messages.error(request, "Verification link has expired. Please register again.")
        else:
            messages.error(request, "Invalid verification link.")
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        messages.error(request, "Invalid verification link.")
    
    return redirect('index')

@unauthenticated_required
def login_view(request):
    if request.method == 'POST':
        form = LoginForm(request.POST)
        if form.is_valid():
            email = form.cleaned_data['email']
            password = form.cleaned_data['password']
            
            # First check if it's admin
            try:
                admin = Admin.objects.get(email=email)
                if check_password(password, admin.password):
                    request.session['user_email'] = admin.email
                    request.session['is_admin'] = True
                    messages.success(request, "Admin login successful!")
                    return redirect('admin_dashboard')
                else:
                    messages.error(request, "Invalid password.")
                    return render(request, 'login.html', {'form': form})
            except Admin.DoesNotExist:
                pass  # Not admin, check regular users
            
            # Check regular users using Django's authenticate
            user = authenticate(request, username=email, password=password)
            
            if user is not None:
                if user.status == 'pending_verification':
                    messages.error(request, "Please verify your email first. Check your inbox.")
                elif user.status == 'pending_approval':
                    messages.warning(request, "Your account is pending admin approval. You'll be notified once approved.")
                elif user.status == 'approved':
                    # Use Django's login to create the session properly
                    login(request, user)
                    request.session['user_email'] = user.email
                    request.session['user_role'] = user.approved_role
                    
                    print(f"✅ User logged in: {user.email}")
                    print(f"✅ Session created: {request.session.session_key}")
                    
                    if user.approved_role == 'manager':
                        return redirect('manager_dashboard')
                    elif user.approved_role == 'employee':
                        return redirect('employee_dashboard')
                elif user.status == 'rejected':
                    messages.error(request, "Your registration was rejected. Contact admin.")
            else:
                messages.error(request, "Invalid email or password.")
    else:
        form = LoginForm()
    
    return render(request, 'login.html', {'form': form})

def logout_view(request):
    logout(request)  # Use Django's logout
    request.session.flush()
    messages.success(request, "Logged out successfully.")
    return redirect('index')

def dashboard_redirect(request):
    """Redirect user to their appropriate dashboard"""
    if request.user.is_authenticated:
        if hasattr(request.user, 'approved_role'):
            if request.user.approved_role == 'manager':
                return redirect('manager_dashboard')
            elif request.user.approved_role == 'employee':
                return redirect('employee_dashboard')
    
    # Check if admin (legacy)
    user_email = request.session.get('user_email')
    if user_email:
        try:
            admin = Admin.objects.get(email=user_email)
            return redirect('admin_dashboard')
        except Admin.DoesNotExist:
            pass
    
    messages.error(request, "Session expired. Please login again.")
    return redirect('logout')

# Admin Dashboard Views
@admin_required
def admin_dashboard(request):
    if not request.session.get('is_admin'):
        try:
            admin = Admin.objects.get(email=request.session.get('user_email'))
            request.session['is_admin'] = True
        except (Admin.DoesNotExist, KeyError):
            messages.error(request, "Access denied. Admin only.")
            return redirect('dashboard_redirect')
    
    # Get counts
    pending_approvals = User.objects.filter(status='pending_approval').count()
    total_managers = Manager.objects.count()
    total_employees = Employee.objects.count()
    total_users = pending_approvals + total_managers + total_employees
    
    # Get pending approvals list
    pending_list = User.objects.filter(status='pending_approval').order_by('-created_at')
    
    # Get approved users
    approved_managers = Manager.objects.all().order_by('-approved_at')
    approved_employees = Employee.objects.all().order_by('-approved_at')
    
    context = {
        'pending_approvals': pending_approvals,
        'total_managers': total_managers,
        'total_employees': total_employees,
        'total_users': total_users,
        'pending_list': pending_list,
        'approved_managers': approved_managers,
        'approved_employees': approved_employees,
    }
    return render(request, 'admin_dashboard.html', context)

@admin_required
def approve_user(request, user_id):
    if request.method == 'POST':
        role = request.POST.get('role')
        user = get_object_or_404(User, id=user_id, status='pending_approval')
        
        if role in ['manager', 'employee']:
            # Update user
            user.status = 'approved'
            user.approved_role = role
            user.approved_at = timezone.now()
            user.approved_by = request.session.get('user_email')
            user.save()
            
            # Get additional data from session
            pending_data = request.session.get('pending_user_data', {})
            
            print("=" * 50)
            print("PENDING DATA FROM SESSION:")
            print(pending_data)
            print("=" * 50)
            # Move to respective table
            if role == 'manager':
                Manager.objects.create(
                    user=user,
                    email=user.email,
                    employee_id=user.employee_id,
                    name=pending_data.get('name', ''),
                    approved_at=user.approved_at,
                    approved_by=user.approved_by,
                    years_of_experience=pending_data.get('years_of_experience', 0),
                    department=pending_data.get('department', '')
                )
                messages.success(request, f"{user.email} approved as Manager.")
            else:
                # Get skills as list and convert to string
                skills_list = pending_data.get('skills', [])
                if isinstance(skills_list, list):
                    skills_string = ', '.join(skills_list)
                else:
                    skills_string = str(skills_list)  # employee
                Employee.objects.create(
                    user=user,
                    email=user.email,
                    employee_id=user.employee_id,
                    name=pending_data.get('name', ''),
                    approved_at=user.approved_at,
                    approved_by=user.approved_by,
                    skills=skills_string,
                    experience_years=pending_data.get('experience_years', 0)
                )
                messages.success(request, f"{user.email} approved as Employee.")
            
            # Clear session data
            if 'pending_user_data' in request.session:
                del request.session['pending_user_data']
        else:
            messages.error(request, "Invalid role selected.")
    
    return redirect('admin_dashboard')

@admin_required
def reject_user(request, user_id):
    user = get_object_or_404(User, id=user_id, status='pending_approval')
    user.status = 'rejected'
    user.save()
    messages.warning(request, f"{user.email} has been rejected.")
    return redirect('admin_dashboard')

@admin_required
def remove_user(request, user_type, user_id):
    """Remove user from manager/employee table"""
    if user_type == 'manager':
        manager = get_object_or_404(Manager, pk=user_id)
        user = manager.user
        user.status = 'rejected'
        user.approved_role = None
        user.save()
        manager.delete()
        messages.success(request, f"Manager {manager.email} removed successfully.")
    
    elif user_type == 'employee':
        employee = get_object_or_404(Employee, pk=user_id)
        user = employee.user
        user.status = 'rejected'
        user.approved_role = None
        user.save()
        employee.delete()
        messages.success(request, f"Employee {employee.email} removed successfully.")
    
    return redirect('admin_dashboard')

# Manager Dashboard
@login_required
@role_required(['manager'])
def manager_dashboard(request):
    print(f"Manager Dashboard - User: {request.user}")
    print(f"Manager Dashboard - Authenticated: {request.user.is_authenticated}")
    print(f"Manager Dashboard - Session: {request.session.session_key}")
    
    try:
        manager = Manager.objects.get(user=request.user)
        projects = Project.objects.filter(manager=manager)
        
        # ✅ FIX: pass all employees to the template so the dropdown renders correctly
        all_employees = Employee.objects.all()
        
        print(f"Manager Dashboard - Found {projects.count()} projects")
        context = {
            'manager_name': manager.name,
            'manager_initials': ''.join([n[0] for n in manager.name.split()[:2]]).upper(),
            'manager_email': manager.email,
            'manager_projects': projects,   # ← also renamed to match template's {% for project in manager_projects %}
            'all_employees': all_employees, # ← THIS WAS MISSING
        }
    except Manager.DoesNotExist:
        context = {}
    
    return render(request, 'manager_dashboard.html', context)

# Employee Dashboard
@login_required
@role_required(['employee'])
def employee_dashboard(request):
    print(f"Employee Dashboard - User: {request.user}")
    print(f"Employee Dashboard - Authenticated: {request.user.is_authenticated}")
    print(f"Employee Dashboard - Session: {request.session.session_key}")
    
    # Get the employee object
    try:
        employee = Employee.objects.get(user=request.user)
        context = {
            'employee_name': employee.name,
            'employee_initials': ''.join([n[0] for n in employee.name.split()[:2]]).upper(),
            'employee_email': employee.email,
            'employee_skills': employee.skills,
            'employee_experience': employee.experience_years,
        }
    except Employee.DoesNotExist:
        context = {}
    
    return render(request, 'employee_dashboard.html', context)