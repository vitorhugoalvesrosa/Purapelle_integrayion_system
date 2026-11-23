import uuid

from django.db import models


class Patient(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    birth_date = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    allergies = models.TextField(blank=True)
    medications = models.TextField(blank=True)
    conditions = models.TextField(blank=True)
    pregnant = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class Procedure(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="procedures")
    category = models.CharField(max_length=100)
    name = models.CharField(max_length=200)
    product = models.CharField(max_length=200, blank=True)
    lot = models.CharField(max_length=100, blank=True)
    expiry = models.DateField(null=True, blank=True)
    dosage = models.CharField(max_length=100, blank=True)
    date = models.DateField()
    notes = models.TextField(blank=True)
    points = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]


class Photo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="photos")
    stage = models.CharField(max_length=10)
    date = models.DateField()
    caption = models.CharField(max_length=250, blank=True)
    image = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]
