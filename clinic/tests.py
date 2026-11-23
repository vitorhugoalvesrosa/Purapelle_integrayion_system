import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse

from .models import Patient, Procedure


class ClinicAccessTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.manager = user_model.objects.create_user(username="gerente-teste", password="test-pass-123")
        self.manager.groups.add(Group.objects.create(name="gerente"))
        self.operator = user_model.objects.create_user(username="operador-teste", password="test-pass-123")
        self.operator.groups.add(Group.objects.create(name="operador"))
        self.patient = Patient.objects.create(name="Paciente teste")

    def test_dashboard_requires_login(self):
        response = self.client.get(reverse("dashboard"))

        self.assertRedirects(response, "/login/?next=/")

    def test_operator_can_read_patients_and_register_procedures_but_not_manage_patients(self):
        self.client.force_login(self.operator)

        patients_response = self.client.get(reverse("patients-api"))
        create_patient_response = self.client.post(
            reverse("patients-api"),
            data=json.dumps({"name": "Nova paciente"}),
            content_type="application/json",
        )
        create_procedure_response = self.client.post(
            reverse("procedures-api"),
            data=json.dumps(
                {
                    "patientId": str(self.patient.pk),
                    "category": "Botox",
                    "procedure": "Toxina botulínica",
                    "date": "2026-11-23",
                    "points": [],
                }
            ),
            content_type="application/json",
        )
        review_response = self.client.patch(reverse("patient-review-api", args=[self.patient.pk]))

        self.assertEqual(patients_response.status_code, 200)
        self.assertEqual(create_patient_response.status_code, 403)
        self.assertEqual(create_procedure_response.status_code, 201)
        self.assertEqual(review_response.status_code, 403)
        self.assertEqual(Procedure.objects.count(), 1)

    def test_manager_can_create_and_review_patients(self):
        self.client.force_login(self.manager)

        create_response = self.client.post(
            reverse("patients-api"),
            data=json.dumps({"name": "Nova paciente"}),
            content_type="application/json",
        )
        review_response = self.client.patch(reverse("patient-review-api", args=[self.patient.pk]))

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(review_response.status_code, 200)
        self.patient.refresh_from_db()
        self.assertIsNotNone(self.patient.reviewed_at)

    def test_api_requires_authentication(self):
        response = self.client.get(reverse("patients-api"))

        self.assertEqual(response.status_code, 401)

    @patch(
        "clinic.management.commands.setup_clinic_users.getpass",
        side_effect=[
            "admin-pass-123",
            "admin-pass-123",
            "manager-pass-123",
            "manager-pass-123",
            "operator-pass-123",
            "operator-pass-123",
        ],
    )
    def test_setup_command_creates_accounts_with_hashed_passwords_and_roles(self, _getpass):
        call_command("setup_clinic_users", verbosity=0)

        user_model = get_user_model()
        administrator = user_model.objects.get(username="administrador")
        manager = user_model.objects.get(username="gerente")
        operator = user_model.objects.get(username="operador")
        self.assertTrue(administrator.check_password("admin-pass-123"))
        self.assertTrue(administrator.is_superuser)
        self.assertEqual(list(manager.groups.values_list("name", flat=True)), ["gerente"])
        self.assertEqual(list(operator.groups.values_list("name", flat=True)), ["operador"])
