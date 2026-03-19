from django import forms
from .models import User

class RegisterForm(forms.Form):
    # Common fields
    email = forms.EmailField(
        max_length=255, 
        required=True,
        widget=forms.EmailInput(attrs={'class': 'form-control', 'placeholder': 'Company Email'})
    )
    name = forms.CharField(
        max_length=100,
        required=True,
        widget=forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Full Name'})
    )
    employee_id = forms.CharField(
        max_length=50, 
        required=True,
        widget=forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Employee ID (numbers only)'})
    )
    role = forms.ChoiceField(
        choices=[('', 'Select Role'), ('manager', 'Manager'), ('employee', 'Employee')], 
        required=True,
        widget=forms.Select(attrs={'class': 'form-control', 'id': 'id_role'})
    )
    password = forms.CharField(
        min_length=8, 
        widget=forms.PasswordInput(attrs={'class': 'form-control', 'placeholder': 'Password (min 8 characters)'}), 
        required=True
    )
    confirm_password = forms.CharField(
        widget=forms.PasswordInput(attrs={'class': 'form-control', 'placeholder': 'Confirm Password'}), 
        required=True
    )
    
    # Employee fields - SKILLS ONLY (no job_role, no proficiency)
    skills = forms.MultipleChoiceField(
        required=False,
        choices=[
            # Frontend
            ('HTML', 'HTML'), ('CSS', 'CSS'), ('JavaScript', 'JavaScript'),
            ('React', 'React'), ('Vue.js', 'Vue.js'), ('Angular', 'Angular'),
            # Backend
            ('Python', 'Python'), ('Django', 'Django'), ('Java', 'Java'),
            ('Node.js', 'Node.js'), ('PHP', 'PHP'), ('C#', 'C#'),
            # Database
            ('SQL', 'SQL'), ('MySQL', 'MySQL'), ('PostgreSQL', 'PostgreSQL'),
            ('MongoDB', 'MongoDB'),
            # DevOps
            ('AWS', 'AWS'), ('Docker', 'Docker'), ('Git', 'Git'),
            ('Jenkins', 'Jenkins'),
            # Testing
            ('Selenium', 'Selenium'), ('JUnit', 'JUnit'), ('PyTest', 'PyTest'),
            # Design
            ('Figma', 'Figma'), ('Adobe XD', 'Adobe XD'), ('Sketch', 'Sketch'),
        ],
        widget=forms.SelectMultiple(attrs={
            'class': 'form-control employee-field',
            'size': '8'
        })
    )
    experience_years = forms.IntegerField(
        required=False,
        min_value=0,
        widget=forms.NumberInput(attrs={
            'class': 'form-control employee-field', 
            'placeholder': 'Years of Experience'
        })
    )
    
    # Manager fields
    mgr_experience_years = forms.IntegerField(
        required=False,
        min_value=0,
        widget=forms.NumberInput(attrs={
            'class': 'form-control manager-field', 
            'placeholder': 'Years of Experience'
        })
    )
    department = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control manager-field', 
            'placeholder': 'Department (e.g., Engineering, Product, Sales)'
        })
    )
    
    def clean_email(self):
        email = self.cleaned_data.get('email')
        if User.objects.filter(email=email).exists():
            raise forms.ValidationError("Email already registered")
        return email
    
    def clean_employee_id(self):
        employee_id = self.cleaned_data.get('employee_id')
        if not employee_id.isdigit():
            raise forms.ValidationError("Employee ID must contain only numbers")
        if User.objects.filter(employee_id=employee_id).exists():
            raise forms.ValidationError("Employee ID already exists")
        return employee_id
    
    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get('password')
        confirm_password = cleaned_data.get('confirm_password')
        role = cleaned_data.get('role')
        
        # Validate password match
        if password and confirm_password and password != confirm_password:
            raise forms.ValidationError("Passwords do not match")
        
        # Role-specific validation
        if role == 'employee':
            if not cleaned_data.get('skills'):
                self.add_error('skills', 'At least one skill is required for employees')
            if not cleaned_data.get('experience_years'):
                self.add_error('experience_years', 'Experience years are required for employees')
        
        elif role == 'manager':
            if not cleaned_data.get('mgr_experience_years'):
                self.add_error('mgr_experience_years', 'Experience years are required for managers')
            if not cleaned_data.get('department'):
                self.add_error('department', 'Department is required for managers')
        
        return cleaned_data

class LoginForm(forms.Form):
    email = forms.EmailField(
        required=True,
        widget=forms.EmailInput(attrs={'class': 'form-control', 'placeholder': 'Email'})
    )
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={'class': 'form-control', 'placeholder': 'Password'}), 
        required=True
    )