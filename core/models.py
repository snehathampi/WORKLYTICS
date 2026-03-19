from django.db import models
from django.core.exceptions import ValidationError
from accounts.models import Manager, Employee

# Create your models here.

class Project(models.Model):
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]
    
    STATUS_CHOICES = [
        ('planning', 'Planning'),
        ('active', 'Active'),
        ('completed', 'Completed'),
    ]
    
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    manager = models.ForeignKey(Manager, on_delete=models.CASCADE, related_name='managed_projects')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planning')
    start_date = models.DateField(auto_now_add=True)
    end_date = models.DateField()
    color = models.CharField(max_length=20, default='#6366f1')
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.name
    
    @property
    def progress(self):
        tasks = self.tasks.all()
        if not tasks.exists():
            return 0
        completed = tasks.filter(status='completed').count()
        return round((completed / tasks.count()) * 100)
    
    @property
    def task_count(self):
        return self.tasks.count()
    
    @property
    def completed_tasks(self):
        return self.tasks.filter(status='completed').count()
    
    @property
    def pending_tasks(self):
        return self.tasks.exclude(status='completed').count()


class Task(models.Model):
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]
    
    STATUS_CHOICES = [
        ('todo', 'To Do'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('blocked', 'Blocked'),
    ]
    
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tasks')
    assigned_to = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_tasks')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='todo')
    estimated_hours = models.FloatField()
    actual_hours = models.FloatField(null=True, blank=True)
    due_date = models.DateField()
    completed_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.title} - {self.project.name}"
    
    @property
    def is_overdue(self):
        from django.utils import timezone
        if self.status != 'completed' and self.due_date < timezone.now().date():
            return True
        return False
    
    @property
    def has_pending_dependencies(self):
        """Check if this task has any incomplete dependencies"""
        return self.dependencies.filter(depends_on__status__in=['todo', 'in_progress', 'blocked']).exists()
    
    @property
    def blocking_tasks(self):
        """Get tasks that are blocking this task"""
        return Task.objects.filter(dependent_tasks__task=self, status__in=['todo', 'in_progress', 'blocked'])


class TaskDependency(models.Model):
    """
    Models task dependencies (which task blocks which)
    Example: Task B depends on Task A -> task=B, depends_on=A
    """
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='dependencies')
    depends_on = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='dependent_tasks')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('task', 'depends_on')  # Prevent duplicate dependencies
        
    def __str__(self):
        return f"{self.task.title} depends on {self.depends_on.title}"
    
    def clean(self):
        """Prevent circular dependencies and self-dependency"""
        if self.task == self.depends_on:
            raise ValidationError("Task cannot depend on itself")
        
        # Check for circular dependency (A depends on B, B depends on A)
        if TaskDependency.objects.filter(task=self.depends_on, depends_on=self.task).exists():
            raise ValidationError("Circular dependency detected")
        
        # Check if tasks are in the same project
        if self.task.project != self.depends_on.project:
            raise ValidationError("Dependencies must be within the same project")
    
    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)