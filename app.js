// Mis IAs — chat con varias IAs a través de OpenRouter
(() => {
  "use strict";

  const CFG = window.CONFIG;
  const API = "https://openrouter.ai/api/v1";
  const $ = (s) => document.querySelector(s);

  // ---------- Guardado en el navegador ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const state = {
    key: store.get("or_key", null),
    models: [],          // [{id, name, providerId, free}]
    modelsError: null,
    selected: store.get("selected_model", null),
    chats: store.get("chats", []),
    currentId: store.get("current_chat", null),
    openGroups: new Set(store.get("open_groups", CFG.providers.map((p) => p.id))),
    controller: null,
  };

  const save = () => {
    store.set("chats", state.chats);
    store.set("current_chat", state.currentId);
    store.set("selected_model", state.selected);
    store.set("open_groups", [...state.openGroups]);
  };

  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const md = (text) => {
    if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(text));
    return `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const providerOf = (id) => CFG.providers.find((p) => p.id === id);
  const modelById = (id) => state.models.find((m) => m.id === id);

  // ---------- Inicio de sesión con OpenRouter (OAuth PKCE) ----------
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const callbackUrl = () => location.origin + location.pathname;

  async function login() {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    sessionStorage.setItem("pkce_verifier", verifier);
    location.href = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl())}&code_challenge=${challenge}&code_challenge_method=S256`;
  }

  async function finishLoginIfNeeded() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    if (!code) return;
    history.replaceState(null, "", location.pathname);
    const verifier = sessionStorage.getItem("pkce_verifier");
    sessionStorage.removeItem("pkce_verifier");
    try {
      const r = await fetch(`${API}/auth/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
      });
      const data = await r.json();
      if (!r.ok || !data.key) throw new Error(data?.error?.message || "No se pudo iniciar sesión");
      setKey(data.key);
    } catch (e) {
      alert("Error al iniciar sesión: " + e.message);
    }
  }

  function setKey(key) {
    state.key = key;
    if (key) store.set("or_key", key); else store.del("or_key");
    renderAccount();
  }

  async function renderAccount() {
    const el = $("#account");
    if (!state.key) {
      el.innerHTML = `
        <button class="btn-primary" id="loginBtn">Iniciar sesión con OpenRouter</button>
        <button class="link-btn" id="pasteKey">o pegar una clave</button>`;
      $("#loginBtn").onclick = login;
      $("#pasteKey").onclick = () => $("#keyDialog").showModal();
      return;
    }
    el.innerHTML = `
      <div class="status"><span class="dot" style="background:#4ade80"></span><b>Conectado</b> a OpenRouter</div>
      <div class="status" id="usage"></div>
      <button class="btn-ghost" id="logoutBtn">Cerrar sesión</button>`;
    $("#logoutBtn").onclick = () => { if (confirm("¿Cerrar sesión en este navegador?")) setKey(null); };
    try {
      const r = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${state.key}` } });
      if (r.status === 401) { setKey(null); return; }
      const { data } = await r.json();
      if (data && typeof data.usage === "number") {
        $("#usage").textContent = `Gastado: ${data.usage.toFixed(2)} $` + (data.limit_remaining != null ? ` · quedan ${data.limit_remaining.toFixed(2)} $` : "");
      }
    } catch {}
  }

  // ---------- Modelos ----------
  async function loadModels() {
    try {
      const r = await fetch(`${API}/models`);
      const { data } = await r.json();
      const list = [];
      for (const m of data) {
        const id = m.id.toLowerCase();
        const p = CFG.providers.find((p) =>
          p.prefixes.some((pre) => id.startsWith(pre)) &&
          (!p.contains || p.contains.some((c) => id.includes(c)))
        );
        if (!p) continue;
        const free = id.endsWith(":free") || (m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0);
        list.push({
          id: m.id,
          name: (m.name || m.id).replace(/^[^:]+:\s*/, ""),
          providerId: p.id,
          free,
          created: m.created || 0,
        });
      }
      list.sort((a, b) => (b.free - a.free) || (b.created - a.created));
      state.models = list;
      state.modelsError = null;
      if (!state.selected || !modelById(state.selected)) {
        state.selected = (list.find((m) => m.providerId === "claude" && m.id.includes("sonnet")) || list.find((m) => m.providerId === "claude") || list[0])?.id || null;
      }
    } catch {
      state.modelsError = "No se pudo cargar la lista de modelos. Revisa tu conexión y recarga la página.";
    }
    renderPicker();
  }

  // ---------- Selector (árbol de IA → modelos) ----------
  function renderPicker() {
    const sel = modelById(state.selected);
    const p = sel && providerOf(sel.providerId);
    $("#pickerDot").style.background = p ? p.color : "";
    $("#pickerLabel").innerHTML = sel
      ? `${escapeHtml(p.name)} <small>› ${escapeHtml(sel.name)}</small>`
      : state.modelsError ? "Sin modelos" : "Cargando modelos…";
    renderTree();
  }

  function renderTree() {
    const tree = $("#pickerTree");
    if (state.modelsError) { tree.innerHTML = `<div class="tree-empty">${state.modelsError}</div>`; return; }
    const q = $("#pickerSearch").value.trim().toLowerCase();
    const freeOnly = $("#freeOnly").checked;
    tree.innerHTML = "";

    for (const p of CFG.providers) {
      const models = state.models.filter((m) =>
        m.providerId === p.id &&
        (!freeOnly || m.free) &&
        (!q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      );
      const open = q || freeOnly || state.openGroups.has(p.id);
      const g = document.createElement("div");
      g.className = "tree-group" + (open ? " open" : "");
      g.innerHTML = `
        <button class="tree-head" type="button">
          <span class="arrow">▶</span><span class="dot" style="background:${p.color}"></span>
          ${escapeHtml(p.name)}<span class="count">${models.length}</span>
        </button>
        <div class="tree-models"></div>`;
      g.querySelector(".tree-head").onclick = () => {
        state.openGroups.has(p.id) ? state.openGroups.delete(p.id) : state.openGroups.add(p.id);
        save(); renderTree();
      };
      const box = g.querySelector(".tree-models");
      if (!models.length) box.innerHTML = `<div class="tree-empty">No hay modelos${q || freeOnly ? " con ese filtro" : " disponibles ahora"}.</div>`;
      for (const m of models) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "model-opt" + (m.id === state.selected ? " selected" : "");
        b.title = m.id;
        b.innerHTML = `<span class="n">${escapeHtml(m.name)}</span>${m.free ? '<span class="badge">GRATIS</span>' : ""}`;
        b.onclick = () => { state.selected = m.id; save(); closePicker(); renderPicker(); };
        box.appendChild(b);
      }
      tree.appendChild(g);
    }
  }

  const openPicker = () => { $("#pickerPanel").hidden = false; $("#pickerSearch").focus(); };
  const closePicker = () => { $("#pickerPanel").hidden = true; };

  // ---------- Conversaciones ----------
  const currentChat = () => state.chats.find((c) => c.id === state.currentId);

  function newChat() {
    state.currentId = null;
    save(); renderChats(); renderMessages(); closeSidebar();
    $("#input").focus();
  }

  function renderChats() {
    const list = $("#chatList");
    list.innerHTML = "";
    for (const c of state.chats) {
      const d = document.createElement("div");
      d.className = "chat-item" + (c.id === state.currentId ? " active" : "");
      d.innerHTML = `<span class="t">${escapeHtml(c.title)}</span><button class="del" title="Borrar">✕</button>`;
      d.onclick = () => { state.currentId = c.id; save(); renderChats(); renderMessages(); closeSidebar(); };
      d.querySelector(".del").onclick = (e) => {
        e.stopPropagation();
        if (!confirm("¿Borrar esta conversación?")) return;
        state.chats = state.chats.filter((x) => x.id !== c.id);
        if (state.currentId === c.id) state.currentId = null;
        save(); renderChats(); renderMessages();
      };
      list.appendChild(d);
    }
  }

  function messageEl(m) {
    const div = document.createElement("div");
    div.className = `msg ${m.role}${m.error ? " error" : ""}`;
    if (m.role === "assistant") {
      const mod = modelById(m.model);
      const p = mod && providerOf(mod.providerId);
      div.innerHTML = `<div class="who"><span class="dot" style="background:${p ? p.color : "var(--muted)"}"></span>${escapeHtml(mod ? `${p.name} › ${mod.name}` : m.model || "IA")}</div><div class="body"></div>`;
      div.querySelector(".body").innerHTML = m.error ? escapeHtml(m.content) : md(m.content);
    } else {
      div.innerHTML = `<div class="body"></div>`;
      div.querySelector(".body").textContent = m.content;
    }
    return div;
  }

  function renderMessages() {
    const box = $("#messages");
    const chat = currentChat();
    box.innerHTML = "";
    if (!chat || !chat.messages.length) {
      box.innerHTML = `<div class="empty"><h2>¿Con quién quieres hablar hoy?</h2><p>Elige una IA y un modelo arriba y escribe tu mensaje. Puedes cambiar de modelo en mitad de la conversación.</p></div>`;
      return;
    }
    chat.messages.forEach((m) => box.appendChild(messageEl(m)));
    box.scrollTop = box.scrollHeight;
  }

  // ---------- Enviar mensaje (respuesta en streaming) ----------
  async function send(text) {
    if (!state.key) { alert("Primero inicia sesión con OpenRouter (abajo a la izquierda)."); openSidebar(); return; }
    if (!state.selected) { openPicker(); return; }

    let chat = currentChat();
    if (!chat) {
      chat = { id: uid(), title: text.slice(0, 40), messages: [] };
      state.chats.unshift(chat);
      state.currentId = chat.id;
    }
    chat.messages.push({ role: "user", content: text });
    const reply = { role: "assistant", content: "", model: state.selected };
    chat.messages.push(reply);
    save(); renderChats(); renderMessages();

    const box = $("#messages");
    const el = box.lastElementChild;
    const body = el.querySelector(".body");
    body.classList.add("typing");
    setBusy(true);

    const history = chat.messages.slice(0, -1).filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    state.controller = new AbortController();

    try {
      const r = await fetch(`${API}/chat/completions`, {
        method: "POST",
        signal: state.controller.signal,
        headers: {
          Authorization: `Bearer ${state.key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": callbackUrl(),
          "X-Title": CFG.appName,
        },
        body: JSON.stringify({ model: reply.model, messages: history, stream: true }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(friendlyError(r.status, err?.error?.message));
      }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          let json;
          try { json = JSON.parse(payload); } catch { continue; }
          if (json.error) throw new Error(json.error.message || "Error del modelo");
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            reply.content += delta;
            body.innerHTML = md(reply.content);
            box.scrollTop = box.scrollHeight;
          }
        }
      }
      if (!reply.content) reply.content = "_(El modelo no ha devuelto texto.)_";
    } catch (e) {
      if (e.name === "AbortError") {
        reply.content += reply.content ? "\n\n_(detenido)_" : "_(detenido)_";
      } else {
        reply.error = true;
        reply.content = "⚠️ " + e.message;
      }
    } finally {
      body.classList.remove("typing");
      state.controller = null;
      setBusy(false);
      save(); renderMessages();
      renderAccount();
    }
  }

  function friendlyError(status, msg) {
    if (status === 401) return "La sesión de OpenRouter ha caducado. Vuelve a iniciar sesión.";
    if (status === 402) return "No te queda saldo en OpenRouter. Recarga en openrouter.ai/settings/credits o usa un modelo GRATIS.";
    if (status === 429) return "Demasiadas peticiones a este modelo ahora mismo. Espera un poco o prueba otro.";
    return msg || `Error ${status}`;
  }

  function setBusy(busy) {
    const b = $("#sendBtn");
    b.classList.toggle("stop", busy);
    b.textContent = busy ? "■" : "➤";
    b.setAttribute("aria-label", busy ? "Detener" : "Enviar");
  }

  // ---------- Mis cuentas ----------
  function renderCards() {
    $("#cards").innerHTML = CFG.providers.map((p) => `
      <a class="card" style="--c:${p.color}" href="${p.url}" target="_blank" rel="noopener">
        <h3><span class="dot" style="background:${p.color}"></span>${escapeHtml(p.name)}</h3>
        <div class="plan">${escapeHtml(p.plan || "")}</div>
        <div class="open">Abrir ↗</div>
      </a>`).join("");
  }

  // ---------- Pestañas y menú móvil ----------
  function showView(v) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
    $("#viewChat").hidden = v !== "chat";
    $("#viewCuentas").hidden = v !== "cuentas";
    $("#newChat").hidden = $("#chatList").hidden = v !== "chat";
    closeSidebar();
  }
  const openSidebar = () => { $("#sidebar").classList.add("open"); $("#backdrop").classList.add("show"); };
  const closeSidebar = () => { $("#sidebar").classList.remove("open"); $("#backdrop").classList.remove("show"); };

  // ---------- Eventos ----------
  function bind() {
    document.title = CFG.appName;
    $("#appName").textContent = CFG.appName;

    document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => showView(t.dataset.view)));
    $("#menuBtn").onclick = openSidebar;
    document.querySelectorAll("[data-menu]").forEach((b) => (b.onclick = openSidebar));
    $("#backdrop").onclick = closeSidebar;
    $("#newChat").onclick = newChat;

    $("#pickerBtn").onclick = (e) => { e.stopPropagation(); $("#pickerPanel").hidden ? openPicker() : closePicker(); };
    $("#pickerPanel").onclick = (e) => e.stopPropagation();
    document.addEventListener("click", closePicker);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePicker(); });
    $("#pickerSearch").oninput = renderTree;
    $("#freeOnly").onchange = renderTree;

    const input = $("#input");
    const grow = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 200) + "px"; };
    input.oninput = grow;
    input.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); }
    };
    $("#composer").onsubmit = (e) => {
      e.preventDefault();
      if (state.controller) { state.controller.abort(); return; }
      const text = input.value.trim();
      if (!text) return;
      input.value = ""; grow();
      send(text);
    };

    $("#keySave").onclick = () => {
      const k = $("#keyInput").value.trim();
      if (k) setKey(k);
      $("#keyInput").value = "";
    };
  }

  // ---------- Arranque ----------
  bind();
  renderCards();
  renderChats();
  renderMessages();
  renderAccount();
  renderPicker();
  finishLoginIfNeeded();
  loadModels();
})();
