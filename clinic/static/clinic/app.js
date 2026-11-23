(() => {
  "use strict";

  const STORAGE_KEY = "purapelle.integration.v1";
  const pageTitles = {
    dashboard: "Visão geral",
    patients: "Pacientes",
    procedures: "Procedimentos",
    timeline: "Prontuário",
    gallery: "Evolução visual",
  };
  const demoPatients = [
    { id: "demo-ana", name: "Ana Carolina Mendes", birthDate: "1988-04-12", phone: "(11) 99912-3456", email: "ana.mendes@email.com", allergies: "Nenhuma conhecida", medications: "Nenhum", conditions: "", pregnant: false, notes: "", createdAt: "2025-01-10", demo: true },
    { id: "demo-julia", name: "Julia Fernandes Costa", birthDate: "1992-09-23", phone: "(11) 99876-5432", email: "julia.costa@email.com", allergies: "Látex", medications: "Nenhum", conditions: "", pregnant: false, notes: "", createdAt: "2025-02-14", demo: true },
    { id: "demo-mariana", name: "Mariana Oliveira Lima", birthDate: "1985-06-07", phone: "(11) 99765-4321", email: "mariana.lima@email.com", allergies: "", medications: "", conditions: "", pregnant: false, notes: "", createdAt: "2025-03-02", demo: true },
  ];

  let state;
  let canvasPoints = [];
  let toastTimer;
  const $ = (selector) => document.querySelector(selector);
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const localDate = (date = new Date()) => {
    const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return adjusted.toISOString().slice(0, 10);
  };
  const formatDate = (value) => {
    if (!value) return "—";
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("pt-BR");
  };

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        state = { patients: demoPatients, procedures: [], photos: [] };
        saveState();
        return;
      }
      const parsed = JSON.parse(saved);
      state = {
        patients: Array.isArray(parsed.patients) ? parsed.patients : [],
        procedures: Array.isArray(parsed.procedures) ? parsed.procedures : [],
        photos: Array.isArray(parsed.photos) ? parsed.photos : [],
      };
    } catch (error) {
      console.error("Não foi possível ler os dados salvos localmente.", error);
      state = { patients: demoPatients, procedures: [], photos: [] };
      showToast("Não foi possível ler os dados salvos neste navegador.", true);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error("Não foi possível salvar os dados localmente.", error);
      showToast("Armazenamento do navegador cheio ou indisponível. Remova fotos e tente novamente.", true);
      return false;
    }
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
    if (page === "timeline") renderTimeline();
    if (page === "gallery") renderGallery();
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
        <td><button class="row-action" data-review="${escapeHTML(patient.id)}">${needsReview ? "Revisar" : "Abrir"}</button></td>
      </tr>`;
    }).join("");
    $("#empty-patients").hidden = filtered.length !== 0;
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
    $("#demo-notice").hidden = !state.patients.some((patient) => patient.demo);
    $("#alert-list").innerHTML = alerts.slice(0, 5).map((patient) => `<div class="alert-item"><span class="activity-mark">!</span><div class="alert-copy"><div><strong>${escapeHTML(patient.name)}</strong><small>Anamnese precisa ser revisada</small></div><button class="alert-link" data-review="${escapeHTML(patient.id)}">Abrir</button></div></div>`).join("") || '<div class="empty-inline">Nenhuma anamnese pendente.</div>';
    const recent = [...state.procedures].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    $("#recent-activity").innerHTML = recent.map((record) => {
      const patient = state.patients.find((item) => item.id === record.patientId);
      return `<div class="activity-item"><span class="activity-mark">✳</span><div class="activity-copy"><strong>${escapeHTML(record.procedure)} · ${escapeHTML(patient?.name || "Paciente removida")}</strong><small>${escapeHTML(record.category)}</small></div><span class="activity-date">${formatDate(record.date)}</span></div>`;
    }).join("") || '<div class="empty-inline">Seus procedimentos recentes aparecerão aqui.</div>';
  }

  function renderTimeline() {
    const select = $("#timeline-patient");
    patientOptions(select, true);
    const records = state.procedures.filter((record) => !select.value || record.patientId === select.value).sort((a, b) => b.date.localeCompare(a.date));
    $("#timeline-list").innerHTML = records.map((record) => {
      const patient = state.patients.find((item) => item.id === record.patientId);
      const tags = [record.category, record.product && `Produto: ${record.product}`, record.lot && `Lote: ${record.lot}`, record.expiry && `Validade: ${formatDate(record.expiry)}`, record.dosage && `Dosagem: ${record.dosage}`].filter(Boolean);
      return `<article class="timeline-record"><div class="timeline-date">${formatDate(record.date)}</div><h3>${escapeHTML(record.procedure)} · ${escapeHTML(patient?.name || "Paciente removida")}</h3>${record.notes ? `<p>${escapeHTML(record.notes)}</p>` : ""}<div class="timeline-tags">${tags.map((tag) => `<span class="timeline-tag">${escapeHTML(tag)}</span>`).join("")}${record.points?.length ? `<span class="timeline-tag">${record.points.length} ponto(s) facial(is)</span>` : ""}</div></article>`;
    }).join("") || '<div class="empty-state">Nenhum procedimento registrado para esta seleção.</div>';
  }

  function renderGallery() {
    const select = $("#gallery-patient");
    patientOptions(select, true);
    const photos = state.photos.filter((photo) => !select.value || photo.patientId === select.value).sort((a, b) => b.date.localeCompare(a.date));
    $("#gallery-grid").innerHTML = photos.map((photo) => {
      const patient = state.patients.find((item) => item.id === photo.patientId);
      return `<article class="photo-card"><img src="${escapeHTML(photo.image)}" alt="${escapeHTML(`${photo.stage} - ${patient?.name || "Paciente"}`)}"><div class="photo-info"><span class="photo-stage">${escapeHTML(photo.stage)}</span><strong>${escapeHTML(patient?.name || "Paciente removida")}</strong><small>${formatDate(photo.date)}${photo.caption ? ` · ${escapeHTML(photo.caption)}` : ""}</small></div></article>`;
    }).join("") || '<div class="empty-inline photo-empty">Nenhuma fotografia adicionada ainda.</div>';
  }

  function reviewPatient(id) {
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
      patient.reviewedAt = localDate();
      if (saveState()) {
        renderAll();
        showToast("Anamnese marcada como revisada.");
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

  function renderAll() {
    renderPatientRows($("#patient-search").value);
    renderDashboard();
    patientOptions($("#procedure-patient"));
    patientOptions($("#photo-patient"));
    renderTimeline();
    renderGallery();
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
  $("#new-patient-button").addEventListener("click", () => $("#patient-dialog").showModal());
  $("#close-dialog").addEventListener("click", () => $("#patient-dialog").close());
  $("#cancel-dialog").addEventListener("click", () => $("#patient-dialog").close());
  $("#patient-search").addEventListener("input", (event) => renderPatientRows(event.target.value));
  $("#patient-rows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-review]");
    if (button) reviewPatient(button.dataset.review);
  });
  $("#alert-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-review]");
    if (button) reviewPatient(button.dataset.review);
  });
  $("#patient-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const patient = {
      id: crypto.randomUUID(),
      name: data.get("name").trim(),
      birthDate: data.get("birthDate"),
      phone: data.get("phone").trim(),
      email: data.get("email").trim(),
      allergies: data.get("allergies").trim(),
      medications: data.get("medications").trim(),
      conditions: data.get("conditions").trim(),
      pregnant: data.has("pregnant"),
      notes: data.get("notes").trim(),
      createdAt: localDate(),
    };
    state.patients.unshift(patient);
    if (!saveState()) {
      state.patients.shift();
      return;
    }
    form.reset();
    $("#patient-dialog").close();
    renderAll();
    showPage("patients");
    showToast("Paciente cadastrada com sucesso.");
  });
  $("#procedure-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const record = {
      id: crypto.randomUUID(),
      patientId: data.get("patientId"),
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
    state.procedures.unshift(record);
    if (!saveState()) {
      state.procedures.shift();
      return;
    }
    event.currentTarget.reset();
    $("#procedure-date").value = localDate();
    canvasPoints = [];
    drawFace();
    renderAll();
    showToast("Procedimento registrado no prontuário.");
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
  $("#timeline-patient").addEventListener("change", renderTimeline);
  $("#gallery-patient").addEventListener("change", renderGallery);
  $("#print-timeline").addEventListener("click", () => window.print());
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
        id: crypto.randomUUID(),
        patientId: data.get("patientId"),
        stage: data.get("stage"),
        date: data.get("date"),
        caption: data.get("caption").trim(),
        image: await resizeImage(file),
      };
      state.photos.unshift(photo);
      if (!saveState()) {
        state.photos.shift();
        return;
      }
      form.reset();
      $("#photo-date").value = localDate();
      renderGallery();
      showToast("Fotografia adicionada à galeria.");
    } catch (error) {
      console.error("Falha ao adicionar fotografia.", error);
      showToast(error.message || "Não foi possível processar a fotografia.", true);
    }
  });
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeprint", () => {
    document.querySelectorAll(".page").forEach((page) => page.dataset.wasActive = page.classList.contains("active"));
    showPage("timeline");
  });
  window.addEventListener("afterprint", () => {
    const active = [...document.querySelectorAll(".page")].find((page) => page.dataset.wasActive === "true");
    if (active) showPage(active.id.replace("page-", ""));
  });

  loadState();
  renderAll();
  $("#procedure-date").value = localDate();
  $("#photo-date").value = localDate();
  resizeCanvas();
})();
