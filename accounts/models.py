from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone

class UserManager(BaseUserManager):
    def create_user(self, email, employee_id, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        if not employee_id:
            raise ValueError('The Employee ID field must be set')
        
        email = self.normalize_email(email)
        user = self.model(email=email, employee_id=employee_id, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user
    
    def create_superuser(self, email, employee_id, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('status', 'approved')
        
        return self.create_user(email, employee_id, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = (
        ('manager', 'Manager'),
        ('employee', 'Employee'),
    )
    
    STATUS_CHOICES = (
        ('pending_verification', 'Pending Email Verification'),
        ('pending_approval', 'Pending Admin Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    )
    
    email = models.EmailField(max_length=191, unique=True)
    employee_id = models.CharField(max_length=50, unique=True)
    requested_role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='pending_verification')
    verification_token = models.CharField(max_length=64, blank=True, null=True, db_index=False)
    token_created_at = models.DateTimeField(null=True, blank=True)
    approved_role = models.CharField(max_length=20, choices=ROLE_CHOICES, null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.CharField(max_length=191, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=False)
    
    # Required for Django's auth system
    is_staff = models.BooleanField(default=False)
    
    # Set the manager
    objects = UserManager()
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['employee_id', 'requested_role']
    
    def __str__(self):
        return f"{self.email} - {self.status}"
    
    def save(self, *args, **kwargs):
        if self.password and not self.password.startswith(('pbkdf2_sha256$', 'bcrypt$', 'argon2')):
            self.set_password(self.password)
        super().save(*args, **kwargs)


class Manager(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True)
    email = models.EmailField(max_length=191, unique=True)
    employee_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    # Manager-specific fields for heuristics
    years_of_experience = models.PositiveIntegerField(default=0)
    department = models.CharField(max_length=100)
    
    # Timestamps
    joined_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField()
    approved_by = models.CharField(max_length=191)
    
    def __str__(self):
        return f"Manager: {self.email} - {self.department} ({self.years_of_experience} yrs)"


class Employee(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True)
    email = models.EmailField(max_length=191, unique=True)
    employee_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    # Employee-specific fields for heuristics
    skills = models.CharField(max_length=500, help_text="Comma-separated skills (e.g., Python, Django, React)")
    experience_years = models.PositiveIntegerField(default=0)
    #proficiency_level = models.CharField(max_length=20, choices=PROFICIENCY_CHOICES, default='beginner')
    
    # Timestamps
    joined_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField()
    approved_by = models.CharField(max_length=191)
    
    def __str__(self):
        return f"Employee: {self.email} - {self.skills} ({self.experience_years} yrs)"
    
    def get_skills_list(self):
        """Convert comma-separated skills to list"""
        if self.skills:
            return [skill.strip() for skill in self.skills.split(',')]
        return []


class Admin(models.Model):
    email = models.EmailField(max_length=191, unique=True)
    name = models.CharField(max_length=100)
    password = models.CharField(max_length=191)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Admin: {self.email}"