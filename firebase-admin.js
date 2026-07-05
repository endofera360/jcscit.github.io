// ============================================================
// JCSC IT Club — Shared Firebase Admin System
// firebase-admin.js  (loaded as type="module" by all pages)
// ============================================================
// ─── Firebase config ────────────────────────────────────────
const FB_CFG = {
  apiKey:            "AIzaSyAeiQooAe8LRj7zp_h0GaUD46WHUrI7tc4",
  authDomain:        "jcscit.firebaseapp.com",
  projectId:         "jcscit",
  storageBucket:     "jcscit.firebasestorage.app",
  messagingSenderId: "253384399169",
  appId:             "1:253384399169:web:5cded88ff939564cec69c0",
  measurementId:     "G-M3W7GSCG5P"
};
// ─── State ──────────────────────────────────────────────────
let _db = null, _storage = null, _dbReady = false, _storageReady = false;
let _setDoc, _doc, _getDoc, _ref, _uploadBytes, _getURL;

export function isStorageReady() { return _storageReady; }
export function isDbReady() { return _dbReady; }

// ─── Timeout helper — prevents any hung network call from
//     freezing the UI forever. Firestore's default WebChannel
//     transport can be silently blocked by some ISPs/proxies,
//     which causes a promise that never resolves AND never
//     rejects. Racing it against a timer guarantees we always
//     get a result one way or the other. ─────────────────────
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms/1000}s — likely blocked by network/firewall`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// ─── Init ───────────────────────────────────────────────────
// Firestore and Storage are initialized independently so that
// a Storage problem (e.g. bucket not provisioned yet, billing
// not set up) never blocks Firestore-only actions like text
// edits and "Link" images from saving.
export async function initFirebase() {
  let app;
  try {
    const { initializeApp, getApps } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    app = getApps().length ? getApps()[0] : initializeApp(FB_CFG);
  } catch(e) {
    console.warn("Firebase app init failed:", e.message);
    return;
  }

  // Firestore — forces long-polling transport directly (skips
  // the auto-detect probe, saving a round trip). Long-polling
  // is confirmed working for this deployment: the channel
  // handshake succeeds, it just needs more time than WebSocket
  // would for the full listen→rules-check→data round trip.
export async function initFirebase() {
  try {
    // Dynamically import Firebase v9/v10 modules
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js");
    const { initializeFirestore, doc, setDoc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
    const { getStorage, ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js");

    // Initialize the app with your existing FB_CFG
    const app = initializeApp(FB_CFG);

    // 🔴 THE FIX: Force Long Polling to prevent Vercel/Netlify infinite hanging
    _db = initializeFirestore(app, {
      experimentalForceLongPolling: true 
    });
    
    _storage = getStorage(app);

    // Assign to your existing global state variables
    _setDoc = setDoc;
    _doc = doc;
    _getDoc = getDoc;
    _ref = ref;
    _uploadBytes = uploadBytes;
    _getURL = getDownloadURL;

    _dbReady = true;
    _storageReady = true;
    console.log("✅ Firebase Initialized (Long Polling Active)");
    
  } catch (error) {
    console.error("❌ Firebase init failed:", error);
  }
}

  // Storage — optional. Fine for this to fail if the user
  // hasn't provisioned/paid for Storage yet; Link-based images
  // and text edits don't need it at all.
  try {
    const { getStorage, ref, uploadBytes, getDownloadURL } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");
    _storage = getStorage(app);
    _ref = ref; _uploadBytes = uploadBytes; _getURL = getDownloadURL;
    _storageReady = true;
    console.log("✅ Storage ready");
  } catch(e) {
    console.warn("Storage not available (fine if you're only using Link uploads):", e.message);
  }

  if (_dbReady) await loadAndApplyContent();
}

// ─── Firestore: load & apply to DOM ─────────────────────────
export async function loadAndApplyContent() {
  if (!_dbReady) return;
  try {
    const snap = await withTimeout(
      _getDoc(_doc(_db, "site-content", "global")), 30000, "Load content"
    );
    if (!snap.exists()) return;
    const data = snap.data();

    // Apply text
    if (data.texts) {
      Object.entries(data.texts).forEach(([key, val]) => {
        document.querySelectorAll(`[data-editable="${key}"]`)
          .forEach(el => { el.textContent = val; });
      });
    }
    // Apply images (avatars, hero cover)
    if (data.images) {
      Object.entries(data.images).forEach(([key, url]) => {
        applyImage(key, url);
      });
    }
    // Apply hero cover
    if (data.heroCover) applyHeroCover(data.heroCover);

  } catch(e) { console.warn("Load error:", e.message); }
}

// ─── Apply a saved image URL to every matching element ───────
function applyImage(key, url) {
  // Regular img elements
  document.querySelectorAll(`img[data-img-editable="${key}"]`).forEach(img => {
    img.src = url;
    img.style.display = "block";
    const span = img.parentElement?.querySelector(".avatar-initials");
    if (span) span.style.display = "none";
  });
  // Panel-avatar wrapper divs (background fallback)
  document.querySelectorAll(`[data-img-editable="${key}"]`).forEach(wrap => {
    if (wrap.tagName === "IMG") return; // already handled
    const img = wrap.querySelector("img[data-img-editable]") ||
                wrap.querySelector("img");
    if (img) { img.src = url; img.style.display = "block"; }
    const span = wrap.querySelector(".avatar-initials");
    if (span) span.style.display = "none";
  });
}

// ─── Apply hero cover (image / gif / video URL) ─────────────
function applyHeroCover(data) {
  const hero = document.getElementById("hero");
  if (!hero) return;
  // Remove old cover
  hero.querySelectorAll(".hero-cover-media").forEach(el => el.remove());
  if (!data.url) return;

  if (data.type === "video") {
    const v = document.createElement("video");
    v.src = data.url; v.autoplay = true; v.muted = true;
    v.loop = true; v.playsInline = true;
    v.className = "hero-cover-media";
    v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;";
    hero.prepend(v);
  } else {
    const img = document.createElement("img");
    img.src = data.url; img.alt = "";
    img.className = "hero-cover-media";
    img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;";
    hero.prepend(img);
  }
}

// ─── Firestore: save ─────────────────────────────────────────
async function saveToFirebase(payload) {
  if (!_dbReady) { showToast("⚠ Firestore not connected", "error"); return false; }
  try {
    const ref2 = _doc(_db, "site-content", "global");
    let existing = {};
    try {
      const snap = await withTimeout(_getDoc(ref2), 30000, "Fetch existing data");
      if (snap.exists()) existing = snap.data();
    } catch(e) {
      console.warn("Couldn't fetch existing data (continuing with a fresh write):", e.message);
    }

    await withTimeout(_setDoc(ref2, {
      texts:     Object.assign({}, existing.texts     || {}, payload.texts     || {}),
      images:    Object.assign({}, existing.images    || {}, payload.images    || {}),
      heroCover: payload.heroCover !== undefined ? payload.heroCover : (existing.heroCover || null),
      updatedAt: new Date().toISOString()
    }), 30000, "Save to Firestore");
    return true;
  } catch(e) {
    console.error("Save error:", e);
    const msg = /timed out/.test(e.message)
      ? "⚠ Save timed out — check your network or Firestore rules"
      : "⚠ Save failed: " + e.message;
    showToast(msg, "error");
    return false;
  }
}

// ─── Storage: upload a File → URL ────────────────────────────
async function uploadFile(file, path, onProgress) {
  if (!_storageReady) throw new Error("Storage isn't set up yet — use the Link tab instead, or add Storage billing in Firebase");
  // Use XMLHttpRequest for progress — avoids resumable complexity
  return new Promise((resolve, reject) => {
    const storageRef = _ref(_storage, path);
    // Use simple uploadBytes (no resumable needed for <5MB images)
    _uploadBytes(storageRef, file).then(snap => {
      _getURL(snap.ref).then(resolve).catch(reject);
    }).catch(err => {
      // Fallback: try direct fetch upload
      reject(err);
    });
  });
}

// ─── Toast notification ──────────────────────────────────────
function showToast(msg, type = "success") {
  let t = document.getElementById("_admin_toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "_admin_toast";
    t.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(120px);
      padding:12px 28px;border-radius:6px;font-family:'Orbitron',sans-serif;font-size:0.75rem;
      font-weight:700;z-index:999999;transition:transform 0.4s ease;pointer-events:none;white-space:nowrap;`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = type === "error" ? "#c0392b" : "#00C896";
  t.style.color = type === "error" ? "#fff" : "#060D24";
  t.style.transform = "translateX(-50%) translateY(0)";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.transform = "translateX(-50%) translateY(120px)"; }, 3500);
}

// ─── Admin Panel ─────────────────────────────────────────────
const ADMIN_USER = "jcsc_admin";
const ADMIN_PASS = "itclub2025";

export function initAdminSystem() {
  injectAdminHTML();
  setupTripleClick();
}

function injectAdminHTML() {
  // Remove old elements if re-called
  ["_admin_modal","_admin_panel","_admin_toast"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  const style = document.createElement("style");
  style.textContent = `
    #_admin_modal{position:fixed;inset:0;background:rgba(6,13,36,0.96);backdrop-filter:blur(12px);
      z-index:100000;display:none;align-items:center;justify-content:center;}
    #_admin_modal.show{display:flex;}
    ._abox{background:#0F1B4A;border:1px solid rgba(0,200,150,0.4);border-radius:14px;
      padding:40px 36px;width:min(420px,92vw);text-align:center;
      box-shadow:0 0 60px rgba(0,200,150,0.15);}
    ._abox h2{font-family:'Orbitron',sans-serif;color:#F5C518;margin-bottom:6px;font-size:1.1rem;}
    ._abox p{font-size:0.72rem;color:#8BA8C4;margin-bottom:22px;font-family:'Share Tech Mono',monospace;letter-spacing:0.05em;}
    ._ainput{width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(0,200,150,0.3);
      color:#E8F4FD;padding:12px 16px;border-radius:6px;font-family:'Inter',sans-serif;
      font-size:0.9rem;margin-bottom:14px;outline:none;transition:border-color 0.3s;box-sizing:border-box;}
    ._ainput:focus{border-color:#00C896;}
    ._alogin{width:100%;background:linear-gradient(135deg,#00C896,#00A87A);color:#060D24;
      border:none;padding:13px;border-radius:6px;font-family:'Orbitron',sans-serif;
      font-size:0.82rem;font-weight:700;cursor:pointer;letter-spacing:0.08em;margin-bottom:10px;
      transition:all 0.3s;}
    ._alogin:hover{box-shadow:0 0 20px rgba(0,200,150,0.4);}
    ._acancel{background:none;border:none;color:#8BA8C4;cursor:pointer;font-size:0.82rem;transition:color 0.3s;}
    ._acancel:hover{color:#E8F4FD;}

    #_admin_panel{position:fixed;top:0;right:-390px;width:370px;height:100vh;
      background:rgba(6,13,36,0.99);border-left:1px solid rgba(0,200,150,0.25);
      z-index:99999;overflow-y:auto;transition:right 0.4s cubic-bezier(.4,0,.2,1);
      display:flex;flex-direction:column;}
    #_admin_panel.open{right:0;}
    ._aph{display:flex;justify-content:space-between;align-items:center;
      padding:18px 20px 14px;border-bottom:1px solid rgba(0,200,150,0.15);flex-shrink:0;}
    ._apht{font-family:'Orbitron',sans-serif;font-size:0.82rem;color:#F5C518;font-weight:700;}
    ._aclose{background:none;border:none;color:#8BA8C4;cursor:pointer;font-size:1.3rem;
      transition:color 0.3s;padding:0 4px;}
    ._aclose:hover{color:#00C896;}
    ._apbody{flex:1;overflow-y:auto;padding:16px 20px 24px;}
    ._sec-hdr{font-family:'Orbitron',sans-serif;font-size:0.68rem;color:#00C896;
      letter-spacing:0.15em;text-transform:uppercase;margin:20px 0 10px;
      padding-bottom:6px;border-bottom:1px solid rgba(0,200,150,0.12);}
    ._sec-hdr:first-child{margin-top:0;}
    ._erow{margin-bottom:14px;}
    ._elabel{display:block;font-size:0.68rem;color:#8BA8C4;margin-bottom:4px;
      font-family:'Share Tech Mono',monospace;letter-spacing:0.06em;}
    ._efield{width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(0,200,150,0.2);
      color:#E8F4FD;padding:8px 12px;border-radius:5px;font-family:'Inter',sans-serif;
      font-size:0.8rem;outline:none;transition:border-color 0.3s;resize:vertical;
      box-sizing:border-box;}
    ._efield:focus{border-color:#00C896;}

    /* Image editor row */
    ._imgrow{border:1px solid rgba(0,200,150,0.15);border-radius:8px;padding:12px;
      margin-bottom:14px;background:rgba(0,200,150,0.02);}
    ._imgpreview{width:60px;height:60px;border-radius:50%;object-fit:cover;
      border:2px solid rgba(0,200,150,0.4);display:block;margin-bottom:8px;
      background:#0F1B4A;}
    ._imgpreview-rect{width:100%;height:80px;border-radius:6px;object-fit:cover;
      border:2px solid rgba(0,200,150,0.4);display:block;margin-bottom:8px;
      background:#0F1B4A;}
    ._imgtabs{display:flex;gap:6px;margin-bottom:10px;}
    ._imgtab{flex:1;padding:6px 4px;border-radius:4px;border:1px solid rgba(0,200,150,0.2);
      background:transparent;color:#8BA8C4;font-family:'Share Tech Mono',monospace;
      font-size:0.65rem;cursor:pointer;transition:all 0.25s;text-align:center;}
    ._imgtab.active{background:rgba(0,200,150,0.12);border-color:#00C896;color:#00C896;}
    ._upload-zone{border:2px dashed rgba(0,200,150,0.3);border-radius:6px;padding:14px;
      text-align:center;cursor:pointer;transition:all 0.3s;background:rgba(0,200,150,0.03);}
    ._upload-zone:hover,._upload-zone.drag{border-color:#00C896;background:rgba(0,200,150,0.08);}
    ._upload-zone span{display:block;font-size:0.72rem;color:#8BA8C4;
      font-family:'Share Tech Mono',monospace;}
    ._upload-zone em{font-size:1.6rem;display:block;margin-bottom:6px;}
    ._link-input{width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(0,200,150,0.2);
      color:#E8F4FD;padding:8px 10px;border-radius:5px;font-family:'Inter',sans-serif;
      font-size:0.78rem;outline:none;transition:border-color 0.3s;box-sizing:border-box;}
    ._link-input:focus{border-color:#00C896;}
    ._link-btn{margin-top:7px;width:100%;background:rgba(0,200,150,0.1);
      border:1px solid rgba(0,200,150,0.3);color:#00C896;padding:7px;border-radius:4px;
      font-family:'Share Tech Mono',monospace;font-size:0.7rem;cursor:pointer;transition:all 0.25s;}
    ._link-btn:hover{background:rgba(0,200,150,0.2);}
    ._img-status{font-size:0.68rem;margin-top:6px;min-height:14px;
      font-family:'Share Tech Mono',monospace;}

    /* Cover media row */
    ._cover-preview{width:100%;height:90px;border-radius:6px;object-fit:cover;
      display:block;margin-bottom:8px;background:#0A1230;border:1px solid rgba(0,200,150,0.2);}
    ._cover-video{width:100%;height:90px;border-radius:6px;object-fit:cover;
      display:block;margin-bottom:8px;}
    ._cover-remove{width:100%;background:rgba(192,57,43,0.1);border:1px solid rgba(192,57,43,0.3);
      color:#e74c3c;padding:7px;border-radius:4px;font-family:'Share Tech Mono',monospace;
      font-size:0.7rem;cursor:pointer;transition:all 0.25s;margin-top:6px;}
    ._cover-remove:hover{background:rgba(192,57,43,0.25);}

    /* Save bar */
    ._savebar{padding:14px 20px;border-top:1px solid rgba(0,200,150,0.15);flex-shrink:0;}
    ._savebtn{width:100%;background:linear-gradient(135deg,#F5C518,#C9A227);color:#060D24;
      border:none;padding:13px;border-radius:6px;font-family:'Orbitron',sans-serif;
      font-size:0.82rem;font-weight:800;cursor:pointer;letter-spacing:0.08em;transition:all 0.3s;}
    ._savebtn:hover{box-shadow:0 0 20px rgba(245,197,24,0.35);}
    ._savebtn:disabled{opacity:0.6;cursor:not-allowed;}

    /* Admin mode highlight */
    body.admin-mode [data-editable]{outline:1px dashed rgba(245,197,24,0.35);cursor:pointer;}
    body.admin-mode [data-editable]:hover{outline-color:#F5C518;background:rgba(245,197,24,0.04);}
    body.admin-mode [data-img-editable]{outline:2px dashed rgba(0,200,150,0.4);cursor:pointer;position:relative;}
    body.admin-mode [data-img-editable]:hover{outline-color:#00C896;}

    @media(max-width:480px){
      #_admin_panel{width:100%;right:-100%;}
      #_admin_panel.open{right:0;}
    }
  `;
  document.head.appendChild(style);

  // Login modal
  const modal = document.createElement("div");
  modal.id = "_admin_modal";
  modal.innerHTML = `
    <div class="_abox">
      <h2>⚙ ADMIN ACCESS</h2>
      <p>JCSC IT CLUB COMMAND CENTER</p>
      <input type="text" id="_auser" class="_ainput" placeholder="Username" autocomplete="off"
        onkeydown="if(event.key==='Enter')document.getElementById('_apass').focus()">
      <input type="password" id="_apass" class="_ainput" placeholder="Password"
        onkeydown="if(event.key==='Enter')window._adminLogin()">
      <button class="_alogin" onclick="window._adminLogin()">ENTER COMMAND CENTER</button>
      <button class="_acancel" onclick="document.getElementById('_admin_modal').classList.remove('show')">✕ Cancel</button>
    </div>`;
  document.body.appendChild(modal);

  // Side panel
  const panel = document.createElement("div");
  panel.id = "_admin_panel";
  panel.innerHTML = `
    <div class="_aph">
      <div class="_apht">⚙ CONTENT EDITOR</div>
      <button class="_aclose" onclick="window._closeAdmin()">✕</button>
    </div>
    <div class="_apbody" id="_apbody"></div>
    <div class="_savebar">
      <button class="_savebtn" id="_savebtn" onclick="window._saveAll()">💾 SAVE ALL CHANGES</button>
    </div>`;
  document.body.appendChild(panel);

  // Global functions
  window._adminLogin = adminLogin;
  window._closeAdmin = closeAdmin;
  window._saveAll   = saveAll;
}

function setupTripleClick() {
  let count = 0, timer = null;
  // Secret trigger: footer copyright text
  document.addEventListener("click", (e) => {
    const t = e.target.closest("#secret-trigger");
    if (!t) return;
    count++;
    clearTimeout(timer);
    timer = setTimeout(() => { count = 0; }, 900);
    if (count >= 3) {
      count = 0;
      document.getElementById("_admin_modal").classList.add("show");
    }
  });
}

function adminLogin() {
  const u = document.getElementById("_auser").value.trim();
  const p = document.getElementById("_apass").value;
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    document.getElementById("_admin_modal").classList.remove("show");
    document.getElementById("_auser").value = "";
    document.getElementById("_apass").value = "";
    openAdmin();
  } else {
    const box = document.querySelector("._abox");
    box.style.borderColor = "#e74c3c";
    setTimeout(() => { box.style.borderColor = ""; }, 900);
    showToast("⚠ Wrong credentials", "error");
  }
}

function openAdmin() {
  document.getElementById("_admin_panel").classList.add("open");
  document.body.classList.add("admin-mode");
  buildPanel();
}

function closeAdmin() {
  document.getElementById("_admin_panel").classList.remove("open");
  document.body.classList.remove("admin-mode");
}

// ─── Build panel content ─────────────────────────────────────
function buildPanel() {
  const body = document.getElementById("_apbody");
  if (!body) return;
  body.innerHTML = "";

  // ── Hero Cover section (index only) ──────────────────────
  const hero = document.getElementById("hero");
  if (hero) {
    body.appendChild(buildCoverSection());
  }

  // ── Text fields ───────────────────────────────────────────
  const textEls = document.querySelectorAll("[data-editable]");
  if (textEls.length) {
    const hdr = document.createElement("div");
    hdr.className = "_sec-hdr"; hdr.textContent = "📝 Text Content";
    body.appendChild(hdr);
    textEls.forEach(el => {
      body.appendChild(buildTextField(el.dataset.editable, el.textContent.trim()));
    });
  }

  // ── Image fields ──────────────────────────────────────────
  const imgKeys = new Set();
  document.querySelectorAll("[data-img-editable]").forEach(el => {
    imgKeys.add(el.dataset.imgEditable);
  });
  if (imgKeys.size) {
    const hdr = document.createElement("div");
    hdr.className = "_sec-hdr"; hdr.textContent = "🖼 Images & Avatars";
    body.appendChild(hdr);
    imgKeys.forEach(key => {
      const previewEl = document.querySelector(`img[data-img-editable="${key}"]`);
      const curSrc = previewEl && !previewEl.src.startsWith("data:image/jpeg;base64,/9j/4AAQ") 
                     ? previewEl.src : "";
      body.appendChild(buildImageField(key, curSrc, "circle"));
    });
  }

  // Click-to-focus: text
  document.querySelectorAll("[data-editable]").forEach(el => {
    el.onclick = () => {
      const field = body.querySelector(`textarea[data-target="${el.dataset.editable}"]`);
      if (field) {
        openAdmin();
        document.getElementById("_admin_panel").classList.add("open");
        field.scrollIntoView({ behavior:"smooth", block:"center" });
        field.focus(); field.select();
      }
    };
  });

  // Click-to-focus: images
  document.querySelectorAll("[data-img-editable]").forEach(el => {
    el.onclick = () => {
      const key = el.dataset.imgEditable;
      const zone = body.querySelector(`[data-upload-key="${key}"] ._upload-zone`);
      if (zone) {
        document.getElementById("_admin_panel").classList.add("open");
        zone.scrollIntoView({ behavior:"smooth", block:"center" });
      }
    };
  });
}

// ─── Build a text field row ───────────────────────────────────
function buildTextField(key, value) {
  const row = document.createElement("div");
  row.className = "_erow";
  const label = document.createElement("label");
  label.className = "_elabel";
  label.textContent = key.replace(/-/g," ").toUpperCase();
  const ta = document.createElement("textarea");
  ta.className = "_efield";
  ta.dataset.target = key;
  ta.rows = 2;
  ta.value = value;
  // Live preview
  ta.addEventListener("input", () => {
    document.querySelectorAll(`[data-editable="${key}"]`)
      .forEach(el => { el.textContent = ta.value; });
  });
  row.appendChild(label);
  row.appendChild(ta);
  return row;
}

// ─── Build an image field row (tabs: Upload / Link) ───────────
function buildImageField(key, currentSrc, shape = "circle") {
  const wrap = document.createElement("div");
  wrap.className = "_imgrow";
  wrap.dataset.uploadKey = key;

  const label = document.createElement("div");
  label.className = "_elabel";
  label.textContent = key.replace(/-/g," ").toUpperCase();
  label.style.marginBottom = "8px";
  wrap.appendChild(label);

  if (!_storageReady) {
    const warn = document.createElement("div");
    warn.style.cssText = "font-size:0.66rem;color:#F5C518;background:rgba(245,197,24,0.08);border:1px solid rgba(245,197,24,0.25);border-radius:4px;padding:6px 8px;margin-bottom:8px;font-family:'Share Tech Mono',monospace;";
    warn.textContent = "⚠ Storage not set up — use Link instead of Upload for now";
    wrap.appendChild(warn);
  }

  // Preview
  const preview = document.createElement("img");
  preview.className = shape === "circle" ? "_imgpreview" : "_imgpreview-rect";
  preview.src = currentSrc || "";
  preview.onerror = () => { preview.style.opacity = "0.3"; };
  if (!currentSrc) preview.style.opacity = "0.3";
  wrap.appendChild(preview);

  // Tabs
  const tabs = document.createElement("div");
  tabs.className = "_imgtabs";
  const tabUpload = document.createElement("button");
  tabUpload.className = "_imgtab active"; tabUpload.textContent = "📁 Upload";
  const tabLink = document.createElement("button");
  tabLink.className = "_imgtab"; tabLink.textContent = "🔗 Link";
  tabs.appendChild(tabUpload); tabs.appendChild(tabLink);
  wrap.appendChild(tabs);

  // Upload pane
  const uploadPane = document.createElement("div");
  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = "image/jpeg,image/png,image/webp,image/gif";
  fileInput.style.display = "none";

  const zone = document.createElement("div");
  zone.className = "_upload-zone";
  zone.innerHTML = `<em>📂</em><span>Click or drag image here</span><span style="font-size:0.62rem;margin-top:3px;">(JPEG/PNG/WEBP/GIF · max 5MB)</span>`;
  zone.onclick = () => fileInput.click();
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("drag"); };
  zone.ondragleave = () => zone.classList.remove("drag");
  zone.ondrop = (e) => {
    e.preventDefault(); zone.classList.remove("drag");
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file, key, preview, status);
  };
  fileInput.onchange = () => {
    if (fileInput.files[0]) handleFileUpload(fileInput.files[0], key, preview, status);
  };
  uploadPane.appendChild(fileInput);
  uploadPane.appendChild(zone);

  // Link pane
  const linkPane = document.createElement("div");
  linkPane.style.display = "none";
  const linkInput = document.createElement("input");
  linkInput.type = "url"; linkInput.className = "_link-input";
  linkInput.placeholder = "Paste image URL (Drive, ImgBB, etc.)";
  linkInput.value = currentSrc || "";
  const linkBtn = document.createElement("button");
  linkBtn.className = "_link-btn"; linkBtn.textContent = "✓ Apply Link";
  linkBtn.onclick = () => {
    const url = linkInput.value.trim();
    if (!url) { showToast("⚠ Enter a URL", "error"); return; }
    // Convert Google Drive share link to direct link
    const converted = convertDriveLink(url);
    applyImageLocally(key, converted, preview);
    status.textContent = "✓ Link applied — save to persist";
    status.style.color = "#00C896";
    // Store for save
    _pendingImages[key] = { type:"url", url: converted };
  };
  linkPane.appendChild(linkInput);
  linkPane.appendChild(linkBtn);

  wrap.appendChild(uploadPane);
  wrap.appendChild(linkPane);

  const status = document.createElement("div");
  status.className = "_img-status";
  status.style.color = "#8BA8C4";
  wrap.appendChild(status);

  // Tab switching
  tabUpload.onclick = () => {
    tabUpload.classList.add("active"); tabLink.classList.remove("active");
    uploadPane.style.display = ""; linkPane.style.display = "none";
  };
  tabLink.onclick = () => {
    tabLink.classList.add("active"); tabUpload.classList.remove("active");
    uploadPane.style.display = "none"; linkPane.style.display = "";
  };

  return wrap;
}

// ─── Build hero cover section ────────────────────────────────
function buildCoverSection() {
  const wrap = document.createElement("div");

  const hdr = document.createElement("div");
  hdr.className = "_sec-hdr"; hdr.textContent = "🎬 Hero Cover (Image/GIF/Video)";
  wrap.appendChild(hdr);

  if (!_storageReady) {
    const warn = document.createElement("div");
    warn.style.cssText = "font-size:0.66rem;color:#F5C518;background:rgba(245,197,24,0.08);border:1px solid rgba(245,197,24,0.25);border-radius:4px;padding:6px 8px;margin-bottom:10px;font-family:'Share Tech Mono',monospace;";
    warn.textContent = "⚠ Storage not set up — use Link instead of Upload for now";
    wrap.appendChild(warn);
  }

  const row = document.createElement("div");
  row.className = "_imgrow";

  // Current cover preview
  const coverPreviewWrap = document.createElement("div");
  coverPreviewWrap.id = "_cover_preview_wrap";
  const existingCover = document.querySelector("#hero .hero-cover-media");
  if (existingCover) {
    if (existingCover.tagName === "VIDEO") {
      const vp = document.createElement("video");
      vp.src = existingCover.src; vp.className = "_cover-video";
      vp.muted = true; vp.autoplay = true; vp.loop = true; vp.playsInline = true;
      coverPreviewWrap.appendChild(vp);
    } else {
      const ip = document.createElement("img");
      ip.src = existingCover.src; ip.className = "_cover-preview";
      coverPreviewWrap.appendChild(ip);
    }
  } else {
    const placeholder = document.createElement("div");
    placeholder.style.cssText = "width:100%;height:80px;border-radius:6px;background:#0A1230;border:1px dashed rgba(0,200,150,0.2);display:flex;align-items:center;justify-content:center;font-size:0.72rem;color:#8BA8C4;font-family:'Share Tech Mono',monospace;margin-bottom:8px;";
    placeholder.textContent = "No cover set";
    coverPreviewWrap.appendChild(placeholder);
  }
  row.appendChild(coverPreviewWrap);

  // Tabs: Upload / Link / Remove
  const tabs = document.createElement("div");
  tabs.className = "_imgtabs";
  const t1 = document.createElement("button"); t1.className="_imgtab active"; t1.textContent="📁 Upload";
  const t2 = document.createElement("button"); t2.className="_imgtab"; t2.textContent="🔗 Link";
  const t3 = document.createElement("button"); t3.className="_imgtab"; t3.textContent="🗑 Remove";
  tabs.append(t1,t2,t3);
  row.appendChild(tabs);

  // Upload pane
  const upPane = document.createElement("div");
  const coverFileInput = document.createElement("input");
  coverFileInput.type = "file";
  coverFileInput.accept = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";
  coverFileInput.style.display = "none";
  const coverZone = document.createElement("div");
  coverZone.className = "_upload-zone";
  coverZone.innerHTML = `<em>🎬</em><span>Click or drag media</span><span style="font-size:0.62rem;margin-top:3px;">Image/GIF/MP4/WebM · max 20MB</span>`;
  coverZone.onclick = () => coverFileInput.click();
  coverZone.ondragover = (e) => { e.preventDefault(); coverZone.classList.add("drag"); };
  coverZone.ondragleave = () => coverZone.classList.remove("drag");
  coverZone.ondrop = (e) => {
    e.preventDefault(); coverZone.classList.remove("drag");
    const file = e.dataTransfer.files[0];
    if (file) handleCoverUpload(file, coverStatus, coverPreviewWrap);
  };
  coverFileInput.onchange = () => {
    if (coverFileInput.files[0]) handleCoverUpload(coverFileInput.files[0], coverStatus, coverPreviewWrap);
  };
  upPane.appendChild(coverFileInput);
  upPane.appendChild(coverZone);

  // Link pane
  const linkPane = document.createElement("div");
  linkPane.style.display = "none";
  const coverLinkInput = document.createElement("input");
  coverLinkInput.type = "url"; coverLinkInput.className = "_link-input";
  coverLinkInput.placeholder = "Paste direct image/GIF/video URL";
  const coverLinkBtn = document.createElement("button");
  coverLinkBtn.className = "_link-btn"; coverLinkBtn.textContent = "✓ Apply Cover Link";
  coverLinkBtn.onclick = () => {
    const url = convertDriveLink(coverLinkInput.value.trim());
    if (!url) { showToast("⚠ Enter a URL","error"); return; }
    const isVideo = /\.(mp4|webm|ogg)(\?|$)/i.test(url);
    _pendingCover = { url, type: isVideo ? "video" : "image" };
    applyHeroCover(_pendingCover);
    updateCoverPreview(coverPreviewWrap, _pendingCover);
    coverStatus.textContent = "✓ Cover applied — save to persist";
    coverStatus.style.color = "#00C896";
  };
  linkPane.appendChild(coverLinkInput);
  linkPane.appendChild(coverLinkBtn);

  row.appendChild(upPane);
  row.appendChild(linkPane);

  const coverStatus = document.createElement("div");
  coverStatus.className = "_img-status"; coverStatus.style.color = "#8BA8C4";
  row.appendChild(coverStatus);

  // Remove button pane (hidden by default, shown on tab 3)
  const removePane = document.createElement("div");
  removePane.style.display = "none";
  const removeBtn = document.createElement("button");
  removeBtn.className = "_cover-remove"; removeBtn.textContent = "🗑 Remove Cover Media";
  removeBtn.onclick = () => {
    _pendingCover = { url: null, type: null };
    applyHeroCover(_pendingCover);
    updateCoverPreview(coverPreviewWrap, null);
    coverStatus.textContent = "Cover removed — save to persist";
    coverStatus.style.color = "#e74c3c";
  };
  removePane.appendChild(removeBtn);
  row.appendChild(removePane);

  // Tab logic
  t1.onclick = () => { t1.classList.add("active"); t2.classList.remove("active"); t3.classList.remove("active"); upPane.style.display=""; linkPane.style.display="none"; removePane.style.display="none"; };
  t2.onclick = () => { t2.classList.add("active"); t1.classList.remove("active"); t3.classList.remove("active"); upPane.style.display="none"; linkPane.style.display=""; removePane.style.display="none"; };
  t3.onclick = () => { t3.classList.add("active"); t1.classList.remove("active"); t2.classList.remove("active"); upPane.style.display="none"; linkPane.style.display="none"; removePane.style.display=""; };

  wrap.appendChild(row);
  return wrap;
}

function updateCoverPreview(wrap, data) {
  wrap.innerHTML = "";
  if (!data || !data.url) {
    const p = document.createElement("div");
    p.style.cssText = "width:100%;height:80px;border-radius:6px;background:#0A1230;border:1px dashed rgba(0,200,150,0.2);display:flex;align-items:center;justify-content:center;font-size:0.72rem;color:#8BA8C4;font-family:'Share Tech Mono',monospace;margin-bottom:8px;";
    p.textContent = "No cover set"; wrap.appendChild(p); return;
  }
  if (data.type === "video") {
    const v = document.createElement("video");
    v.src = data.url; v.className = "_cover-video"; v.muted=true; v.autoplay=true; v.loop=true; v.playsInline=true;
    wrap.appendChild(v);
  } else {
    const i = document.createElement("img");
    i.src = data.url; i.className = "_cover-preview";
    wrap.appendChild(i);
  }
}

// ─── Pending changes (for save) ──────────────────────────────
let _pendingImages = {};   // key → { type:"file"|"url", file?, url? }
let _pendingCover  = undefined; // undefined = not changed

function handleFileUpload(file, key, preview, status) {
  if (file.size > 5 * 1024 * 1024) {
    showToast("⚠ Max 5MB per image", "error"); return;
  }
  status.textContent = "⏳ Reading file..."; status.style.color = "#F5C518";
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    applyImageLocally(key, dataUrl, preview);
    _pendingImages[key] = { type:"file", file, dataUrl };
    status.textContent = "✓ Selected — save to upload";
    status.style.color = "#00C896";
    preview.style.opacity = "1";
  };
  reader.readAsDataURL(file);
}

function handleCoverUpload(file, status, previewWrap) {
  const maxSize = 20 * 1024 * 1024;
  if (file.size > maxSize) { showToast("⚠ Max 20MB for cover", "error"); return; }
  status.textContent = "⏳ Reading..."; status.style.color = "#F5C518";
  const reader = new FileReader();
  reader.onload = (e) => {
    const isVideo = file.type.startsWith("video/");
    _pendingCover = { type: isVideo ? "video" : "image", file, dataUrl: e.target.result };
    applyHeroCover({ url: e.target.result, type: _pendingCover.type });
    updateCoverPreview(previewWrap, { url: e.target.result, type: _pendingCover.type });
    status.textContent = "✓ Selected — save to upload";
    status.style.color = "#00C896";
  };
  reader.readAsDataURL(file);
}

function applyImageLocally(key, src, previewEl) {
  if (previewEl) { previewEl.src = src; previewEl.style.opacity = "1"; }
  document.querySelectorAll(`img[data-img-editable="${key}"]`).forEach(img => {
    img.src = src; img.style.display = "block";
    const span = img.parentElement?.querySelector(".avatar-initials");
    if (span) span.style.display = "none";
  });
  document.querySelectorAll(`[data-img-editable="${key}"]`).forEach(wrap => {
    if (wrap.tagName === "IMG") return;
    const img = wrap.querySelector("img");
    if (img) { img.src = src; img.style.display = "block"; }
    const span = wrap.querySelector(".avatar-initials");
    if (span) span.style.display = "none";
  });
}

// ─── Convert Google Drive / ImgBB share URLs to direct ───────
function convertDriveLink(url) {
  // Google Drive: /file/d/FILE_ID/view → direct
  const driveMatch = url.match(/\/file\/d\/([^\/]+)/);
  if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  // ImgBB: already direct usually
  return url;
}

// ─── Save all changes ─────────────────────────────────────────
async function saveAll() {
  const btn = document.getElementById("_savebtn");
  btn.disabled = true; btn.textContent = "⏳ SAVING...";

  // The whole function is wrapped in try/finally so the button
  // is GUARANTEED to reset even if something throws or a
  // network call hangs — this is what was missing before and
  // caused the button to freeze on "SAVING TO FIREBASE...".
  try {
    const texts = {};
    document.querySelectorAll("#_apbody textarea[data-target]").forEach(ta => {
      texts[ta.dataset.target] = ta.value;
    });

    const images = {};
    for (const [key, pending] of Object.entries(_pendingImages)) {
      if (pending.type === "url") {
        images[key] = pending.url;
        continue;
      }
      if (_storageReady) {
        btn.textContent = `⬆ UPLOADING ${key}...`;
        try {
          const path = `site-images/${key}_${Date.now()}.${pending.file.name.split(".").pop()}`;
          const url = await withTimeout(uploadFile(pending.file, path), 20000, `Upload ${key}`);
          images[key] = url;
          applyImageLocally(key, url, null);
        } catch(e) {
          console.error("Upload failed for", key, e);
          showToast(`⚠ ${key} upload failed — Storage not set up yet?`, "error");
        }
      } else if (pending.dataUrl) {
        images[key] = pending.dataUrl;
      }
    }

    let heroCover = undefined;
    if (_pendingCover !== undefined) {
      if (_pendingCover === null || !_pendingCover.url) {
        heroCover = null;
      } else if (_pendingCover.file && _storageReady) {
        btn.textContent = "⬆ UPLOADING COVER...";
        try {
          const ext = _pendingCover.file.name.split(".").pop();
          const path = `site-images/hero-cover_${Date.now()}.${ext}`;
          const url = await withTimeout(uploadFile(_pendingCover.file, path), 20000, "Upload cover");
          heroCover = { url, type: _pendingCover.type };
          applyHeroCover(heroCover);
        } catch(e) {
          showToast("⚠ Cover upload failed — Storage not set up yet?", "error");
        }
      } else if (_pendingCover.file && !_storageReady) {
        heroCover = { url: _pendingCover.dataUrl, type: _pendingCover.type };
      } else {
        heroCover = { url: _pendingCover.url || _pendingCover.dataUrl, type: _pendingCover.type };
      }
    }

    btn.textContent = "💾 SAVING TO FIREBASE...";
    const slowNotice = setTimeout(() => {
      btn.textContent = "💾 STILL SAVING — SLOW CONNECTION, PLEASE WAIT...";
    }, 6000);
    const ok = await saveToFirebase({ texts, images, heroCover });
    clearTimeout(slowNotice);

    _pendingImages = {};
    _pendingCover  = undefined;

    if (ok) showToast("✓ All changes saved!");
  } catch(e) {
    console.error("Unexpected save error:", e);
    showToast("⚠ Something went wrong — check browser console (F12)", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 SAVE ALL CHANGES";
  }
}
