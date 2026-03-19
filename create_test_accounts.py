# create_test_accounts.py
import os
import django
from django.contrib.auth.hashers import make_password
from django.utils import timezone

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'worklytics.settings')
django.setup()

from accounts.models import User, Manager, Employee, Admin

def create_test_accounts():
    print("🚀 Creating test accounts...\n")
    
    # ============================================
    # 1. CREATE 2 MANAGERS
    # ============================================
    print("📋 Creating Managers:")
    
    # Manager 1 - Priya Sharma
    user1 = User.objects.create(
        email='priya.sharma@worklytics.com',
        employee_id='1001',
        requested_role='manager',
        password=make_password('manager123'),
        status='approved',
        approved_role='manager',
        approved_at=timezone.now(),
        approved_by='admin@worklytics.com',
        is_active=True
    )
    
    manager1 = Manager.objects.create(
        user=user1,
        email=user1.email,
        employee_id=user1.employee_id,
        name='Priya Sharma',  # ✅ NAME ADDED
        years_of_experience=10,
        department='Engineering',
        approved_at=user1.approved_at,
        approved_by=user1.approved_by
    )
    print(f"  ✅ Manager 1: priya.sharma@worklytics.com / manager123 (Engineering, 10 yrs)")
    
    # Manager 2 - Rahul Verma
    user2 = User.objects.create(
        email='rahul.verma@worklytics.com',
        employee_id='1002',
        requested_role='manager',
        password=make_password('manager123'),
        status='approved',
        approved_role='manager',
        approved_at=timezone.now(),
        approved_by='admin@worklytics.com',
        is_active=True
    )
    
    manager2 = Manager.objects.create(
        user=user2,
        email=user2.email,
        employee_id=user2.employee_id,
        name='Rahul Verma',  # ✅ NAME ADDED
        years_of_experience=7,
        department='Product',
        approved_at=user2.approved_at,
        approved_by=user2.approved_by
    )
    print(f"  ✅ Manager 2: rahul.verma@worklytics.com / manager123 (Product, 7 yrs)")
    
    # ============================================
    # 2. CREATE 6 EMPLOYEES (proficiency_level REMOVED)
    # ============================================
    print("\n📋 Creating Employees:")
    
    # Employee 1 - Anjali Desai (Frontend)
    user3 = User.objects.create(
        email='anjali.desai@worklytics.com',
        employee_id='2001',
        requested_role='employee',
        password=make_password('emp123'),
        status='approved',
        approved_role='employee',
        approved_at=timezone.now(),
        approved_by='admin@worklytics.com',
        is_active=True
    )
    
    emp1 = Employee.objects.create(
        user=user3,
        email=user3.email,
        employee_id=user3.employee_id,
        name='Anjali Desai',  # ✅ NAME ADDED
        skills='HTML, CSS, JavaScript, React',
        experience_years=3,
        # proficiency_level REMOVED
        approved_at=user3.approved_at,
        approved_by=user3.approved_by
    )
    print(f"  ✅ Employee 1: anjali.desai@worklytics.com / emp123")
    print(f"     Skills: HTML, CSS, JavaScript, React (3 yrs)\n")
    
    # Employee 2 - Vikram Singh (Backend)
    user4 = User.objects.create(
        email='vikram.singh@worklytics.com',
        employee_id='2002',
        requested_role='employee',
        password=make_password('emp123'),
        status='approved',
        approved_role='employee',
        approved_at=timezone.now(),
        approved_by='admin@worklytics.com',
        is_active=True
    )
    
    emp2 = Employee.objects.create(
        user=user4,
        email=user4.email,
        employee_id=user4.employee_id,
        name='Vikram Singh',  # ✅ NAME ADDED
        skills='Python, Django, SQL, REST APIs',
        experience_years=5,
        # proficiency_level REMOVED
        approved_at=user4.approved_at,
        approved_by=user4.approved_by
    )
    print(f"  ✅ Employee 2: vikram.singh@worklytics.com / emp123")
    print(f"     Skills: Python, Django, SQL, REST APIs (5 yrs)\n")
    
    # Employee 3 - Neha Gupta (Full Stack)
    user5 = User.objects.create(
        email='neha.gupta@worklytics.com',
        employee_id='2003',
        requested_role='employee',
        password=make_password('emp123'),
        status='approved',
        approved_role='employee',
        approved_at=timezone.now(),
        approved_by='admin@worklytics.com',
        is_active=True
    )
    
    emp3 = Employee.objects.create(
        user=user5,
        email=user5.email,
        employee_id=user5.employee_id,
        name='Neha Gupta',  # ✅ NAME ADDED
        skills='JavaScript, React, Python, Django, SQL, HTML, CSS',
        experience_years=4,
        # proficiency_level REMOVED
        approved_at=user5.approved_at,
        approved_by=user5.approved_by
    )
    print(f"  ✅ Employee 3: neha.gupta@worklytics.com / emp123")
    print(f"     Skills: JavaScript, React, Python, Django, SQL, HTML, CSS (4 yrs)\n")
    
    # Employee 4 - Arjun Nair (Database)
    user6 = User.objects.create(
        email='arjun.nair@worklytics.com',
        employee_id='2004',
        requested_role='employee',
        password=make_password('emp123'),
        status='approved',
        approved_role='employee',
        approved_at=timezone.now(),
        approved_by='admin@worklytics.com',
        is_active=True
    )
    
    emp4 = Employee.objects.create(
        user=user6,
        email=user6.email,
        employee_id=user6.employee_id,
        name='Arjun Nair',  # ✅ NAME ADDED
        skills='SQL, MySQL, PostgreSQL, MongoDB, Database Design',
        experience_years=6,
        # proficiency_level REMOVED
        approved_at=user6.approved_at,
        approved_by=user6.approved_by
    )
    print(f"  ✅ Employee 4: arjun.nair@worklytics.com / emp123")
    print(f"     Skills: SQL, MySQL, PostgreSQL, MongoDB, Database Design (6 yrs)\n")
    
    # Employee 5 - Kavya Reddy (DevOps)
    user7 = User.objects.create(
        email='kavya.reddy@worklytics.com',
        employee_id='2005',
        requested_role='employee',
        password=make_password('emp123'),
        status='approved',
        approved_role='employee',
        approved_at=timezone.now(),
        approved_by='admin@worklytics.com',
        is_active=True
    )
    
    emp5 = Employee.objects.create(
        user=user7,
        email=user7.email,
        employee_id=user7.employee_id,
        name='Kavya Reddy',  # ✅ NAME ADDED
        skills='AWS, Docker, Kubernetes, Jenkins, Git, Linux',
        experience_years=4,
        # proficiency_level REMOVED
        approved_at=user7.approved_at,
        approved_by=user7.approved_by
    )
    print(f"  ✅ Employee 5: kavya.reddy@worklytics.com / emp123")
    print(f"     Skills: AWS, Docker, Kubernetes, Jenkins, Git, Linux (4 yrs)\n")
    
    # Employee 6 - Rohan Joshi (QA Tester)
    user8 = User.objects.create(
        email='rohan.joshi@worklytics.com',
        employee_id='2006',
        requested_role='employee',
        password=make_password('emp123'),
        status='approved',
        approved_role='employee',
        approved_at=timezone.now(),
        approved_by='admin@worklytics.com',
        is_active=True
    )
    
    emp6 = Employee.objects.create(
        user=user8,
        email=user8.email,
        employee_id=user8.employee_id,
        name='Rohan Joshi',  # ✅ NAME ADDED
        skills='Selenium, JUnit, PyTest, Manual Testing, Bug Tracking',
        experience_years=3,
        # proficiency_level REMOVED
        approved_at=user8.approved_at,
        approved_by=user8.approved_by
    )
    print(f"  ✅ Employee 6: rohan.joshi@worklytics.com / emp123")
    print(f"     Skills: Selenium, JUnit, PyTest, Manual Testing, Bug Tracking (3 yrs)\n")
    
    # ============================================
    # 3. VERIFY ALL ACCOUNTS
    # ============================================
    print("=" * 50)
    print("📊 SUMMARY")
    print("=" * 50)
    print(f"Total Users: {User.objects.count()}")
    print(f"Total Managers: {Manager.objects.count()}")
    print(f"Total Employees: {Employee.objects.count()}")
    print(f"Total Admins: {Admin.objects.count()}")
    
    print("\n✅ Test accounts created successfully!")
    print("\n📝 Login Credentials:")
    print("   Admin:      admin@worklytics.com / admin123")
    print("\n   Managers (password: manager123):")
    print("   - priya.sharma@worklytics.com (Priya Sharma)")
    print("   - rahul.verma@worklytics.com (Rahul Verma)")
    print("\n   Employees (all password: emp123):")
    print("   - anjali.desai@worklytics.com (Anjali Desai - Frontend)")
    print("   - vikram.singh@worklytics.com (Vikram Singh - Backend)")
    print("   - neha.gupta@worklytics.com (Neha Gupta - Full Stack)")
    print("   - arjun.nair@worklytics.com (Arjun Nair - Database)")
    print("   - kavya.reddy@worklytics.com (Kavya Reddy - DevOps)")
    print("   - rohan.joshi@worklytics.com (Rohan Joshi - QA Tester)")

if __name__ == '__main__':
    create_test_accounts()