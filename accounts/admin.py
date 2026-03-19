from django.contrib import admin
from .models import User, Manager, Employee, Admin

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['id', 'email', 'employee_id', 'requested_role', 'status', 'created_at']
    list_filter = ['status', 'requested_role']
    search_fields = ['email', 'employee_id']

@admin.register(Manager)
class ManagerAdmin(admin.ModelAdmin):
    list_display = ['email', 'employee_id', 'joined_at', 'approved_by']
    search_fields = ['email', 'employee_id']

@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ['email', 'employee_id', 'joined_at', 'approved_by']
    search_fields = ['email', 'employee_id']

@admin.register(Admin)
class AdminAdmin(admin.ModelAdmin):
    list_display = ['email', 'name', 'created_at']