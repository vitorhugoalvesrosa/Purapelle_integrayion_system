from django.contrib import admin

from .models import Patient, Photo, Procedure


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "email", "created_at", "reviewed_at")
    search_fields = ("name", "phone", "email")
    readonly_fields = ("created_at",)


@admin.register(Procedure)
class ProcedureAdmin(admin.ModelAdmin):
    list_display = ("name", "patient", "category", "date")
    list_filter = ("category", "date")
    search_fields = ("name", "patient__name", "product", "lot")
    readonly_fields = ("created_at",)


@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ("patient", "stage", "date")
    list_filter = ("stage", "date")
    search_fields = ("patient__name", "caption")
    readonly_fields = ("created_at",)
