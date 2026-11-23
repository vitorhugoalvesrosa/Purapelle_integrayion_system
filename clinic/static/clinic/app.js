(() => {
  "use strict";

  const canManagePatients = document.body.dataset.canManagePatients === "true";
  const pageTitles = {
    dashboard: "Visão geral",
    patients: "Pacientes",
    procedures: "Procedimentos",
    appointments: "Agenda",
  };
  let state = { patients: [], appointments: [], procedures: [], photos: [] };
  let canvasPoints = [];
  let activePatientId = "";
  let editingAppointmentId = "";
  let toastTimer;
  const $ = (selector) => document.querySelector(selector);
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const localDate = (date = new Date()) => {
    const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return adjusted.toISOString().slice(0, 10);
  };
  const localDateTime = (date = new Date()) => {
    const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return adjusted.toISOString().slice(0, 16);
  };
  const formatDate = (value) => {
    if (!value) return "—";
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("pt-BR");
  };
  const formatDateTime = (value) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  };
  const appointmentStatus = (status) => ({
    scheduled: "Agendado",
    completed: "Realizado",
    cancelled: "Cancelado",
  })[status] || "Agendado";

  async function api(url, options = {}) {
    const headers = { Accept: "application/json", ...options.headers };
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }
    if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes((options.method || "GET").toUpperCase())) {
      headers["X-CSRFToken"] = document.cookie.split("; ").find((cookie) => cookie.startsWith("csrftoken="))?.split("=")[1] || "";
    }
    const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
    if (response.status === 401) {
      window.location.assign("/login/");
      throw new Error("Sua sessão expirou. Entre novamente.");
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
    return result;
  }

  async function loadState() {
    const [patients, appointments, procedures, photos] = await Promise.all([
      api("/api/patients/"),
      api("/api/appointments/"),
      api("/api/procedures/"),
      api("/api/photos/"),
    ]);
    state = {
      patients: patients.patients,
      appointments: appointments.appointments,
      procedures: procedures.procedures,
      photos: photos.photos,
    };
  }

  function showToast(message, error = false) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
  }

  function showPage(page) {
    if (!pageTitles[page]) return;
    document.querySelectorAll(".page").forEach((section) => section.classList.toggle("active", section.id === `page-${page}`));
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
    $("#breadcrumb-current").textContent = pageTitles[page];
    if (page === "procedures") drawFace();
    if (page === "appointments") renderAppointments();
  }

  function patientOptions(select, includeAll = false) {
    const current = select.value;
    select.innerHTML = `${includeAll ? '<option value="">Todas as pacientes</option>' : '<option value="">Selecione a paciente</option>'}${state.patients
      .map((patient) => `<option value="${escapeHTML(patient.id)}">${escapeHTML(patient.name)}</option>`).join("")}`;
    if (state.patients.some((patient) => patient.id === current)) select.value = current;
  }

  function renderPatientRows(query = "") {
    const filtered = state.patients.filter((patient) => patient.name.toLowerCase().includes(query.toLowerCase()));
    $("#patient-total").textContent = `${filtered.length} ${filtered.length === 1 ? "paciente cadastrada" : "pacientes cadastradas"}`;
    $("#patient-rows").innerHTML = filtered.map((patient) => {
      const needsReview = !patient.reviewedAt;
      return `<tr>
        <td><div class="patient-cell"><span class="patient-initial">${escapeHTML(patient.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase())}</span>${escapeHTML(patient.name)}</div></td>
        <td>${escapeHTML(patient.phone || patient.email || "—")}</td>
        <td><span class="status-pill ${needsReview ? "status-review" : "status-ok"}">${needsReview ? "Revisar" : "Atualizada"}</span></td>
        <td>${formatDate(patient.createdAt)}</td>
        <td class="row-actions"><button class="row-action" data-open-patient="${escapeHTML(patient.id)}">Abrir ficha</button>${canManagePatients && needsReview ? `<button class="row-action" data-review="${escapeHTML(patient.id)}">Revisar anamnese</button>` : ""}</td>
      </tr>`;
    }).join("");
    $("#empty-patients").hidden = filtered.length !== 0;
  }

  function appointmentOptions(select, patientId) {
    const current = select.value;
    const appointments = state.appointments.filter((item) => item.patientId === patientId && item.status !== "cancelled");
    select.required = appointments.length > 0;
    const placeholder = appointments.length ? "Selecione o atendimento" : "Sem atendimento específico";
    select.innerHTML = `<option value="">${placeholder}</option>${appointments.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(formatDateTime(item.scheduledAt))} · ${escapeHTML(item.service)}</option>`).join("")}`;
    if (appointments.some((item) => item.id === current)) select.value = current;
  }

  function renderDashboard() {
    const now = new Date();
    const month = localDate(now).slice(0, 7);
    $("#today-label").textContent = now.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
    $("#long-date").textContent = now.toLocaleDateString("pt-BR", { day: "numeric", month: "long" }).toUpperCase();
    $("#stat-patients").textContent = state.patients.length;
    $("#stat-sessions").textContent = state.procedures.filter((record) => (record.date || "").startsWith(month)).length;
    const alerts = state.patients.filter((patient) => !patient.reviewedAt);
    $("#stat-alerts").textContent = alerts.length;
    $("#alert-count").textContent = alerts.length;
    $("#alert-list").innerHTML = alerts.slice(0, 5).map((patient) => `<div class="alert-item"><span class="activity-mark">!</span><div class="alert-copy"><div><strong>${escapeHTML(patient.name)}</strong><small>Anamnese precisa ser revisada</small></div>${canManagePatients ? `<button class="alert-link" data-review="${escapeHTML(patient.id)}">Abrir</button>` : ""}</div></div>`).join("") || '<div class="empty-inline">Nenhuma anamnese pendente.</div>';
    const recent = [...state.procedures].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    $("#recent-activity").innerHTML = recent.map((record) => {
      const patient = state.patients.find((item) => item.id === record.patientId);
      return `<div class="activity-item"><span class="activity-mark">✳</span><div class="activity-copy"><strong>${escapeHTML(record.procedure)} · ${escapeHTML(patient?.name || "Paciente removida")}</strong><small>${escapeHTML(record.category)}</small></div><span class="activity-date">${formatDate(record.date)}</span></div>`;
    }).join("") || '<div class="empty-inline">Seus procedimentos recentes aparecerão aqui.</div>';
  }

  function renderTimeline() {
    const patientId = activePatientId;
    const procedures = state.procedures.filter((record) => record.patientId === patientId);
    const photos = state.photos.filter((photo) => photo.patientId === patientId);
    const appointments = state.appointments.filter((item) => item.patientId === patientId).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
    const appointmentRecords = appointments.map((appointment) => {
      const linkedProcedures = procedures.filter((record) => record.appointmentId === appointment.id);
      const linkedPhotos = photos.filter((photo) => photo.appointmentId === appointment.id);
      const procedureMarkup = linkedProcedures.map((record) => {
        const tags = [record.category, record.product && `Produto: ${record.product}`, record.lot && `Lote: ${record.lot}`, record.expiry && `Validade: ${formatDate(record.expiry)}`, record.dosage && `Dosagem: ${record.dosage}`].filter(Boolean);
        return `<div class="linked-record"><strong>${escapeHTML(record.procedure)}</strong>${record.notes ? `<p>${escapeHTML(record.notes)}</p>` : ""}<div class="timeline-tags">${tags.map((tag) => `<span class="timeline-tag">${escapeHTML(tag)}</span>`).join("")}${record.points?.length ? `<span class="timeline-tag">${record.points.length} ponto(s) facial(is)</span>` : ""}</div></div>`;
      }).join("");
      return `<article class="timeline-record"><div class="timeline-date">${formatDateTime(appointment.scheduledAt)} · ${escapeHTML(appointmentStatus(appointment.status))}</div><h3>${escapeHTML(appointment.service)}</h3>${appointment.notes ? `<p>${escapeHTML(appointment.notes)}</p>` : ""}${procedureMarkup}${linkedPhotos.length ? `<button class="text-button" type="button" data-patient-tab="photos">${linkedPhotos.length} fotografia(s) vinculada(s) · ver evolução visual →</button>` : ""}</article>`;
    });
    const standaloneProcedures = procedures.filter((record) => !record.appointmentId).map((record) => {
      const tags = [record.category, record.product && `Produto: ${record.product}`, record.lot && `Lote: ${record.lot}`, record.expiry && `Validade: ${formatDate(record.expiry)}`, record.dosage && `Dosagem: ${record.dosage}`].filter(Boolean);
      return `<article class="timeline-record"><div class="timeline-date">${formatDate(record.date)} · Procedimento sem atendimento vinculado</div><h3>${escapeHTML(record.procedure)}</h3>${record.notes ? `<p>${escapeHTML(record.notes)}</p>` : ""}<div class="timeline-tags">${tags.map((tag) => `<span class="timeline-tag">${escapeHTML(tag)}</span>`).join("")}${record.points?.length ? `<span class="timeline-tag">${record.points.length} ponto(s) facial(is)</span>` : ""}</div></article>`;
    });
    $("#patient-timeline").innerHTML = [...appointmentRecords, ...standaloneProcedures].join("") || '<div class="empty-state">Nenhum atendimento ou procedimento registrado para esta paciente.</div>';
  }

  function renderGallery() {
    const photos = state.photos.filter((photo) => photo.patientId === activePatientId).sort((a, b) => b.date.localeCompare(a.date));
    $("#patient-gallery-grid").innerHTML = photos.map((photo) => {
      const appointment = state.appointments.find((item) => item.id === photo.appointmentId);
      return `<article class="photo-card"><img src="${escapeHTML(photo.image)}" alt="${escapeHTML(`${photo.stage} - evolução visual da paciente`)}"><div class="photo-info"><span class="photo-stage">${escapeHTML(photo.stage)}</span><strong>${escapeHTML(appointment ? appointment.service : "Registro clínico")}</strong><small>${formatDate(photo.date)}${photo.caption ? ` · ${escapeHTML(photo.caption)}` : ""}${appointment ? ` · ${escapeHTML(formatDateTime(appointment.scheduledAt))}` : ""}</small></div></article>`;
    }).join("") || '<div class="empty-inline photo-empty">Nenhuma fotografia adicionada ainda.</div>';
  }

  function renderPatientDetail() {
    const patient = state.patients.find((item) => item.id === activePatientId);
    if (!patient) return;
    $("#patient-detail-name").textContent = patient.name;
    $("#patient-detail-subtitle").textContent = `Paciente desde ${formatDate(patient.createdAt)}${patient.phone ? ` · ${patient.phone}` : ""}`;
    const details = [
      ["Data de nascimento", formatDate(patient.birthDate)],
      ["Telefone", patient.phone || "—"],
      ["E-mail", patient.email || "—"],
      ["Alergias", patient.allergies || "Não informado"],
      ["Medicamentos", patient.medications || "Não informado"],
      ["Condições relevantes", patient.conditions || "Não informado"],
      ["Gestação/amamentação", patient.pregnant ? "Sim" : "Não"],
      ["Observações", patient.notes || "Nenhuma"],
    ];
    $("#patient-profile").innerHTML = `<div class="panel-heading"><div><h2>Anamnese</h2><p>${patient.reviewedAt ? `Revisada em ${formatDate(patient.reviewedAt)}` : "Ainda não revisada"}</p></div><span class="status-pill ${patient.reviewedAt ? "status-ok" : "status-review"}">${patient.reviewedAt ? "Atualizada" : "Revisar"}</span></div><div class="patient-facts">${details.map(([label, value]) => `<div class="patient-fact"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`).join("")}</div>`;
    $("#photo-patient").value = patient.id;
    appointmentOptions($("#photo-appointment"), patient.id);
    renderTimeline();
    renderGallery();
  }

  function showPatientDetail(id) {
    if (!state.patients.some((patient) => patient.id === id)) return;
    activePatientId = id;
    $("#patient-list-view").hidden = true;
    $("#patient-detail-view").hidden = false;
    setPatientTab("record");
    renderPatientDetail();
  }

  function showPatientList() {
    activePatientId = "";
    $("#patient-detail-view").hidden = true;
    $("#patient-list-view").hidden = false;
  }

  function setPatientTab(tab) {
    const showPhotos = tab === "photos";
    $("#patient-record-panel").hidden = showPhotos;
    $("#patient-photos-panel").hidden = !showPhotos;
    document.querySelectorAll(".detail-tab").forEach((button) => button.classList.toggle("active", button.dataset.patientTab === tab));
    if (showPhotos) renderGallery();
  }

  function renderAppointments() {
    const selectedDay = $("#appointment-day").value;
    const appointments = state.appointments
      .filter((item) => !selectedDay || localDate(new Date(item.scheduledAt)) === selectedDay)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    $("#appointment-list").innerHTML = appointments.map((appointment) => {
      const procedures = state.procedures.filter((record) => record.appointmentId === appointment.id);
      const photos = state.photos.filter((photo) => photo.appointmentId === appointment.id);
      const history = [
        ...procedures.map((record) => `<span class="timeline-tag">${escapeHTML(record.procedure)}</span>`),
        photos.length ? `<span class="timeline-tag">${photos.length} fotografia(s)</span>` : "",
      ].filter(Boolean).join("");
      return `<article class="appointment-card">
        <div class="appointment-main"><div class="timeline-date">${formatDateTime(appointment.scheduledAt)}</div><h3>${escapeHTML(appointment.service)}</h3><button class="text-button appointment-patient" type="button" data-open-patient="${escapeHTML(appointment.patientId)}">${escapeHTML(appointment.patientName)} · Abrir ficha →</button>${appointment.notes ? `<p>${escapeHTML(appointment.notes)}</p>` : ""}${history ? `<div class="timeline-tags">${history}</div>` : '<small class="muted">Nenhum procedimento ou foto vinculado ainda.</small>'}</div>
        <div class="appointment-actions"><label class="field">Status<select data-appointment-status="${escapeHTML(appointment.id)}"><option value="scheduled" ${appointment.status === "scheduled" ? "selected" : ""}>Agendado</option><option value="completed" ${appointment.status === "completed" ? "selected" : ""}>Realizado</option><option value="cancelled" ${appointment.status === "cancelled" ? "selected" : ""}>Cancelado</option></select></label><button class="button button-outline" type="button" data-edit-appointment="${escapeHTML(appointment.id)}">Editar</button></div>
      </article>`;
    }).join("") || '<div class="empty-state">Nenhum atendimento nesta data.</div>';
  }

  async function reviewPatient(id) {
    const patient = state.patients.find((item) => item.id === id);
    if (!patient) return;
    const summary = [
      `Paciente: ${patient.name}`,
      `Alergias: ${patient.allergies || "não informado"}`,
      `Medicamentos: ${patient.medications || "não informado"}`,
      `Gestação/amamentação: ${patient.pregnant ? "sim" : "não"}`,
      `Condições: ${patient.conditions || "não informado"}`,
      `Observações: ${patient.notes || "nenhuma"}`,
    ].join("\n");
    if (window.confirm(`${summary}\n\nConfirma que a anamnese foi revisada?`)) {
      try {
        await api(`/api/patients/${encodeURIComponent(id)}/review/`, { method: "PATCH" });
        await loadState();
        renderAll();
        showToast("Anamnese marcada como revisada.");
      } catch (error) {
        console.error("Não foi possível atualizar a anamnese.", error);
        showToast(error.message, true);
      }
    }
  }

  function resizeCanvas() {
    const canvas = $("#face-canvas");
    if (!canvas || !canvas.clientWidth) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawFace();
  }

  function drawFace() {
    const canvas = $("#face-canvas");
    if (!canvas || !canvas.clientWidth) return;
    const context = canvas.getContext("2d");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2 - 4;
    const scale = Math.min(width / 250, height / 320);
    context.save();
    context.translate(cx, cy);
    context.scale(scale, scale);
    context.strokeStyle = "#b9bdb3";
    context.lineWidth = 1.5;
    context.fillStyle = "#f5f1e9";
    context.beginPath();
    context.moveTo(0, -126); context.bezierCurveTo(58, -128, 79, -76, 69, -11);
    context.bezierCurveTo(65, 38, 41, 93, 0, 105);
    context.bezierCurveTo(-41, 93, -65, 38, -69, -11);
    context.bezierCurveTo(-79, -76, -58, -128, 0, -126); context.fill(); context.stroke();
    context.beginPath(); context.moveTo(-68, -54); context.quadraticCurveTo(-93, -59, -70, -21);
    context.moveTo(68, -54); context.quadraticCurveTo(93, -59, 70, -21); context.stroke();
    context.beginPath(); context.moveTo(-47, -38); context.quadraticCurveTo(-27, -49, -10, -38);
    context.moveTo(10, -38); context.quadraticCurveTo(27, -49, 47, -38);
    context.moveTo(-43, -30); context.quadraticCurveTo(-28, -19, -13, -30);
    context.moveTo(13, -30); context.quadraticCurveTo(28, -19, 43, -30); context.stroke();
    context.fillStyle = "#899184";
    context.beginPath(); context.arc(-28, -29, 2, 0, Math.PI * 2); context.arc(28, -29, 2, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.moveTo(0, -21); context.quadraticCurveTo(-8, 10, -12, 14); context.quadraticCurveTo(0, 20, 12, 14); context.stroke();
    context.beginPath(); context.moveTo(-20, 43); context.quadraticCurveTo(0, 53, 20, 43); context.quadraticCurveTo(0, 63, -20, 43); context.stroke();
    context.beginPath(); context.moveTo(-39, 68); context.quadraticCurveTo(0, 86, 39, 68); context.stroke();
    context.restore();
    canvasPoints.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.fillStyle = "#a65054";
      context.fill();
      context.fillStyle = "#fff";
      context.font = "9px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(index + 1), x, y);
    });
    $("#point-count").textContent = `${canvasPoints.length} ${canvasPoints.length === 1 ? "ponto marcado" : "pontos marcados"}`;
  }

  function resetAppointmentForm() {
    const form = $("#appointment-form");
    form.reset();
    editingAppointmentId = "";
    $("#appointment-patient").disabled = false;
    $("#appointment-form-title").textContent = "Novo atendimento";
    $("#appointment-submit").textContent = "Agendar atendimento";
    $("#cancel-appointment-edit").hidden = true;
    $("#appointment-date").value = localDateTime();
  }

  function editAppointment(id) {
    const appointment = state.appointments.find((item) => item.id === id);
    if (!appointment) return;
    showPage("appointments");
    editingAppointmentId = id;
    $("#appointment-patient").value = appointment.patientId;
    $("#appointment-patient").disabled = true;
    $("#appointment-form").elements.service.value = appointment.service;
    $("#appointment-form").elements.scheduledAt.value = localDateTime(new Date(appointment.scheduledAt));
    $("#appointment-form").elements.notes.value = appointment.notes;
    $("#appointment-form-title").textContent = "Editar atendimento";
    $("#appointment-submit").textContent = "Salvar alterações";
    $("#cancel-appointment-edit").hidden = false;
    $("#appointment-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderAll() {
    renderPatientRows($("#patient-search").value);
    renderDashboard();
    patientOptions($("#procedure-patient"));
    patientOptions($("#appointment-patient"));
    appointmentOptions($("#procedure-appointment"), $("#procedure-patient").value);
    $("#photo-patient").value = activePatientId;
    appointmentOptions($("#photo-appointment"), activePatientId);
    if (activePatientId) renderPatientDetail();
    renderAppointments();
  }

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Não foi possível ler a fotografia."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("O arquivo selecionado não é uma imagem válida."));
        image.onload = () => {
          const maxSize = 1200;
          const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(image.naturalWidth * ratio);
          canvas.height = Math.round(image.naturalHeight * ratio);
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.78));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  document.querySelectorAll("[data-page], [data-go]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    showPage(button.dataset.page || button.dataset.go);
  }));
  $("#new-patient-button")?.addEventListener("click", () => $("#patient-dialog").showModal());
  $("#close-dialog")?.addEventListener("click", () => $("#patient-dialog").close());
  $("#cancel-dialog")?.addEventListener("click", () => $("#patient-dialog").close());
  $("#patient-search").addEventListener("input", (event) => renderPatientRows(event.target.value));
  $("#patient-rows").addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-patient]");
    const reviewButton = event.target.closest("[data-review]");
    if (openButton) showPatientDetail(openButton.dataset.openPatient);
    else if (reviewButton) reviewPatient(reviewButton.dataset.review);
  });
  $("#back-to-patients").addEventListener("click", showPatientList);
  $("#patient-detail-view").addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-patient-tab]");
    if (tabButton) setPatientTab(tabButton.dataset.patientTab);
  });
  $("#print-patient-record").addEventListener("click", () => {
    setPatientTab("record");
    window.print();
  });
  $("#alert-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-review]");
    if (button) reviewPatient(button.dataset.review);
  });
  $("#patient-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const patient = {
      name: data.get("name").trim(),
      birthDate: data.get("birthDate"),
      phone: data.get("phone").trim(),
      email: data.get("email").trim(),
      allergies: data.get("allergies").trim(),
      medications: data.get("medications").trim(),
      conditions: data.get("conditions").trim(),
      pregnant: data.has("pregnant"),
      notes: data.get("notes").trim(),
    };
    try {
      await api("/api/patients/", { method: "POST", body: JSON.stringify(patient) });
      await loadState();
      form.reset();
      $("#patient-dialog").close();
      renderAll();
      showPage("patients");
      showToast("Paciente cadastrada com sucesso.");
    } catch (error) {
      console.error("Não foi possível cadastrar a paciente.", error);
      showToast(error.message, true);
    }
  });
  $("#procedure-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const record = {
      patientId: data.get("patientId"),
      appointmentId: data.get("appointmentId"),
      category: data.get("category"),
      procedure: data.get("procedure").trim(),
      product: data.get("product").trim(),
      lot: data.get("lot").trim(),
      expiry: data.get("expiry"),
      dosage: data.get("dosage").trim(),
      date: data.get("date"),
      notes: data.get("notes").trim(),
      points: canvasPoints.map((point) => ({ ...point })),
    };
    try {
      await api("/api/procedures/", { method: "POST", body: JSON.stringify(record) });
      await loadState();
      form.reset();
      $("#procedure-date").value = localDate();
      canvasPoints = [];
      drawFace();
      renderAll();
      showToast("Procedimento registrado no prontuário.");
    } catch (error) {
      console.error("Não foi possível registrar o procedimento.", error);
      showToast(error.message, true);
    }
  });
  $("#procedure-patient").addEventListener("change", (event) => {
    appointmentOptions($("#procedure-appointment"), event.target.value);
  });
  $("#appointment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const isEditing = Boolean(editingAppointmentId);
    const appointment = {
      service: data.get("service").trim(),
      scheduledAt: data.get("scheduledAt"),
      notes: data.get("notes").trim(),
    };
    const url = isEditing ? `/api/appointments/${encodeURIComponent(editingAppointmentId)}/` : "/api/appointments/";
    if (!isEditing) appointment.patientId = data.get("patientId");
    try {
      await api(url, { method: isEditing ? "PATCH" : "POST", body: JSON.stringify(appointment) });
      await loadState();
      $("#appointment-day").value = appointment.scheduledAt.slice(0, 10);
      resetAppointmentForm();
      renderAll();
      showToast(isEditing ? "Atendimento atualizado." : "Atendimento agendado.");
    } catch (error) {
      console.error("Não foi possível salvar o atendimento.", error);
      showToast(error.message, true);
    }
  });
  $("#cancel-appointment-edit").addEventListener("click", resetAppointmentForm);
  $("#appointment-day").addEventListener("change", renderAppointments);
  $("#appointment-list").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-appointment]");
    const patientButton = event.target.closest("[data-open-patient]");
    if (editButton) editAppointment(editButton.dataset.editAppointment);
    if (patientButton) {
      showPage("patients");
      showPatientDetail(patientButton.dataset.openPatient);
    }
  });
  $("#appointment-list").addEventListener("change", async (event) => {
    const select = event.target.closest("[data-appointment-status]");
    if (!select) return;
    try {
      await api(`/api/appointments/${encodeURIComponent(select.dataset.appointmentStatus)}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value }),
      });
      await loadState();
      renderAll();
      showToast("Status do atendimento atualizado.");
    } catch (error) {
      console.error("Não foi possível atualizar o atendimento.", error);
      showToast(error.message, true);
      renderAppointments();
    }
  });
  $("#face-canvas").addEventListener("click", (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    canvasPoints.push({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
    drawFace();
  });
  $("#clear-points").addEventListener("click", () => {
    canvasPoints = [];
    drawFace();
  });
  $("#photo-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("image");
    if (!file || !file.type.startsWith("image/")) {
      showToast("Selecione um arquivo de imagem válido.", true);
      return;
    }
    try {
      const photo = {
        patientId: data.get("patientId"),
        appointmentId: data.get("appointmentId"),
        stage: data.get("stage"),
        date: data.get("date"),
        caption: data.get("caption").trim(),
        image: await resizeImage(file),
      };
      await api("/api/photos/", { method: "POST", body: JSON.stringify(photo) });
      await loadState();
      form.reset();
      $("#photo-date").value = localDate();
      $("#photo-patient").value = activePatientId;
      appointmentOptions($("#photo-appointment"), activePatientId);
      renderPatientDetail();
      showToast("Fotografia adicionada à evolução visual.");
    } catch (error) {
      console.error("Falha ao adicionar fotografia.", error);
      showToast(error.message || "Não foi possível processar a fotografia.", true);
    }
  });
  window.addEventListener("resize", resizeCanvas);

  loadState().then(() => {
    $("#app-content").hidden = false;
    $("#appointment-day").value = localDate();
    renderAll();
    $("#procedure-date").value = localDate();
    $("#photo-date").value = localDate();
    $("#appointment-date").value = localDateTime();
    resizeCanvas();
  }).catch((error) => {
    console.error("Não foi possível carregar os dados da clínica.", error);
    showToast(error.message || "Não foi possível carregar os dados da clínica.", true);
  });
})();
