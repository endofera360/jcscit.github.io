// ============================================================
// JCSC IT Club — Shared Firebase Admin System
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
let _setDoc, _doc, _getDoc, _ref, _uploadBytes, _getURL;

export async function initFirebase() {
  try {
    console.log("🔄 Starting Firebase Connection...");

    // 1. Core Init (Prevents 'App already exists' crash)
    const { initializeApp, getApps, getApp } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js");
    const app = getApps().length === 0 ? initializeApp(FB_CFG) : getApp();

    // 2. Firestore Init (With robust network settings)
    const { initializeFirestore, doc, setDoc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
    
    _db = initializeFirestore(app, {
      experimentalForceLongPolling: true 
    });
    
    _setDoc = setDoc;
    _doc = doc;
    _getDoc = getDoc;
    _dbReady = true;
    console.log("✅ Database Ready!");

    // 3. Storage Init (Isolated so it doesn't crash the Database if skipped)
    try {
      const { getStorage, ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js");
      _storage = getStorage(app);
      _ref = ref;
      _uploadBytes = uploadBytes;
      _getURL = getDownloadURL;
      _storageReady = true;
      console.log("✅ Storage Ready!");
    } catch (storageError) {
      console.warn("⚠ Storage skipped. URLs will be used for images.");
    }

  } catch (error) {
    console.error("❌ Firebase init failed:", error);
    alert("Firebase connection error. Check console for details.");
  }
}
