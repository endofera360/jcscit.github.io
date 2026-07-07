// ============================================================
// JCSC IT Club — Shared Firebase Admin System (Enhanced & Fixed)
// firebase-admin.js  (loaded as type="module" by all pages)
// ============================================================

const FB_CFG = {
  apiKey:            "AIzaSyAeiQooAe8LRj7zp_h0GaUD46WHUrI7tc4",
  authDomain:        "jcscit.firebaseapp.com",
  projectId:         "jcscit",
  storageBucket:     "jcscit.firebasestorage.app",
  messagingSenderId: "253384399169",
  appId:             "1:253384399169:web:5cded88ff939564cec69c0",
  measurementId:     "G-M3W7GSCG5P"
};

let _db = null, _storage = null, _dbReady = false, _storageReady = false;
let _auth = null, _user = null; // Added auth state
let _setDoc, _doc, _getDoc, _ref, _uploadBytes, _getURL;
let _pendingImages = {};   // key → { type:"file"|"url", file?, url? }
let _pendingCover  = undefined; // undefined = not changed
let _pendingFAQs   = [];   // holds current dynamic FAQ array

export function isStorageReady() { return _storageReady; }
export function isDbReady() { return _dbReady; }

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

export async function initFirebase() {
  initThemeToggle(); // Initialize Theme Toggle immediately so UI doesn't block

  try {
    console.log("🔄 Starting Firebase Connection...");

    // 1. Core Init
    const { initializeApp, getApps, getApp } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js");
    const app = getApps().length === 0 ? initializeApp(FB_CFG) : getApp();

    // 2. Auth Init (Secure Login & System Rule Compliance)
    const { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
    _auth = getAuth(app);
    
    onAuthStateChanged(_auth, (user) => {
      _user = user;
      if (user && user.email) console.log("🔐 Admin Authenticated:", user.email);
    });

    try {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(_auth, __initial_auth_token);
      } else {
        await signInAnonymously(_auth);
      }
    } catch (authErr) {
      console.warn("⚠ Initial viewer auth skipped. Admin login will still work.");
    }

    // 3. Firestore Init
    const { getFirestore, doc, setDoc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    
    _db = getFirestore(app);
    
    _setDoc = setDoc;
    _doc = doc;
    _getDoc = getDoc;
    _dbReady = true;
    console.log("✅ Database Connection Succeeded!");

    // 4. Storage Fallback
    try {
      const { getStorage, ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js");
      _storage = getStorage(app);
      _ref = ref;
      _uploadBytes = uploadBytes;
      _getURL = getDownloadURL;
      _storageReady = true;
      console.log("✅ Storage is Ready!");
    } catch (storageError) {
      console.warn("⚠ Storage skipped: Link uploads will be used for assets.");
    }

    // Apply saved Firestore content to DOM
    await loadAndApplyContent();

  } catch (error) {
    console.error("❌ Firebase initialization failed:", error);
    harvestDefaultFAQs();
  }
}

export async function loadAndApplyContent() {
  if (!_dbReady) return;
  if (!_user) {
    harvestDefaultFAQs();
    return;
  }
  try {
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'jcscit';
    const docRef = _doc(_db, 'artifacts', appId, 'public', 'data', 'site-content');
    
    const snap = await withTimeout(
      _getDoc(docRef), 5000, "Load content"
    );
    if (!snap.exists()) {
      // Extract default FAQs from DOM if database is fresh
      harvestDefaultFAQs();
      return;
    }
    const data = snap.data();

    // Apply text edits
    if (data.texts) {
      Object.entries(data.texts).forEach(([key, val]) => {
        document.querySelectorAll(`[data-editable="${key}"]`)
          .forEach(el => { el.textContent = val; });
      });
    }
    // Apply images & avatars
    if (data.images) {
      Object.entries(data.images).forEach(([key, url]) => {
        applyImage(key, url);
      });
    }
    // Apply hero cover
    if (data.heroCover) applyHeroCover(data.heroCover);

    // Apply FAQs dynamically if available
    if (data.faqs) {
      _pendingFAQs = data.faqs;
      renderDynamicFAQs(data.faqs);
    } else {
      harvestDefaultFAQs();
    }

  } catch(e) { 
    console.warn("Load error:", e.message); 
    harvestDefaultFAQs();
  }
}

function harvestDefaultFAQs() {
  const container = document.getElementById("faq-container") || document.getElementById("faq-list");
  if (!container || _pendingFAQs.length > 0) return;

  const faqItems = container.querySelectorAll(".faq-item");
  if (faqItems.length > 0) {
    _pendingFAQs = Array.from(faqItems).map(item => {
      const q = item.querySelector(".faq-question")?.textContent.replace(/▼|▲/g, "").trim() || "Question";
      const a = item.querySelector(".faq-answer p")?.textContent.trim() || "Answer";
      return { q, a };
    });
    renderDynamicFAQs(_pendingFAQs);
  }
}

function renderDynamicFAQs(faqs) {
  const container = document.getElementById("faq-container") || document.getElementById("faq-list");
  if (!container) return;
  container.innerHTML = "";

  faqs.forEach((faq, index) => {
    const item = document.createElement("div");
    item.className = "faq-item reveal visible";
    item.style.transitionDelay = `${index * 50}ms`;
    item.innerHTML = `
      <div class="faq-question" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:18px 24px; font-family:'Orbitron',sans-serif; font-size:0.9rem; font-weight:700; color:var(--text-primary);">
        <span>${faq.q}</span>
        <span class="faq-toggle-icon" style="color:var(--emerald); transition: transform 0.3s;">▼</span>
      </div>
      <div class="faq-answer" style="max-height: 0; overflow: hidden; transition: max-height 0.4s cubic-bezier(0, 1, 0, 1); padding: 0 24px;">
        <p style="padding-bottom:18px; color:var(--text-secondary); line-height:1.6; font-size:0.85rem;">${faq.a}</p>
      </div>
    `;

    const qElement = item.querySelector(".faq-question");
    qElement.addEventListener("click", () => {
      const ans = item.querySelector(".faq-answer");
      const icon = item.querySelector(".faq-toggle-icon");
      const isOpen = ans.style.maxHeight !== "0px" && ans.style.maxHeight !== "";
      
      // Close all other FAQ items for a clean accordion effect
      container.querySelectorAll(".faq-answer").forEach(el => el.style.maxHeight = "0");
      container.querySelectorAll(".faq-toggle-icon").forEach(el => el.style.transform = "rotate(0deg)");

      if (!isOpen) {
        ans.style.maxHeight = "500px";
        icon.style.transform = "rotate(180deg)";
      } else {
        ans.style.maxHeight = "0";
        icon.style.transform = "rotate(0deg)";
      }
    });

    container.appendChild(item);
  });
}

function applyImage(key, url) {
  document.querySelectorAll(`img[data-img-editable="${key}"]`).forEach(img => {
    img.src = url;
    img.style.display = "block";
    const span = img.parentElement?.querySelector(".avatar-initials");
    if (span) span.style.display = "none";
  });
  document.querySelectorAll(`[data-img-editable="${key}"]`).forEach(wrap => {
    if (wrap.tagName === "IMG") return; 
    const img = wrap.querySelector("img[data-img-editable]") || wrap.querySelector("img");
    if (img) { img.src = url; img.style.display = "block"; }
    const span = wrap.querySelector(".avatar-initials");
    if (span) span.style.display = "none";
  });
}

function applyHeroCover(data) {
  const hero = document.getElementById("hero") || document.querySelector(".page-hero") || document.querySelector(".hero-section");
  if (!hero) return;
  
  hero.querySelectorAll(".hero-cover-media").forEach(el => el.remove());
  if (!data || !data.url) return;

  const mediaStyle = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none;";

  if (data.type === "video") {
    const v = document.createElement("video");
    v.src = data.url; v.autoplay = true; v.muted = true;
    v.loop = true; v.playsInline = true;
    v.className = "hero-cover-media";
    v.style.cssText = mediaStyle;
    hero.prepend(v);
  } else {
    const img = document.createElement("img");
    img.src = data.url; img.alt = "";
    img.className = "hero-cover-media";
    img.style.cssText = mediaStyle;
    hero.prepend(img);
  }
}

async function saveToFirebase(payload) {
  if (!_dbReady) { showToast("⚠ Database not connected", "error"); return false; }
  if (!_user || _user.isAnonymous) { showToast("⚠ Access Denied: Admin Login Required", "error"); return false; }
  try {
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'jcscit';
    const ref2 = _doc(_db, 'artifacts', appId, 'public', 'data', 'site-content');
    let existing = {};
    try {
      const snap = await withTimeout(_getDoc(ref2), 10000, "Fetch existing data");
      if (snap.exists()) existing = snap.data();
    } catch(e) {
      console.warn("Continuing with clean document write...", e.message);
    }

    await withTimeout(_setDoc(ref2, {
      texts:     Object.assign({}, existing.texts     || {}, payload.texts     || {}),
      images:    Object.assign({}, existing.images    || {}, payload.images    || {}),
      heroCover: payload.heroCover !== undefined ? payload.heroCover : (existing.heroCover || null),
      faqs:      payload.faqs !== undefined ? payload.faqs : (existing.faqs || []),
      updatedAt: new Date().toISOString()
    }), 30000, "Save to Firestore");
    return true;
  } catch(e) {
    console.error("Save error:", e);
    const msg = /timed out/.test(e.message)
      ? "⚠ Save timed out — check connection or Firestore rules"
      : "⚠ Save failed: " + e.message;
    showToast(msg, "error");
    return false;
  }
}

async function uploadFile(file, path) {
  if (!_storageReady) throw new Error("Storage is not enabled.");
  return new Promise((resolve, reject) => {
    const storageRef = _ref(_storage, path);
    _uploadBytes(storageRef, file).then(snap => {
      _getURL(snap.ref).then(resolve).catch(reject);
    }).catch(reject);
  });
}

function showToast(msg, type = "success") {
  let t = document.getElementById("_admin_toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "_admin_toast";
    t.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(120px);
      padding:12px 28px;border-radius:6px;font-family:'Orbitron',sans-serif;font-size:0.75rem;
      font-weight:700;z-index:999999;transition:transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);pointer-events:none;white-space:nowrap;`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = type === "error" ? "#c0392b" : "#00C896";
  t.style.color = type === "error" ? "#fff" : "#060D24";
  t.style.transform = "translateX(-50%) translateY(0)";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.transform = "translateX(-50%) translateY(120px)"; }, 3500);
}

export function initAdminSystem() {
  injectAdminHTML();
  setupTripleClick();
}

function injectAdminHTML() {
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

    ._cover-preview{width:100%;height:90px;border-radius:6px;object-fit:cover;
      display:block;margin-bottom:8px;background:#0A1230;border:1px solid rgba(0,200,150,0.2);}
    ._cover-video{width:100%;height:90px;border-radius:6px;object-fit:cover;
      display:block;margin-bottom:8px;}
    ._cover-remove{width:100%;background:rgba(192,57,43,0.1);border:1px solid rgba(192,57,43,0.3);
      color:#e74c3c;padding:7px;border-radius:4px;font-family:'Share Tech Mono',monospace;
      font-size:0.7rem;cursor:pointer;transition:all 0.25s;margin-top:6px;}
    ._cover-remove:hover{background:rgba(192,57,43,0.25);}

    ._savebar{padding:14px 20px;border-top:1px solid rgba(0,200,150,0.15);flex-shrink:0;}
    ._savebtn{width:100%;background:linear-gradient(135deg,#F5C518,#C9A227);color:#060D24;
      border:none;padding:13px;border-radius:6px;font-family:'Orbitron',sans-serif;
      font-size:0.82rem;font-weight:800;cursor:pointer;letter-spacing:0.08em;transition:all 0.3s;}
    ._savebtn:hover{box-shadow:0 0 20px rgba(245,197,24,0.35);}
    ._savebtn:disabled{opacity:0.6;cursor:not-allowed;}

    body.admin-mode [data-editable]{outline:1px dashed rgba(245,197,24,0.35);cursor:pointer;}
    body.admin-mode [data-editable]:hover{outline-color:#F5C518;background:rgba(245,197,24,0.04);}
    body.admin-mode [data-img-editable]{outline:2px dashed rgba(0,200,150,0.4);cursor:pointer;position:relative;}
    body.admin-mode [data-img-editable]:hover{outline-color:#00C896;}

    /* Special FAQ Admin UI styling */
    ._faq-edit-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(0,200,150,0.15); border-radius: 8px; padding: 12px; margin-bottom: 12px; }

    @media(max-width:480px){
      #_admin_panel{width:100%;right:-100%;}
      #_admin_panel.open{right:0;}
    }
  `;
  document.head.appendChild(style);

  // Inject secure modal
  const modal = document.createElement("div");
  modal.id = "_admin_modal";
  modal.innerHTML = `
    <div class="_abox">
      <h2>⚙ ADMIN ACCESS</h2>
      <p>JCSC IT CLUB COMMAND CENTER</p>
      <input type="email" id="_auser" class="_ainput" placeholder="Admin Email" autocomplete="off"
        onkeydown="if(event.key==='Enter')document.getElementById('_apass').focus()">
      <input type="password" id="_apass" class="_ainput" placeholder="Password"
        onkeydown="if(event.key==='Enter')window._adminLogin()">
      <button class="_alogin" id="_aloginbtn" onclick="window._adminLogin()">ENTER COMMAND CENTER</button>
      <button class="_acancel" onclick="document.getElementById('_admin_modal').classList.remove('show')">✕ Cancel</button>
    </div>`;
  document.body.appendChild(modal);

  // Inject panel
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

  window._adminLogin = adminLogin;
  window._closeAdmin = closeAdmin;
  window._saveAll   = saveAll;
}

function setupTripleClick() {
  let count = 0, timer = null;
  document.addEventListener("click", (e) => {
    const t = e.target.closest("#secret-trigger");
    if (!t) return;
    count++;
    clearTimeout(timer);
    timer = setTimeout(() => { count = 0; }, 900);
    if (count >= 3) {
      count = 0;
      if (_user && !_user.isAnonymous) {
        openAdmin(); // Bypass modal if already logged in as true admin
      } else {
        document.getElementById("_admin_modal").classList.add("show");
      }
    }
  });
}

async function adminLogin() {
  const email = document.getElementById("_auser").value.trim();
  const p = document.getElementById("_apass").value;
  const btn = document.getElementById("_aloginbtn");
  
  if (!email || !p) {
    showToast("⚠ Please enter both email and password", "error");
    return;
  }

  btn.textContent = "AUTHENTICATING...";
  btn.style.opacity = "0.7";

  try {
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
    await signInWithEmailAndPassword(_auth, email, p);
    
    document.getElementById("_admin_modal").classList.remove("show");
    document.getElementById("_auser").value = "";
    document.getElementById("_apass").value = "";
    openAdmin();
    showToast("✓ Admin Authentication Successful");
  } catch (error) {
    console.error("Login failed:", error);
    const box = document.querySelector("._abox");
    box.style.borderColor = "#e74c3c";
    setTimeout(() => { box.style.borderColor = ""; }, 900);
    showToast("⚠ " + error.message, "error");
  } finally {
    if (btn) {
      btn.textContent = "ENTER COMMAND CENTER";
      btn.style.opacity = "1";
    }
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

function buildPanel() {
  const body = document.getElementById("_apbody");
  if (!body) return;
  body.innerHTML = "";

  // 1. Hero Cover Section
  const hero = document.getElementById("hero") || document.querySelector(".page-hero") || document.querySelector(".hero-section");
  if (hero) {
    body.appendChild(buildCoverSection());
  }

  // 2. Text elements
  const textEls = document.querySelectorAll("[data-editable]");
  if (textEls.length) {
    const hdr = document.createElement("div");
    hdr.className = "_sec-hdr"; hdr.textContent = "📝 Text Content";
    body.appendChild(hdr);
    textEls.forEach(el => {
      body.appendChild(buildTextField(el.dataset.editable, el.textContent.trim()));
    });
  }

  // 3. Dynamic FAQ Editor Section
  const faqContainer = document.getElementById("faq-container") || document.getElementById("faq-list");
  if (faqContainer) {
    const hdr = document.createElement("div");
    hdr.className = "_sec-hdr"; hdr.textContent = "❓ FAQ Knowledge Base";
    body.appendChild(hdr);

    const faqEditArea = document.createElement("div");
    faqEditArea.id = "_admin_faq_area";
    body.appendChild(faqEditArea);

    const addFaqBtn = document.createElement("button");
    addFaqBtn.className = "_link-btn";
    addFaqBtn.style.cssText = "margin-top:5px; margin-bottom:20px; background:rgba(0,200,150,0.15); font-weight:bold;";
    addFaqBtn.textContent = "➕ Add FAQ Question";
    addFaqBtn.onclick = () => {
      _pendingFAQs.push({ q: "New Question Topic", a: "New Answer text goes here." });
      buildFAQSubPanel(faqEditArea);
      renderDynamicFAQs(_pendingFAQs);
    };
    body.appendChild(addFaqBtn);

    buildFAQSubPanel(faqEditArea);
  }

  // 4. Image uploads/avatars
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
      const curSrc = previewEl && !previewEl.src.startsWith("data:image/") ? previewEl.src : "";
      body.appendChild(buildImageField(key, curSrc, "circle"));
    });
  }

  // Focus action handlers
  document.querySelectorAll("[data-editable]").forEach(el => {
    el.onclick = () => {
      const field = body.querySelector(`textarea[data-target="${el.dataset.editable}"]`);
      if (field) {
        document.getElementById("_admin_panel").classList.add("open");
        field.scrollIntoView({ behavior:"smooth", block:"center" });
        field.focus(); field.select();
      }
    };
  });
}

function buildFAQSubPanel(container) {
  container.innerHTML = "";
  if (_pendingFAQs.length === 0) {
    const nodata = document.createElement("div");
    nodata.style.cssText = "font-size:0.75rem; color:#8BA8C4; text-align:center; padding:15px; border:1px dashed rgba(255,255,255,0.1); border-radius:6px;";
    nodata.textContent = "No FAQs found. Click below to add one.";
    container.appendChild(nodata);
    return;
  }

  _pendingFAQs.forEach((faq, index) => {
    const item = document.createElement("div");
    item.className = "_faq-edit-item";
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span class="_elabel" style="color:#00C896; margin-bottom:0;">#${index + 1} Question Panel</span>
        <button class="_aclose" style="color:#e74c3c; font-size:1rem;" title="Delete FAQ">✕</button>
      </div>
      <input type="text" class="_link-input" style="margin-bottom:8px;" placeholder="Question" value="${faq.q}">
      <textarea class="_efield" rows="2" placeholder="Answer text...">${faq.a}</textarea>
    `;

    const inputQ = item.querySelector("input");
    const textareaA = item.querySelector("textarea");
    const delBtn = item.querySelector("button");

    const updateFaqsLocally = () => {
      _pendingFAQs[index] = { q: inputQ.value.trim(), a: textareaA.value.trim() };
      renderDynamicFAQs(_pendingFAQs);
    };

    inputQ.addEventListener("input", updateFaqsLocally);
    textareaA.addEventListener("input", updateFaqsLocally);
    
    delBtn.onclick = () => {
      _pendingFAQs.splice(index, 1);
      buildFAQSubPanel(container);
      renderDynamicFAQs(_pendingFAQs);
    };

    container.appendChild(item);
  });
}

function validateLinkFormat(url, statusElement) {
  if (url.includes("ibb.co/") && !url.includes("i.ibb.co/")) {
    statusElement.innerHTML = "⚠️ <strong>Viewer Link Detected:</strong> Please use imgBB's Direct Link (ends in .jpg/.png) from 'Embed codes' menu.";
    statusElement.style.color = "#F5C518";
    return false;
  }
  statusElement.innerHTML = "";
  return true;
}

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
  ta.addEventListener("input", () => {
    document.querySelectorAll(`[data-editable="${key}"]`)
      .forEach(el => { el.textContent = ta.value; });
  });
  row.appendChild(label);
  row.appendChild(ta);
  return row;
}

function buildImageField(key, currentSrc, shape = "circle") {
  const wrap = document.createElement("div");
  wrap.className = "_imgrow";
  wrap.dataset.uploadKey = key;

  const label = document.createElement("div");
  label.className = "_elabel";
  label.textContent = key.replace(/-/g," ").toUpperCase();
  label.style.marginBottom = "8px";
  wrap.appendChild(label);

  const preview = document.createElement("img");
  preview.className = shape === "circle" ? "_imgpreview" : "_imgpreview-rect";
  preview.src = currentSrc || "";
  preview.onerror = () => { preview.style.opacity = "0.3"; };
  if (!currentSrc) preview.style.opacity = "0.3";
  wrap.appendChild(preview);

  const tabs = document.createElement("div");
  tabs.className = "_imgtabs";
  const tabUpload = document.createElement("button");
  tabUpload.className = "_imgtab"; tabUpload.textContent = "📁 Upload";
  const tabLink = document.createElement("button");
  tabLink.className = "_imgtab active"; tabLink.textContent = "🔗 Link";
  tabs.appendChild(tabUpload); tabs.appendChild(tabLink);
  wrap.appendChild(tabs);

  const uploadPane = document.createElement("div");
  uploadPane.style.display = "none";
  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = "image/*";
  fileInput.style.display = "none";

  const zone = document.createElement("div");
  zone.className = "_upload-zone";
  zone.innerHTML = `<em>📂</em><span>Drag & Drop Here</span>`;
  zone.onclick = () => {
    if (!_storageReady) {
      showToast("⚠️ Local storage mode used — Links are recommended.", "error");
    }
    fileInput.click();
  };
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

  const linkPane = document.createElement("div");
  const linkInput = document.createElement("input");
  linkInput.type = "url"; linkInput.className = "_link-input";
  linkInput.placeholder = "Paste raw image URL (Drive, Direct imgBB)";
  linkInput.value = currentSrc || "";
  
  const linkBtn = document.createElement("button");
  linkBtn.className = "_link-btn"; linkBtn.textContent = "✓ Apply Link";
  linkBtn.onclick = () => {
    const url = linkInput.value.trim();
    if (!url) { showToast("⚠ Please enter a URL", "error"); return; }
    if (!validateLinkFormat(url, status)) return;
    const converted = convertDriveLink(url);
    applyImageLocally(key, converted, preview);
    status.textContent = "✓ Link updated — save to apply";
    status.style.color = "#00C896";
    _pendingImages[key] = { type:"url", url: converted };
  };
  linkInput.addEventListener("input", () => validateLinkFormat(linkInput.value.trim(), status));

  linkPane.appendChild(linkInput);
  linkPane.appendChild(linkBtn);

  wrap.appendChild(uploadPane);
  wrap.appendChild(linkPane);

  const status = document.createElement("div");
  status.className = "_img-status";
  status.style.color = "#8BA8C4";
  wrap.appendChild(status);

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

function buildCoverSection() {
  const wrap = document.createElement("div");
  const hdr = document.createElement("div");
  hdr.className = "_sec-hdr"; hdr.textContent = "🎬 Hero Cover Media";
  wrap.appendChild(hdr);

  const row = document.createElement("div");
  row.className = "_imgrow";

  const coverPreviewWrap = document.createElement("div");
  coverPreviewWrap.id = "_cover_preview_wrap";
  const existingCover = document.querySelector("#hero .hero-cover-media") || document.querySelector(".page-hero .hero-cover-media");
  
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
    placeholder.textContent = "No cover asset configured";
    coverPreviewWrap.appendChild(placeholder);
  }
  row.appendChild(coverPreviewWrap);

  const tabs = document.createElement("div");
  tabs.className = "_imgtabs";
  const t1 = document.createElement("button"); t1.className="_imgtab"; t1.textContent="📁 Upload";
  const t2 = document.createElement("button"); t2.className="_imgtab active"; t2.textContent="🔗 Link";
  const t3 = document.createElement("button"); t3.className="_imgtab"; t3.textContent="🗑 Remove";
  tabs.append(t1,t2,t3);
  row.appendChild(tabs);

  const upPane = document.createElement("div");
  upPane.style.display = "none";
  const coverFileInput = document.createElement("input");
  coverFileInput.type = "file";
  coverFileInput.accept = "image/*,video/*";
  coverFileInput.style.display = "none";
  
  const coverZone = document.createElement("div");
  coverZone.className = "_upload-zone";
  coverZone.innerHTML = `<em>🎬</em><span>Drag Media File</span>`;
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

  const linkPane = document.createElement("div");
  const coverLinkInput = document.createElement("input");
  coverLinkInput.type = "url"; coverLinkInput.className = "_link-input";
  coverLinkInput.placeholder = "Paste raw image or video URL";
  
  const coverLinkBtn = document.createElement("button");
  coverLinkBtn.className = "_link-btn"; coverLinkBtn.textContent = "✓ Apply Cover Asset";
  coverLinkBtn.onclick = () => {
    const rawUrl = coverLinkInput.value.trim();
    if (!rawUrl) { showToast("⚠ Please enter a URL","error"); return; }
    if (!validateLinkFormat(rawUrl, coverStatus)) return;
    const url = convertDriveLink(rawUrl);
    const isVideo = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
    _pendingCover = { url, type: isVideo ? "video" : "image" };
    applyHeroCover(_pendingCover);
    updateCoverPreview(coverPreviewWrap, _pendingCover);
    coverStatus.textContent = "✓ Cover applied — save to persist";
    coverStatus.style.color = "#00C896";
  };
  coverLinkInput.addEventListener("input", () => validateLinkFormat(coverLinkInput.value.trim(), coverStatus));

  linkPane.appendChild(coverLinkInput);
  linkPane.appendChild(coverLinkBtn);

  row.appendChild(upPane);
  row.appendChild(linkPane);

  const coverStatus = document.createElement("div");
  coverStatus.className = "_img-status"; coverStatus.style.color = "#8BA8C4";
  row.appendChild(coverStatus);

  const removePane = document.createElement("div");
  removePane.style.display = "none";
  const removeBtn = document.createElement("button");
  removeBtn.className = "_cover-remove"; removeBtn.textContent = "🗑 Remove Cover Media";
  removeBtn.onclick = () => {
    _pendingCover = { url: null, type: null };
    applyHeroCover(_pendingCover);
    updateCoverPreview(coverPreviewWrap, null);
    coverStatus.textContent = "Cover removed — save to apply";
    coverStatus.style.color = "#e74c3c";
  };
  removePane.appendChild(removeBtn);
  row.appendChild(removePane);

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
    p.textContent = "No cover media configured"; wrap.appendChild(p); return;
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

function handleFileUpload(file, key, preview, status) {
  if (file.size > 8 * 1024 * 1024) {
    showToast("⚠ Max file size limit is 8MB", "error"); return;
  }
  status.textContent = "⏳ Parsing asset..."; status.style.color = "#F5C518";
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    applyImageLocally(key, dataUrl, preview);
    _pendingImages[key] = { type:"file", file, dataUrl };
    status.textContent = "✓ Asset loaded — click save to publish";
    status.style.color = "#00C896";
    preview.style.opacity = "1";
  };
  reader.readAsDataURL(file);
}

function handleCoverUpload(file, status, previewWrap) {
  const maxSize = 25 * 1024 * 1024;
  if (file.size > maxSize) { showToast("⚠ Media payload exceeds 25MB limit", "error"); return; }
  status.textContent = "⏳ Processing visual..."; status.style.color = "#F5C518";
  const reader = new FileReader();
  reader.onload = (e) => {
    const isVideo = file.type.startsWith("video/");
    _pendingCover = { type: isVideo ? "video" : "image", file, dataUrl: e.target.result };
    applyHeroCover({ url: e.target.result, type: _pendingCover.type });
    updateCoverPreview(previewWrap, { url: e.target.result, type: _pendingCover.type });
    status.textContent = "✓ Cover parsed — save to apply";
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
}

function convertDriveLink(url) {
  const driveMatch = url.match(/\/file\/d\/([^\/]+)/) || url.match(/id=([^&]+)/);
  if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  return url;
}

async function saveAll() {
  const btn = document.getElementById("_savebtn");
  btn.disabled = true; btn.textContent = "⏳ SAVING CHANGES...";

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
        btn.textContent = `⏳ UPLOADING IMAGE...`;
        try {
          const path = `site-images/${key}_${Date.now()}.${pending.file.name.split(".").pop()}`;
          const url = await withTimeout(uploadFile(pending.file, path), 20000, `Upload ${key}`);
          images[key] = url;
          applyImageLocally(key, url, null);
        } catch(e) {
          console.error("Upload failed for asset", key, e);
          images[key] = pending.dataUrl;
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
        btn.textContent = "⏳ UPLOADING HERO COVER...";
        try {
          const ext = _pendingCover.file.name.split(".").pop();
          const path = `site-images/hero-cover_${Date.now()}.${ext}`;
          const url = await withTimeout(uploadFile(_pendingCover.file, path), 20000, "Upload cover");
          heroCover = { url, type: _pendingCover.type };
          applyHeroCover(heroCover);
        } catch(e) {
          heroCover = { url: _pendingCover.dataUrl, type: _pendingCover.type };
        }
      } else {
        heroCover = { url: _pendingCover.url || _pendingCover.dataUrl, type: _pendingCover.type };
      }
    }

    btn.textContent = "💾 SYNCING WITH CLOUD DATABASE...";
    const ok = await saveToFirebase({ texts, images, heroCover, faqs: _pendingFAQs });

    if (ok) {
      _pendingImages = {};
      _pendingCover  = undefined;
      showToast("✓ All changes saved successfully!");
      setTimeout(() => { location.reload(); }, 800);
    }
  } catch(e) {
    console.error("Save error: ", e);
    showToast("⚠ Sync failed — see dev console for logs.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 SAVE ALL CHANGES";
  }
}

function initThemeToggle() {
  let btn = document.getElementById("theme-toggle");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "theme-toggle";
    btn.className = "theme-toggle-fab";
    btn.innerHTML = "🌙";
    document.body.appendChild(btn);
  }

  const style = document.createElement("style");
  style.textContent = `
    .theme-toggle-fab {
      position: fixed;
      bottom: 30px;
      left: 30px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #0F1B4A;
      border: 1px solid rgba(0, 200, 150, 0.4);
      color: #F5C518;
      font-size: 1.3rem;
      cursor: pointer;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 15px rgba(0,0,0,0.4);
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .theme-toggle-fab:hover {
      transform: scale(1.1);
      box-shadow: 0 0 15px rgba(0, 200, 150, 0.6);
    }
    body.light-theme .theme-toggle-fab {
      background: #E8F4FD;
      color: #060D24;
      border-color: rgba(6,13,36,0.3);
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
    }
  `;
  document.head.appendChild(style);

  const currentTheme = localStorage.getItem("theme");
  if (currentTheme === "light") {
    document.body.classList.add("light-theme");
    btn.innerHTML = "☀️";
  }

  btn.addEventListener("click", () => {
    document.body.classList.toggle("light-theme");
    const isLight = document.body.classList.contains("light-theme");
    localStorage.setItem("theme", isLight ? "light" : "dark");
    btn.innerHTML = isLight ? "☀️" : "🌙";
  });
}
