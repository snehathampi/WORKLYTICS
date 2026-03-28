#from django.contrib import admin
from django.urls import path, include
from accounts import views as accounts_views

urlpatterns = [
    #path('admin/', admin.site.urls),
    path('', accounts_views.index, name='index'),
    path('', include('accounts.urls')),
    path('core/', include('core.urls')),
    path('simulation/', include('simulation.urls')),
    path('appraisal/', include('appraisal.urls')), 
]