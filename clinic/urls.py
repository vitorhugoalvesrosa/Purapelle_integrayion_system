from django.urls import path

from . import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("api/patients/", views.patients_api, name="patients-api"),
    path("api/patients/<str:patient_id>/review/", views.patient_review_api, name="patient-review-api"),
    path("api/procedures/", views.procedures_api, name="procedures-api"),
    path("api/photos/", views.photos_api, name="photos-api"),
]
