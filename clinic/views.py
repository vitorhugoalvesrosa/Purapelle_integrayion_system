import base64
import binascii
import json
import re
from datetime import date
from uuid import UUID

from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.utils.dateparse import parse_datetime
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from .models import Appointment, Patient, Photo, Procedure


def is_clinic_admin(user):
    return user.is_superuser or user.groups.filter(name="administrador").exists()


def can_manage_patients(user):
    return is_clinic_admin(user) or user.groups.filter(name="gerente").exists()


def role_for(user):
    if is_clinic_admin(user):
        return "Administrador"
    if user.groups.filter(name="gerente").exists():
        return "Gerente"
    return "Operador"


@login_required
@ensure_csrf_cookie
def dashboard(request):
    return render(
        request,
        "clinic/dashboard.html",
        {
            "role_display": role_for(request.user),
            "can_manage_patients": can_manage_patients(request.user),
            "is_clinic_admin": is_clinic_admin(request.user),
        },
    )


def _json_body(request):
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return body if isinstance(body, dict) else None


def _unauthorized():
    return JsonResponse({"error": "Autenticação necessária."}, status=401)


def _forbidden():
    return JsonResponse({"error": "Você não tem permissão para esta ação."}, status=403)


def _patient_json(patient):
    return {
        "id": str(patient.id),
        "name": patient.name,
        "birthDate": patient.birth_date.isoformat() if patient.birth_date else "",
        "phone": patient.phone,
        "email": patient.email,
        "allergies": patient.allergies,
        "medications": patient.medications,
        "conditions": patient.conditions,
        "pregnant": patient.pregnant,
        "notes": patient.notes,
        "createdAt": patient.created_at.date().isoformat(),
        "reviewedAt": patient.reviewed_at.isoformat() if patient.reviewed_at else "",
    }


def _procedure_json(procedure):
    return {
        "id": str(procedure.id),
        "patientId": str(procedure.patient_id),
        "appointmentId": str(procedure.appointment_id) if procedure.appointment_id else "",
        "category": procedure.category,
        "procedure": procedure.name,
        "product": procedure.product,
        "lot": procedure.lot,
        "expiry": procedure.expiry.isoformat() if procedure.expiry else "",
        "dosage": procedure.dosage,
        "date": procedure.date.isoformat(),
        "notes": procedure.notes,
        "points": procedure.points,
    }


def _photo_json(photo):
    return {
        "id": str(photo.id),
        "patientId": str(photo.patient_id),
        "appointmentId": str(photo.appointment_id) if photo.appointment_id else "",
        "stage": photo.stage,
        "date": photo.date.isoformat(),
        "caption": photo.caption,
        "image": photo.image,
    }


def _appointment_json(appointment):
    return {
        "id": str(appointment.id),
        "patientId": str(appointment.patient_id),
        "patientName": appointment.patient.name,
        "scheduledAt": timezone.localtime(appointment.scheduled_at).isoformat(),
        "service": appointment.service,
        "notes": appointment.notes,
        "status": appointment.status,
    }


def _parse_scheduled_at(value):
    if not isinstance(value, str):
        return None
    try:
        scheduled_at = parse_datetime(value)
    except ValueError:
        return None
    if scheduled_at and timezone.is_naive(scheduled_at):
        scheduled_at = timezone.make_aware(scheduled_at)
    return scheduled_at


def _appointment_for_patient(appointment_id, patient):
    if appointment_id is None or appointment_id == "":
        if Appointment.objects.filter(patient=patient).exclude(status=Appointment.Status.CANCELLED).exists():
            return False
        return None
    try:
        return Appointment.objects.get(pk=UUID(appointment_id), patient=patient)
    except (Appointment.DoesNotExist, TypeError, ValueError):
        return False


@require_http_methods(["GET", "POST"])
def patients_api(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    if request.method == "GET":
        return JsonResponse({"patients": [_patient_json(item) for item in Patient.objects.order_by("-created_at")]})
    if not can_manage_patients(request.user):
        return _forbidden()

    data = _json_body(request)
    if data is None or not isinstance(data.get("name"), str) or not data["name"].strip():
        return JsonResponse({"error": "Informe o nome da paciente."}, status=400)
    birth_date = None
    if data.get("birthDate"):
        try:
            birth_date = date.fromisoformat(data["birthDate"])
        except (TypeError, ValueError):
            return JsonResponse({"error": "Data de nascimento inválida."}, status=400)
    patient = Patient(
        name=data["name"].strip(),
        birth_date=birth_date,
        phone=str(data.get("phone") or "").strip(),
        email=str(data.get("email") or "").strip(),
        allergies=str(data.get("allergies") or "").strip(),
        medications=str(data.get("medications") or "").strip(),
        conditions=str(data.get("conditions") or "").strip(),
        pregnant=bool(data.get("pregnant")),
        notes=str(data.get("notes") or "").strip(),
    )
    try:
        patient.full_clean()
    except ValidationError as error:
        return JsonResponse({"error": error.message_dict}, status=400)
    patient.save()
    return JsonResponse({"patient": _patient_json(patient)}, status=201)


@require_http_methods(["PATCH"])
def patient_review_api(request, patient_id):
    if not request.user.is_authenticated:
        return _unauthorized()
    if not can_manage_patients(request.user):
        return _forbidden()
    try:
        patient = Patient.objects.get(pk=UUID(patient_id))
    except (Patient.DoesNotExist, ValueError):
        return JsonResponse({"error": "Paciente não encontrada."}, status=404)
    patient.reviewed_at = timezone.localdate()
    patient.save(update_fields=["reviewed_at"])
    return JsonResponse({"patient": _patient_json(patient)})


@require_http_methods(["GET", "POST"])
def appointments_api(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    if request.method == "GET":
        appointments = Appointment.objects.select_related("patient")
        return JsonResponse({"appointments": [_appointment_json(item) for item in appointments]})

    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Dados inválidos."}, status=400)
    try:
        patient = Patient.objects.get(pk=UUID(data.get("patientId", "")))
    except (Patient.DoesNotExist, TypeError, ValueError):
        return JsonResponse({"error": "Paciente inválida."}, status=400)
    scheduled_at = _parse_scheduled_at(data.get("scheduledAt"))
    service = data.get("service")
    if scheduled_at is None or not isinstance(service, str) or not service.strip():
        return JsonResponse({"error": "Informe o serviço, a data e o horário do atendimento."}, status=400)
    appointment = Appointment(
        patient=patient,
        scheduled_at=scheduled_at,
        service=service.strip(),
        notes=str(data.get("notes") or "").strip(),
    )
    try:
        appointment.full_clean()
    except ValidationError as error:
        return JsonResponse({"error": error.message_dict}, status=400)
    appointment.save()
    return JsonResponse({"appointment": _appointment_json(appointment)}, status=201)


@require_http_methods(["PATCH"])
def appointment_detail_api(request, appointment_id):
    if not request.user.is_authenticated:
        return _unauthorized()
    try:
        appointment = Appointment.objects.select_related("patient").get(pk=UUID(appointment_id))
    except (Appointment.DoesNotExist, ValueError):
        return JsonResponse({"error": "Atendimento não encontrado."}, status=404)
    data = _json_body(request)
    if data is None or not data or not set(data).issubset({"status", "scheduledAt", "service", "notes"}):
        return JsonResponse({"error": "Informe dados válidos para atualizar o atendimento."}, status=400)
    if "status" in data:
        if data["status"] not in Appointment.Status.values:
            return JsonResponse({"error": "Status de atendimento inválido."}, status=400)
        appointment.status = data["status"]
    if "scheduledAt" in data:
        scheduled_at = _parse_scheduled_at(data["scheduledAt"])
        if scheduled_at is None:
            return JsonResponse({"error": "Data e horário do atendimento inválidos."}, status=400)
        appointment.scheduled_at = scheduled_at
    if "service" in data:
        if not isinstance(data["service"], str) or not data["service"].strip():
            return JsonResponse({"error": "Informe o serviço do atendimento."}, status=400)
        appointment.service = data["service"].strip()
    if "notes" in data:
        if not isinstance(data["notes"], str):
            return JsonResponse({"error": "Observações inválidas."}, status=400)
        appointment.notes = data["notes"].strip()
    try:
        appointment.full_clean()
    except ValidationError as error:
        return JsonResponse({"error": error.message_dict}, status=400)
    appointment.save()
    return JsonResponse({"appointment": _appointment_json(appointment)})


@require_http_methods(["GET", "POST"])
def procedures_api(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    if request.method == "GET":
        records = Procedure.objects.select_related("patient").order_by("-date", "-created_at")
        return JsonResponse({"procedures": [_procedure_json(item) for item in records]})

    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Dados inválidos."}, status=400)
    try:
        patient_id = UUID(data.get("patientId", ""))
        patient = Patient.objects.get(pk=patient_id)
        procedure_date = date.fromisoformat(data.get("date", ""))
        expiry = date.fromisoformat(data["expiry"]) if data.get("expiry") else None
    except (Patient.DoesNotExist, TypeError, ValueError):
        return JsonResponse({"error": "Paciente ou data inválida."}, status=400)
    appointment = _appointment_for_patient(data.get("appointmentId"), patient)
    if appointment is False:
        return JsonResponse({"error": "Selecione um atendimento desta paciente."}, status=400)
    required = ("category", "procedure")
    if any(not isinstance(data.get(field), str) or not data[field].strip() for field in required):
        return JsonResponse({"error": "Informe a categoria e o procedimento."}, status=400)
    points = data.get("points", [])
    if not isinstance(points, list) or any(
        not isinstance(point, dict)
        or not isinstance(point.get("x"), (int, float))
        or not isinstance(point.get("y"), (int, float))
        or not 0 <= point["x"] <= 1
        or not 0 <= point["y"] <= 1
        for point in points
    ):
        return JsonResponse({"error": "Pontos do mapa facial inválidos."}, status=400)
    record = Procedure(
        patient=patient,
        appointment=appointment,
        category=data["category"].strip(),
        name=data["procedure"].strip(),
        product=str(data.get("product") or "").strip(),
        lot=str(data.get("lot") or "").strip(),
        expiry=expiry,
        dosage=str(data.get("dosage") or "").strip(),
        date=procedure_date,
        notes=str(data.get("notes") or "").strip(),
        points=points,
    )
    try:
        record.full_clean()
    except ValidationError as error:
        return JsonResponse({"error": error.message_dict}, status=400)
    record.save()
    return JsonResponse({"procedure": _procedure_json(record)}, status=201)


@require_http_methods(["GET", "POST"])
def photos_api(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    if request.method == "GET":
        return JsonResponse({"photos": [_photo_json(item) for item in Photo.objects.select_related("patient").order_by("-date")]})

    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Dados inválidos."}, status=400)
    try:
        patient = Patient.objects.get(pk=UUID(data.get("patientId", "")))
        photo_date = date.fromisoformat(data.get("date", ""))
    except (Patient.DoesNotExist, TypeError, ValueError):
        return JsonResponse({"error": "Paciente ou data inválida."}, status=400)
    appointment = _appointment_for_patient(data.get("appointmentId"), patient)
    if appointment is False:
        return JsonResponse({"error": "Selecione um atendimento desta paciente."}, status=400)
    stage = data.get("stage")
    image = data.get("image")
    if stage not in ("Antes", "Depois") or not isinstance(image, str) or len(image) > 2_800_000:
        return JsonResponse({"error": "Etapa ou fotografia inválida."}, status=400)
    match = re.fullmatch(r"data:image/jpeg;base64,([A-Za-z0-9+/]*={0,2})", image)
    if not match:
        return JsonResponse({"error": "A fotografia deve estar no formato JPEG."}, status=400)
    try:
        base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return JsonResponse({"error": "Conteúdo da fotografia inválido."}, status=400)
    photo = Photo(
        patient=patient,
        appointment=appointment,
        stage=stage,
        date=photo_date,
        caption=str(data.get("caption") or "").strip(),
        image=image,
    )
    try:
        photo.full_clean()
    except ValidationError as error:
        return JsonResponse({"error": error.message_dict}, status=400)
    photo.save()
    return JsonResponse({"photo": _photo_json(photo)}, status=201)
