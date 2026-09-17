/* ==========================================================================
   EVIDENTIA — Secure Digital Evidence & Legal Document Management
   Prototype application logic (vanilla JS, no framework).

   AUTH MODEL:
   - Sign in with an Employee ID (format UP-<DEPT-CODE>-<SERIAL>) + password,
     or by scanning the QR code on an ID card. Role is derived from the ID
     itself — never self-declared in the login form.
   - Register creates a "Pending" account that an Admin must approve from
     the Users page before it can sign in.
   - PROTOTYPE ONLY: accounts/passwords live in this file and are checked
     client-side. Production needs server-side hashed auth, real sessions,
     and rate limiting enforced server-side too.

   QR SCANNER FIX NOTES (read this if camera doesn't ask permission):
   1. Camera ONLY works on https:// or http://localhost. If you open this
      file directly as file:///... the browser will NEVER show a
      permission prompt — getUserMedia silently fails. Run this through a
      local server (VS Code "Live Server", or `python -m http.server`).
   2. If you already denied camera permission once, the browser will not
      prompt again automatically — you must allow it manually via the
      site info / lock icon next to the address bar.
   3. Every time the scan modal opens we now explicitly stop any previous
      stream first, so re-opening the modal can't leave a stale camera
      handle around blocking a new getUserMedia() call.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* EMPLOYEE ID SCHEME                                                   */
  /* ------------------------------------------------------------------ */

  const ROLE_BY_CODE = { "SYS-AD": "admin", "POL-IO": "officer", "JUD-DJ": "judge" };
  const CODE_BY_ROLE = { admin: "SYS-AD", officer: "POL-IO", judge: "JUD-DJ" };
  const ID_PATTERN = /^UP-(SYS-AD|POL-IO|JUD-DJ)-\d{4}$/;

  function roleFromId(employeeId) {
    const id = normalizeId(employeeId);
    const match = id.match(/^UP-(SYS-AD|POL-IO|JUD-DJ)-\d{4}$/);
    return match ? ROLE_BY_CODE[match[1]] : null;
  }

  function normalizeId(value) {
    return String(value || "").trim().toUpperCase();
  }

  /* ------------------------------------------------------------------ */
  /* DEMO DATA SEED                                                      */
  /* ------------------------------------------------------------------ */

  const SEED = {
    users: [
      { id: "u1", name: "Admin User", employeeId: "UP-SYS-AD-0001", password: "demo123", role: "admin", status: "Active", lastLogin: "Today, 09:02" },
      { id: "u2", name: "Rahul Sharma", employeeId: "UP-POL-IO-1042", password: "demo123", role: "officer", status: "Active", lastLogin: "Today, 08:41" },
      { id: "u3", name: "Amit Verma", employeeId: "UP-JUD-DJ-0231", password: "demo123", role: "judge", status: "Active", lastLogin: "Yesterday, 17:20" },
      { id: "u4", name: "Priya Nair", employeeId: "UP-POL-IO-1043", password: "demo123", role: "officer", status: "Active", lastLogin: "2 days ago" },
      { id: "u5", name: "Sanjay Rao", employeeId: "UP-JUD-DJ-0232", password: "demo123", role: "judge", status: "Inactive", lastLogin: "12 days ago" }
    ],

    cases: [
      { id: "CASE-2026-001", title: "Cyber Fraud Investigation", type: "Cyber Fraud", status: "Active", priority: "HIGH", investigator: "Rahul Sharma", created: "02 Sep 2026", updated: "Today", description: "Investigation into a phishing-based banking fraud ring targeting online banking customers across three states." },
      { id: "CASE-2026-002", title: "Financial Fraud Investigation", type: "Financial Fraud", status: "Under Review", priority: "MEDIUM", investigator: "Priya Nair", created: "28 Aug 2026", updated: "Yesterday", description: "Suspected shell-company invoice fraud under review by the legal team ahead of charge sheet filing." },
      { id: "CASE-2026-003", title: "Digital Evidence Investigation", type: "Digital Evidence", status: "Active", priority: "HIGH", investigator: "Rahul Sharma", created: "20 Aug 2026", updated: "3 days ago", description: "Forensic recovery and chain-of-custody handling of seized digital devices in a data-theft case." },
      { id: "CASE-2026-004", title: "Corporate Embezzlement Case", type: "Financial Fraud", status: "Closed", priority: "LOW", investigator: "Priya Nair", created: "02 Jul 2026", updated: "3 weeks ago", description: "Closed case regarding internal embezzlement at a logistics firm; charge sheet filed and accepted." }
    ],

    documents: [
      { id: "d1", name: "FIR_Report.pdf", caseId: "CASE-2026-001", type: "FIR", uploadedBy: "Rahul Sharma", date: "08 Sep 2026", classification: "CONFIDENTIAL", currentVersion: "1.2", hash: "a82f9c8b3e0d17c4f5b62a9d0e77c4b1f3a9d02e8b1c7f4e6a3d9c8b2f1e0a91", integrityOk: true,
        versions: [
          { version: "1.0", date: "08 Sep 2026, 10:20", hash: "ffab12c9e34d5567a8901bcde2345f67890abc1234def5678901abcde23456", by: "Rahul Sharma" },
          { version: "1.1", date: "08 Sep 2026, 12:15", hash: "de56f789012ab34cd5670e89f1234a56789bcde01f2345678901abcdef2345", by: "Rahul Sharma" },
          { version: "1.2", date: "08 Sep 2026, 15:42", hash: "a82f9c8b3e0d17c4f5b62a9d0e77c4b1f3a9d02e8b1c7f4e6a3d9c8b2f1e0a91", by: "Rahul Sharma" }
        ],
        access: [{ user: "Rahul Sharma", role: "Investigating Officer", perm: "READ + WRITE" }, { user: "Amit Verma", role: "Judicial Officer", perm: "READ ONLY" }] },
      { id: "d2", name: "Investigation_Report.pdf", caseId: "CASE-2026-001", type: "Investigation Report", uploadedBy: "Rahul Sharma", date: "05 Sep 2026", classification: "INTERNAL", currentVersion: "1.0", hash: "1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f901", integrityOk: true,
        versions: [{ version: "1.0", date: "05 Sep 2026, 09:00", hash: "1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f901", by: "Rahul Sharma" }],
        access: [{ user: "Rahul Sharma", role: "Investigating Officer", perm: "READ + WRITE" }] },
      { id: "d3", name: "Forensic_Report.pdf", caseId: "CASE-2026-003", type: "Forensic Report", uploadedBy: "Priya Nair", date: "22 Aug 2026", classification: "HIGHLY CONFIDENTIAL", currentVersion: "1.0", hash: "7788990011aabbccddeeff00112233445566778899aabbccddeeff00112233", integrityOk: true,
        versions: [{ version: "1.0", date: "22 Aug 2026, 14:10", hash: "7788990011aabbccddeeff00112233445566778899aabbccddeeff00112233", by: "Priya Nair" }],
        access: [{ user: "Priya Nair", role: "Investigating Officer", perm: "READ + WRITE" }] },
      { id: "d4", name: "Witness_Statement.pdf", caseId: "CASE-2026-002", type: "Witness Statement", uploadedBy: "Priya Nair", date: "29 Aug 2026", classification: "CONFIDENTIAL", currentVersion: "1.0", hash: "aa11bb22cc33dd44ee55ff6600aa11bb22cc33dd44ee55ff6600aa11bb22cc", integrityOk: true,
        versions: [{ version: "1.0", date: "29 Aug 2026, 11:30", hash: "aa11bb22cc33dd44ee55ff6600aa11bb22cc33dd44ee55ff6600aa11bb22cc", by: "Priya Nair" }],
        access: [{ user: "Priya Nair", role: "Investigating Officer", perm: "READ + WRITE" }, { user: "Amit Verma", role: "Judicial Officer", perm: "READ ONLY" }] },
      { id: "d5", name: "Evidence_001.pdf", caseId: "CASE-2026-003", type: "Evidence", uploadedBy: "Rahul Sharma", date: "21 Aug 2026", classification: "HIGHLY CONFIDENTIAL", currentVersion: "1.0", hash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9", integrityOk: true,
        versions: [{ version: "1.0", date: "21 Aug 2026, 16:00", hash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9", by: "Rahul Sharma" }],
        access: [{ user: "Rahul Sharma", role: "Investigating Officer", perm: "READ + WRITE" }] },
      { id: "d6", name: "Court_Submission.pdf", caseId: "CASE-2026-004", type: "Court Document", uploadedBy: "Amit Verma", date: "30 Jul 2026", classification: "CONFIDENTIAL", currentVersion: "1.1", hash: "9f8e7d6c5b4a392817f6e5d4c3b2a190f8e7d6c5b4a392817f6e5d4c3b2a190", integrityOk: true,
        versions: [
          { version: "1.0", date: "29 Jul 2026, 10:00", hash: "8f7e6d5c4b3a291807f6e5d4c3b2a190f8e7d6c5b4a392817f6e5d4c3b2a180", by: "Amit Verma" },
          { version: "1.1", date: "30 Jul 2026, 09:15", hash: "9f8e7d6c5b4a392817f6e5d4c3b2a190f8e7d6c5b4a392817f6e5d4c3b2a190", by: "Amit Verma" }
        ],
        access: [{ user: "Amit Verma", role: "Judicial Officer", perm: "READ + WRITE" }] }
    ],

    evidence: [
      { id: "E-001", label: "Seized Laptop (Dell Latitude)", caseId: "CASE-2026-003", docId: "d5", registeredBy: "Rahul Sharma", date: "21 Aug 2026" },
      { id: "E-002", label: "Mobile Handset (Evidence Bag #44)", caseId: "CASE-2026-001", docId: "d1", registeredBy: "Rahul Sharma", date: "02 Sep 2026" },
      { id: "E-003", label: "USB Drive (16GB, sealed)", caseId: "CASE-2026-003", docId: "d3", registeredBy: "Priya Nair", date: "22 Aug 2026" }
    ],

    custody: {
      "E-001": [
        { time: "21 Aug 2026, 16:00", action: "Evidence registered", by: "Rahul Sharma", role: "Investigating Officer", detail: "Laptop seized from suspect premises and logged into evidence registry.", hash: "a1b2c3d4e5f60718..." },
        { time: "21 Aug 2026, 18:20", action: "Transferred to Forensic Department", by: "Rahul Sharma", role: "Investigating Officer", detail: "Physical custody transferred for imaging and analysis.", hash: null },
        { time: "22 Aug 2026, 14:10", action: "Forensic image verified", by: "System", role: "System", detail: "SHA-256 fingerprint generated for forensic disk image.", hash: "7788990011aabbcc..." },
        { time: "23 Aug 2026, 09:45", action: "Shared with Judicial Officer", by: "Priya Nair", role: "Investigating Officer", detail: "Read-only access granted to the court for case review.", hash: null }
      ],
      "E-002": [
        { time: "02 Sep 2026, 11:00", action: "Evidence registered", by: "Rahul Sharma", role: "Investigating Officer", detail: "Mobile device sealed and logged under Evidence Bag #44.", hash: null },
        { time: "02 Sep 2026, 11:40", action: "Integrity verified", by: "System", role: "System", detail: "Extracted data fingerprint recorded.", hash: "a82f9c8b3e0d17c4..." }
      ],
      "E-003": [
        { time: "22 Aug 2026, 13:00", action: "Evidence registered", by: "Priya Nair", role: "Investigating Officer", detail: "USB drive sealed on-site and transported to lab.", hash: null },
        { time: "22 Aug 2026, 14:10", action: "Integrity verified", by: "System", role: "System", detail: "Drive contents hashed prior to analysis.", hash: "7788990011aabbcc..." }
      ]
    },

    auditLogs: [
      { time: "08 Sep 2026, 10:42", user: "Rahul Sharma", role: "Investigating Officer", action: "Uploaded", doc: "FIR_Report.pdf", caseId: "CASE-2026-001", session: "SES-88231", status: "SUCCESS" },
      { time: "08 Sep 2026, 11:02", user: "Amit Verma", role: "Judicial Officer", action: "Viewed", doc: "FIR_Report.pdf", caseId: "CASE-2026-001", session: "SES-88245", status: "SUCCESS" },
      { time: "08 Sep 2026, 11:10", user: "Unknown User", role: "Unknown", action: "Access Attempt", doc: "Evidence_001.pdf", caseId: "CASE-2026-003", session: "SES-00019", status: "DENIED" },
      { time: "08 Sep 2026, 09:15", user: "System", role: "System", action: "Verified Integrity", doc: "Evidence_008.pdf", caseId: "CASE-2026-002", session: "SYS", status: "SUCCESS" },
      { time: "07 Sep 2026, 18:22", user: "Admin User", role: "Admin", action: "Updated Access Permissions", doc: "Witness_Statement.pdf", caseId: "CASE-2026-002", session: "SES-77120", status: "SUCCESS" },
      { time: "07 Sep 2026, 16:05", user: "Priya Nair", role: "Investigating Officer", action: "Uploaded", doc: "Forensic_Report.pdf", caseId: "CASE-2026-003", session: "SES-77002", status: "SUCCESS" }
    ],

    alerts: [
      { sev: "high", title: "Unauthorized access attempt detected", desc: "An unrecognized session attempted to open Evidence_001.pdf without valid permissions.", time: "08 Sep 2026, 11:10" },
      { sev: "medium", title: "Multiple failed login attempts", desc: "3 failed login attempts on account UP-JUD-DJ-0232 within 5 minutes.", time: "07 Sep 2026, 21:44" },
      { sev: "info", title: "Document integrity verified", desc: "Evidence_008.pdf passed scheduled integrity verification.", time: "08 Sep 2026, 09:15" }
    ],

    notifications: [
      { text: "Document \"Witness_Statement.pdf\" was shared with you", time: "2 hours ago", icon: "share" },
      { text: "Integrity verification completed for Evidence_001.pdf", time: "5 hours ago", icon: "check" },
      { text: "Unauthorized access attempt detected on a restricted document", time: "Today, 11:10", icon: "alert" },
      { text: "You were assigned to CASE-2026-003", time: "Yesterday", icon: "case" },
      { text: "Evidence #E-002 was transferred to Forensic Department", time: "2 days ago", icon: "transfer" }
    ]
  };

  /* ------------------------------------------------------------------ */
  /* STATE / PERSISTENCE                                                 */
  /* ------------------------------------------------------------------ */

  const STORAGE_KEY = "evidentia_state_v2";
  let DB = null;
  let currentUser = null;
  let verificationHistory = [];
  let activeSection = "dashboard";
  let activeCaseId = null;
  let activeCustodyId = null;
  let uploadedFileMeta = null;

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.users && parsed.users.length && parsed.users[0].employeeId) return parsed;
      } catch (e) { /* fall through to seed */ }
    }
    return JSON.parse(JSON.stringify(SEED));
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); }
  function resetState() {
    localStorage.removeItem(STORAGE_KEY);
    DB = JSON.parse(JSON.stringify(SEED));
    verificationHistory = [];
    loginAttempts = {};
    saveState();
  }

  /* ------------------------------------------------------------------ */
  /* UTILITIES                                                           */
  /* ------------------------------------------------------------------ */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  async function sha256Hex(fileOrText) {
    let buffer;
    if (fileOrText instanceof File) buffer = await fileOrText.arrayBuffer();
    else buffer = new TextEncoder().encode(String(fileOrText));
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function nowTimestamp() {
    const d = new Date();
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
      ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function newSessionId() { return "SES-" + Math.floor(10000 + Math.random() * 89999); }

  function roleLabel(role) {
    return { admin: "Administrator", officer: "Investigating Officer", judge: "Judicial Officer" }[role] || role;
  }
  function roleDeptCode(role) { return CODE_BY_ROLE[role] || "GEN-XX"; }

  function initials(name) {
    return name.split(" ").map(function (p) { return p[0]; }).slice(0, 2).join("").toUpperCase();
  }

  function addAudit(action, docName, caseId, status) {
    DB.auditLogs.unshift({
      time: nowTimestamp(),
      user: currentUser ? currentUser.name : "Unknown User",
      role: currentUser ? roleLabel(currentUser.role) : "Unknown",
      action: action, doc: docName || "—", caseId: caseId || "—",
      session: newSessionId(), status: status || "SUCCESS"
    });
    saveState();
  }

  function addAlert(sev, title, desc) {
    DB.alerts.unshift({ sev: sev, title: title, desc: desc, time: nowTimestamp() });
    saveState();
  }

  function toast(title, msg, type) {
    const container = $("#toastContainer");
    const el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.innerHTML = '<strong>' + escapeHtml(title) + '</strong>' + escapeHtml(msg || "");
    container.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      el.style.transform = "translateX(20px)";
      el.style.transition = "all .2s";
      setTimeout(function () { el.remove(); }, 220);
    }, 3800);
  }

  /* ------------------------------------------------------------------ */
  /* AUTH — Employee ID + password (or QR), lockout, register-for-review */
  /* ------------------------------------------------------------------ */

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 60 * 1000;
  let loginAttempts = {}; // { empId: { count, lockedUntil } }

  function lockoutRemaining(empId) {
    const r = loginAttempts[empId];
    if (!r || !r.lockedUntil) return 0;
    const left = r.lockedUntil - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  function registerFailure(empId) {
    const r = loginAttempts[empId] || { count: 0, lockedUntil: 0 };
    r.count += 1;
    if (r.count >= MAX_ATTEMPTS) { r.lockedUntil = Date.now() + LOCKOUT_MS; r.count = 0; }
    loginAttempts[empId] = r;
    return r;
  }

  function attemptLogin(employeeId, password) {
    const empId = normalizeId(employeeId);
    const user = DB.users.find(function (u) { return u.employeeId === empId; });

    if (!user || user.password !== password) {
      addAudit("Login Attempt (" + (empId || "blank ID") + ")", "—", "—", "DENIED");
      return { ok: false, reason: "invalid" };
    }
    if (user.status === "Pending") {
      addAudit("Login Attempt (pending approval)", "—", "—", "DENIED");
      return { ok: false, reason: "pending" };
    }
    if (user.status === "Inactive") {
      addAudit("Login Attempt (inactive account)", "—", "—", "DENIED");
      return { ok: false, reason: "inactive" };
    }
    user.lastLogin = "Just now";
    saveState();
    return { ok: true, user: user };
  }

  function doLogin(user) {
    currentUser = user;
    sessionStorage.setItem("evidentia_session", JSON.stringify({ id: user.id }));
    addAudit("Logged in", "—", "—", "SUCCESS");
    $("#loginScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    renderShellForUser();
    goToSection("dashboard");
  }

  function doLogout() {
    if (currentUser) addAudit("Logged out", "—", "—", "SUCCESS");
    currentUser = null;
    sessionStorage.removeItem("evidentia_session");
    $("#app").classList.add("hidden");
    $("#loginScreen").classList.remove("hidden");
    $("#loginForm").reset();
    setFieldError("loginError", "");
    $("#loginRoleHint").textContent = "Your role is determined by your issued ID.";
    $("#loginRoleHint").classList.remove("is-valid");
  }

  function renderShellForUser() {
    $("#userAvatar").textContent = initials(currentUser.name);
    $("#userName").textContent = currentUser.name;
    $("#userRoleLabel").textContent = roleLabel(currentUser.role);
    $all("[data-role-only]").forEach(function (el) {
      const roles = el.getAttribute("data-role-only").split(",");
      el.style.display = roles.indexOf(currentUser.role) !== -1 ? "" : "none";
    });
    renderNotifications();
  }

  function setFieldError(elId, message) { $("#" + elId).textContent = message || ""; }

  function initLoginForm() {
    const idInput = $("#loginEmpId");
    const hint = $("#loginRoleHint");

    idInput.addEventListener("input", function () {
      const role = roleFromId(idInput.value);
      idInput.classList.remove("is-invalid");
      if (!idInput.value.trim()) {
        hint.textContent = "Your role is determined by your issued ID.";
        hint.classList.remove("is-valid");
      } else if (role) {
        hint.textContent = "Recognized credential type: " + roleLabel(role);
        hint.classList.add("is-valid");
      } else {
        hint.textContent = "Expected format: UP-POL-IO-0000";
        hint.classList.remove("is-valid");
      }
    });

    $("#loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      setFieldError("loginError", "");

      const empId = normalizeId(idInput.value);
      const password = $("#loginPassword").value;

      if (!empId || !password) { setFieldError("loginError", "Please enter both your Employee ID and password."); return; }
      if (!ID_PATTERN.test(empId)) {
        setFieldError("loginError", "That doesn't look like a valid Employee ID. Expected format: UP-POL-IO-0000");
        idInput.classList.add("is-invalid");
        return;
      }
      const locked = lockoutRemaining(empId);
      if (locked) { setFieldError("loginError", "Too many failed attempts. Try again in " + locked + " seconds."); return; }

      const btn = $("#loginSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Verifying credential…";

      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = "Sign In";

        const result = attemptLogin(empId, password);
        if (result.ok) {
          delete loginAttempts[empId];
          doLogin(result.user);
          return;
        }

        if (result.reason === "pending") {
          setFieldError("loginError", "This credential is awaiting administrator approval. Please check back later.");
          return;
        }
        if (result.reason === "inactive") {
          setFieldError("loginError", "This credential is deactivated. Contact your system administrator.");
          return;
        }

        const rec = registerFailure(empId);
        const nowLocked = lockoutRemaining(empId);
        if (nowLocked) {
          setFieldError("loginError", "Account temporarily locked after " + MAX_ATTEMPTS + " failed attempts. Try again in " + nowLocked + " seconds.");
        } else {
          const left = MAX_ATTEMPTS - rec.count;
          setFieldError("loginError", "Invalid Employee ID or password. " + left + (left === 1 ? " attempt" : " attempts") + " remaining before lockout.");
        }
      }, 500);
    });

    $all(".demo-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const role = btn.getAttribute("data-role");
        const user = DB.users.find(function (u) { return u.role === role && u.status === "Active"; });
        if (user) doLogin(user);
      });
    });
  }

  function initSignupForm() {
    const roleSelect = $("#signupRole");
    const idHint = $("#signupIdHint");
    roleSelect.addEventListener("change", function () {
      idHint.textContent = "Format: UP-" + roleDeptCode(roleSelect.value) + "-0000";
    });

    $("#signupForm").addEventListener("submit", function (e) {
      e.preventDefault();
      setFieldError("signupError", "");

      const role = roleSelect.value;
      const first = $("#signupFirst").value.trim();
      const last = $("#signupLast").value.trim();
      const empId = normalizeId($("#signupEmpId").value);
      const agency = $("#signupAgency").value.trim();
      const email = $("#signupEmail").value.trim();
      const password = $("#signupPassword").value;

      if (!first || !last || !empId || !agency || !email || !password) {
        setFieldError("signupError", "Please complete every field.");
        return;
      }
      if (!ID_PATTERN.test(empId)) {
        setFieldError("signupError", "Employee ID format is invalid. Expected: UP-" + roleDeptCode(role) + "-0000");
        $("#signupEmpId").classList.add("is-invalid");
        return;
      }
      if (roleFromId(empId) !== role) {
        setFieldError("signupError", "This Employee ID belongs to a different credential type. " +
          roleLabel(role) + " IDs start with UP-" + roleDeptCode(role) + "-");
        $("#signupEmpId").classList.add("is-invalid");
        return;
      }
      $("#signupEmpId").classList.remove("is-invalid");

      if (!/^\S+@\S+\.\S+$/.test(email)) { setFieldError("signupError", "Please enter a valid email address."); return; }
      if (password.length < 8) { setFieldError("signupError", "Password must be at least 8 characters."); return; }
      if (DB.users.some(function (u) { return u.employeeId === empId; })) {
        setFieldError("signupError", "An account already exists for this Employee ID.");
        return;
      }

      const newUser = {
        id: "u" + Date.now(), name: (first + " " + last).trim(), employeeId: empId,
        password: password, role: role, status: "Pending", lastLogin: "Never", agency: agency, email: email
      };
      DB.users.push(newUser);
      addAlert("info", "New registration pending review", newUser.name + " (" + empId + ") requested " + roleLabel(role) + " access.");
      saveState();

      $("#signupForm").reset();
      idHint.textContent = "Format: UP-POL-IO-0000";
      toast("Registration submitted", "Your request for " + roleLabel(role) + " access is pending administrator review.", "success");
    });
  }

  function initTabs() {
    const entries = [
      { tab: $("#tabLogin"), pane: $("#paneLogin") },
      { tab: $("#tabSignup"), pane: $("#paneSignup") }
    ];
    entries.forEach(function (entry, index) {
      entry.tab.addEventListener("click", function () { activate(index); });
    });
    function activate(i) {
      entries.forEach(function (entry, idx) {
        const on = idx === i;
        entry.tab.classList.toggle("is-active", on);
        entry.tab.setAttribute("aria-selected", on ? "true" : "false");
        entry.pane.classList.toggle("is-active", on);
        entry.pane.hidden = !on;
      });
      setFieldError("loginError", "");
      setFieldError("signupError", "");
    }
  }

  function initPasswordToggles() {
    $all("[data-toggle-password]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const input = $("#" + btn.getAttribute("data-toggle-password"));
        input.type = input.type === "password" ? "text" : "password";
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* QR CODE SCANNING (works pre-login for both login & signup fields)   */
  /*                                                                     */
  /* FIXES APPLIED IN THIS VERSION:                                      */
  /* 1. Explicit window.isSecureContext check — this is the #1 reason    */
  /*    the browser never shows a permission prompt at all: opening the  */
  /*    page as file:///... or over plain http:// on a non-localhost     */
  /*    host disables getUserMedia entirely, and Chrome/Firefox will not */
  /*    even ask — it just rejects immediately with no dialog.           */
  /* 2. openQrScanModal() now calls stopQrScanner() BEFORE starting a new */
  /*    session, so re-opening the modal (or double-clicking the scan    */
  /*    button) can't leave an old stream/rAF loop running underneath a  */
  /*    new one.                                                          */
  /* 3. Progressively looser camera constraints (environment -> user ->  */
  /*    any) so a laptop/desktop with only one front camera doesn't fail  */
  /*    with OverconstrainedError before the permission prompt can show. */
  /* 4. Canvas 2D context is created once and reused instead of being    */
  /*    re-fetched on every animation frame.                             */
  /* ------------------------------------------------------------------ */

  let qrStream = null;
  let qrRafId = null;
  let qrScanning = false;
  let qrTargetInputId = null;
  let qrCtx = null;

  function openQrScanModal(targetInputId) {
    // FIX: always tear down any previous scanning session first.
    stopQrScanner();

    qrTargetInputId = targetInputId;
    openModal("qrScanModal");
    const status = $("#qrScanStatus");
    status.classList.remove("is-error");
    status.textContent = "Requesting camera access…";
    startQrScanner();
  }

  function stopQrScanner() {
    qrScanning = false;
    if (qrRafId) cancelAnimationFrame(qrRafId);
    qrRafId = null;
    if (qrStream) { qrStream.getTracks().forEach(function (t) { t.stop(); }); qrStream = null; }
    const video = $("#qrVideo");
    if (video) video.srcObject = null;
  }

  async function getCameraStream() {
    // Try progressively looser constraints so a desktop/laptop with only
    // a single front camera (no "environment" facing camera) still works.
    const attempts = [
      { video: { facingMode: { ideal: "environment" } } },
      { video: { facingMode: "user" } },
      { video: true }
    ];
    let lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
      try {
        return await navigator.mediaDevices.getUserMedia(attempts[i]);
      } catch (err) {
        lastErr = err;
        // A hard permission denial won't succeed on retry either — stop immediately.
        if (err && err.name === "NotAllowedError") throw err;
      }
    }
    throw lastErr;
  }

  async function startQrScanner() {
    const video = $("#qrVideo");
    const canvas = $("#qrCanvas");
    const status = $("#qrScanStatus");

    // FIX #1 — the actual root cause of "browser never asks for permission":
    // getUserMedia is only available in a secure context (https:// or
    // http://localhost). If the page was opened as file:///... or a plain
    // http:// address on a real host, navigator.mediaDevices may not even
    // exist, or the call rejects instantly with no prompt whatsoever.
    if (!window.isSecureContext) {
      status.textContent = "Camera requires HTTPS or localhost. This page looks like it was opened directly from disk (file://) or over plain HTTP — serve it from a local server (e.g. VS Code 'Live Server', or run `python -m http.server` and open http://localhost:PORT) and try again.";
      status.classList.add("is-error");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent = "Camera isn't available in this browser/context. Please enter your Employee ID manually.";
      status.classList.add("is-error");
      return;
    }
    if (typeof window.jsQR !== "function") {
      status.textContent = "QR scanner failed to load (check your internet connection). Please enter your Employee ID manually.";
      status.classList.add("is-error");
      return;
    }

    try {
      qrStream = await getCameraStream();
      video.srcObject = qrStream;
      video.setAttribute("playsinline", "");
      await video.play();
      qrScanning = true;
      qrCtx = canvas.getContext("2d", { willReadFrequently: true });
      status.classList.remove("is-error");
      status.textContent = "Point the camera at the QR code on your ID card.";
      tickQr(video, canvas);
    } catch (err) {
      qrStream = null;
      let msg = "Camera access denied or unavailable. Please enter your Employee ID manually.";
      if (err && err.name === "NotAllowedError") {
        msg = "Camera permission was denied. Allow camera access for this site in your browser settings (click the lock/site-info icon next to the address bar) and try again, or enter your Employee ID manually.";
      } else if (err && err.name === "NotFoundError") {
        msg = "No camera was found on this device. Please enter your Employee ID manually.";
      } else if (err && (err.name === "NotReadableError" || err.name === "TrackStartError")) {
        msg = "The camera is already in use by another app. Close it and try again, or enter your Employee ID manually.";
      } else if (err && err.name === "OverconstrainedError") {
        msg = "Couldn't find a matching camera on this device. Please enter your Employee ID manually.";
      }
      status.textContent = msg;
      status.classList.add("is-error");
    }
  }

  function tickQr(video, canvas) {
    if (!qrScanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      qrCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
      let code = null;
      try {
        const frame = qrCtx.getImageData(0, 0, canvas.width, canvas.height);
        code = window.jsQR(frame.data, frame.width, frame.height);
      } catch (e) { /* frame not ready */ }
      if (code && code.data) { handleQrDecoded(code.data); return; }
    }
    qrRafId = requestAnimationFrame(function () { tickQr(video, canvas); });
  }

  function handleQrDecoded(rawText) {
    let empId = String(rawText || "").trim();
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && parsed.empId) empId = parsed.empId;
    } catch (e) { /* plain-text QR — use as-is */ }
    empId = normalizeId(empId);

    if (!ID_PATTERN.test(empId)) {
      const status = $("#qrScanStatus");
      status.textContent = "That QR code isn't a valid Evidentia ID card. Still scanning…";
      status.classList.add("is-error");
      qrRafId = requestAnimationFrame(function () { tickQr($("#qrVideo"), $("#qrCanvas")); });
      return;
    }

    stopQrScanner();
    closeModals();

    const input = $("#" + qrTargetInputId);
    input.value = empId;
    input.dispatchEvent(new Event("input"));

    const role = roleFromId(empId);
    toast("ID card recognized", empId + " — " + roleLabel(role), "success");
    if (qrTargetInputId === "loginEmpId") $("#loginPassword").focus();
  }

  /* ------------------------------------------------------------------ */
  /* DEMO ID CARDS                                                       */
  /* ------------------------------------------------------------------ */

  function renderIdCardModal() {
    const grid = $("#idCardGrid");
    grid.innerHTML = "";
    ["admin", "officer", "judge"].forEach(function (role) {
      const user = DB.users.find(function (u) { return u.role === role && u.status === "Active"; });
      if (!user) return;
      const qrId = "idcardqr-" + user.id;
      const card = document.createElement("div");
      card.className = "id-card";
      card.innerHTML =
        '<div class="id-card-head"><span>EVIDENTIA</span><span>' + roleLabel(user.role).toUpperCase() + '</span></div>' +
        '<div class="id-card-body">' +
          '<div class="id-card-qr" id="' + qrId + '"></div>' +
          '<div><div class="id-card-name">' + escapeHtml(user.name) + '</div><div class="id-card-id">' + user.employeeId + '</div></div>' +
        '</div>';
      grid.appendChild(card);
      if (typeof window.QRCode === "function") {
        new QRCode(document.getElementById(qrId), { text: user.employeeId, width: 96, height: 96, colorDark: "#123b6b", colorLight: "#f6f1e3" });
      } else {
        document.getElementById(qrId).textContent = "QR unavailable offline";
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* NAVIGATION                                                           */
  /* ------------------------------------------------------------------ */

  function goToSection(section) {
    activeSection = section;
    $all(".content-section").forEach(function (s) { s.classList.add("hidden"); });
    const target = $("#section-" + section);
    if (target) target.classList.remove("hidden");
    $all(".nav-item").forEach(function (n) { n.classList.toggle("active", n.getAttribute("data-section") === section); });
    $("#sidebar").classList.remove("open");
    $("#sidebarBackdrop").classList.add("hidden");

    switch (section) {
      case "dashboard": renderDashboard(); break;
      case "cases": renderCases(); break;
      case "documents": renderDocuments(); break;
      case "evidence": renderEvidence(); break;
      case "custody": renderCustodySection(); break;
      case "integrity": renderIntegritySection(); break;
      case "audit": renderAuditLogs(); break;
      case "security": renderSecurityCenter(); break;
      case "users": renderUsers(); break;
      default: break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* DASHBOARD                                                            */
  /* ------------------------------------------------------------------ */

  function renderDashboard() {
    const totalCases = DB.cases.length;
    const activeCases = DB.cases.filter(function (c) { return c.status === "Active"; }).length;
    const totalDocs = DB.documents.length;
    const verifiedDocs = DB.documents.filter(function (d) { return d.integrityOk; }).length;
    const pendingReview = DB.cases.filter(function (c) { return c.status === "Under Review"; }).length;
    const alerts = DB.alerts.length;

    const stats = [
      { label: "Total Cases", value: totalCases, icon: iconCase(), bg: "rgba(18,59,107,0.12)", color: "#123b6b" },
      { label: "Active Investigations", value: activeCases, icon: iconActivity(), bg: "rgba(11,107,58,0.12)", color: "#0b6b3a" },
      { label: "Documents", value: totalDocs, icon: iconDoc(), bg: "rgba(18,59,107,0.12)", color: "#123b6b" },
      { label: "Verified", value: verifiedDocs, icon: iconCheck(), bg: "rgba(11,107,58,0.12)", color: "#0b6b3a" },
      { label: "Pending Reviews", value: pendingReview, icon: iconClock(), bg: "rgba(138,100,0,0.12)", color: "#8a6400" },
      { label: "Security Alerts", value: alerts, icon: iconShield(), bg: "rgba(179,34,28,0.12)", color: "#b3221c" }
    ];
    $("#statGrid").innerHTML = stats.map(function (s) {
      return '<div class="stat-card"><div class="stat-icon" style="background:' + s.bg + ';color:' + s.color + '">' + s.icon + '</div>' +
        '<div class="stat-label">' + s.label + '</div><div class="stat-value">' + s.value + '</div></div>';
    }).join("");

    const recent = DB.cases.slice(0, 4);
    $("#recentCases").innerHTML = recent.map(function (c) {
      return '<div class="recent-case-row" data-case-open="' + c.id + '">' +
        '<div><div class="rc-id">' + c.id + '</div><div class="rc-title">' + escapeHtml(c.title) + '</div>' +
        '<div class="rc-meta">' + docCountForCase(c.id) + ' documents · Updated ' + c.updated + '</div></div>' +
        statusBadge(c.status) + '</div>';
    }).join("");

    $("#recentActivity").innerHTML = DB.auditLogs.slice(0, 6).map(function (a) {
      const isAlert = a.status === "DENIED";
      return '<div class="activity-row"><span class="activity-dot ' + (isAlert ? "alert" : "") + '"></span>' +
        '<div><div class="activity-text"><strong>' + escapeHtml(a.user) + '</strong> ' + describeAction(a) + '</div>' +
        '<div class="activity-time">' + a.time + '</div></div></div>';
    }).join("");

    const verifiedPct = totalDocs ? ((verifiedDocs / totalDocs) * 100).toFixed(1) : "100.0";
    $("#securityOverview").innerHTML =
      '<div class="sec-metric"><div class="val">' + verifiedPct + '%</div><div class="lbl">Document Integrity Verified</div></div>' +
      '<div class="sec-metric"><div class="val">99.2%</div><div class="lbl">Access Compliance</div></div>' +
      '<div class="sec-metric"><div class="val">' + DB.alerts.length + '</div><div class="lbl">Open Security Alerts</div></div>';

    $all("[data-case-open]").forEach(function (el) { el.addEventListener("click", function () { openCaseDetails(el.getAttribute("data-case-open")); }); });
    $all("[data-section-link]").forEach(function (el) { el.onclick = function () { goToSection(el.getAttribute("data-section-link")); }; });
  }

  function describeAction(a) {
    if (a.status === "DENIED") return 'attempted "' + a.action + '" on ' + a.doc + ' — <span style="color:#b3221c;font-weight:700;">denied</span>';
    return a.action.toLowerCase() + " " + (a.doc !== "—" ? a.doc : "");
  }
  function docCountForCase(caseId) { return DB.documents.filter(function (d) { return d.caseId === caseId; }).length; }
  function statusBadge(status) {
    const map = { "Active": "badge-active", "Under Review": "badge-review", "Closed": "badge-closed" };
    return '<span class="badge ' + (map[status] || "badge-closed") + '">' + status.toUpperCase() + '</span>';
  }
  function priorityBadge(p) {
    const map = { HIGH: "badge-high", MEDIUM: "badge-medium", LOW: "badge-low" };
    return '<span class="badge ' + (map[p] || "badge-low") + '">' + p + '</span>';
  }

  function iconCase() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" stroke-width="1.8"/></svg>'; }
  function iconActivity() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M3 12h4l2 6 4-12 2 6h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  function iconDoc() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.8"/></svg>'; }
  function iconCheck() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg>'; }
  function iconClock() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'; }
  function iconShield() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 2L3 6V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V6L12 2Z" stroke="currentColor" stroke-width="1.8"/></svg>'; }
  function iconAlertTriangle() { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M12 3L2 21h20L12 3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>'; }

  /* ------------------------------------------------------------------ */
  /* CASES                                                                */
  /* ------------------------------------------------------------------ */

  let caseFilter = "all";
  let caseSearchTerm = "";

  function renderCases() {
    const filtered = DB.cases.filter(function (c) {
      if (caseFilter === "active" && c.status !== "Active") return false;
      if (caseFilter === "under review" && c.status !== "Under Review") return false;
      if (caseFilter === "closed" && c.status !== "Closed") return false;
      if (caseFilter === "high" && c.priority !== "HIGH") return false;
      if (caseSearchTerm) {
        const t = caseSearchTerm.toLowerCase();
        if (!(c.id.toLowerCase().includes(t) || c.title.toLowerCase().includes(t) || c.investigator.toLowerCase().includes(t))) return false;
      }
      return true;
    });
    if (!filtered.length) {
      $("#casesGrid").innerHTML = '<div class="muted-text" style="grid-column:1/-1;text-align:center;padding:40px 0;">No cases match your filters.</div>';
      return;
    }
    $("#casesGrid").innerHTML = filtered.map(function (c) {
      return '<div class="case-card" data-case-open="' + c.id + '">' +
        '<div class="case-card-top"><span class="case-id">' + c.id + '</span>' + statusBadge(c.status) + '</div>' +
        '<div class="case-title">' + escapeHtml(c.title) + '</div>' +
        '<div class="case-badges">' + priorityBadge(c.priority) + '<span class="badge badge-closed">' + c.type + '</span></div>' +
        '<div class="case-meta-row"><span>' + docCountForCase(c.id) + ' documents</span><span>' + c.updated + '</span></div>' +
        '<div class="case-meta-row"><span>Officer</span><span>' + escapeHtml(c.investigator) + '</span></div>' +
        '</div>';
    }).join("");
    $all("[data-case-open]").forEach(function (el) { el.addEventListener("click", function () { openCaseDetails(el.getAttribute("data-case-open")); }); });
  }

  /* ------------------------------------------------------------------ */
  /* CASE DETAILS                                                         */
  /* ------------------------------------------------------------------ */

  function openCaseDetails(caseId) {
    activeCaseId = caseId;
    const c = DB.cases.find(function (x) { return x.id === caseId; });
    if (!c) return;

    $all(".content-section").forEach(function (s) { s.classList.add("hidden"); });
    $("#section-caseDetails").classList.remove("hidden");
    $all(".nav-item").forEach(function (n) { n.classList.remove("active"); });

    const docs = DB.documents.filter(function (d) { return d.caseId === caseId; });
    const evidenceItems = DB.evidence.filter(function (e) { return e.caseId === caseId; });
    const caseAudit = DB.auditLogs.filter(function (a) { return a.caseId === caseId; });

    $("#caseDetailsContent").innerHTML =
      '<div class="cd-header">' +
        '<div class="cd-title-row"><h2>' + c.id + '</h2>' + statusBadge(c.status) + priorityBadge(c.priority) + '</div>' +
        '<div style="font-size:16px;color:var(--ink-900);font-weight:700;">' + escapeHtml(c.title) + '</div>' +
        '<div class="cd-grid">' +
          '<div class="cd-grid-item"><div class="lbl">Assigned Officer</div><div class="val">' + escapeHtml(c.investigator) + '</div></div>' +
          '<div class="cd-grid-item"><div class="lbl">Case Type</div><div class="val">' + c.type + '</div></div>' +
          '<div class="cd-grid-item"><div class="lbl">Created</div><div class="val">' + c.created + '</div></div>' +
          '<div class="cd-grid-item"><div class="lbl">Last Updated</div><div class="val">' + c.updated + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="tabs" id="cdTabs">' +
        '<button class="tab-btn active" data-tab="overview">Overview</button>' +
        '<button class="tab-btn" data-tab="documents">Documents (' + docs.length + ')</button>' +
        '<button class="tab-btn" data-tab="evidence">Evidence (' + evidenceItems.length + ')</button>' +
        '<button class="tab-btn" data-tab="access">Access Control</button>' +
        '<button class="tab-btn" data-tab="history">Audit History</button>' +
      '</div>' +
      '<div class="tab-panel active" data-panel="overview"><div class="panel"><h3>Case Description</h3><p class="muted-text">' + escapeHtml(c.description) + '</p></div></div>' +
      '<div class="tab-panel" data-panel="documents"><div class="table-wrap"><table class="data-table"><thead><tr><th>Document</th><th>Type</th><th>Version</th><th>Integrity</th><th>Actions</th></tr></thead><tbody>' +
        (docs.length ? docs.map(function (d) {
          return '<tr><td class="doc-name-cell"><span class="fname">' + escapeHtml(d.name) + '</span></td><td>' + d.type + '</td><td>v' + d.currentVersion + '</td><td>' + integrityBadge(d.integrityOk) + '</td>' +
            '<td class="row-actions"><button class="mini-btn primary" data-view-doc="' + d.id + '">View</button></td></tr>';
        }).join("") : '<tr class="empty-row"><td colspan="5">No documents in this case yet.</td></tr>') +
        '</tbody></table></div></div>' +
      '<div class="tab-panel" data-panel="evidence">' +
        (evidenceItems.length ? evidenceItems.map(function (e) {
          return '<div class="recent-case-row" style="margin-bottom:8px;" data-custody-open="' + e.id + '"><div><div class="rc-id">' + e.id + '</div><div class="rc-title">' + escapeHtml(e.label) + '</div><div class="rc-meta">Registered by ' + escapeHtml(e.registeredBy) + ' · ' + e.date + '</div></div><span class="badge badge-verified">TRACKED</span></div>';
        }).join("") : '<p class="muted-text">No evidence items registered for this case.</p>') +
      '</div>' +
      '<div class="tab-panel" data-panel="access"><div class="panel"><h3>Case Team Access</h3>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>User</th><th>Role</th><th>Permission</th></tr></thead><tbody>' +
        '<tr><td>' + escapeHtml(c.investigator) + '</td><td>Investigating Officer</td><td><span class="badge badge-verified">READ + WRITE</span></td></tr>' +
        '<tr><td>Amit Verma</td><td>Judicial Officer</td><td><span class="badge badge-restricted">READ ONLY</span></td></tr>' +
        '</tbody></table></div></div></div>' +
      '<div class="tab-panel" data-panel="history"><div class="table-wrap"><table class="data-table"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Document</th><th>Status</th></tr></thead><tbody>' +
        (caseAudit.length ? caseAudit.map(function (a) {
          return '<tr><td>' + a.time + '</td><td>' + escapeHtml(a.user) + '</td><td>' + a.action + '</td><td>' + a.doc + '</td><td>' + statusPill(a.status) + '</td></tr>';
        }).join("") : '<tr class="empty-row"><td colspan="5">No recorded activity yet.</td></tr>') +
        '</tbody></table></div></div>';

    $all(".tab-btn", $("#cdTabs")).forEach(function (btn) {
      btn.onclick = function () {
        $all(".tab-btn", $("#cdTabs")).forEach(function (b) { b.classList.remove("active"); });
        $all(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
        btn.classList.add("active");
        $('[data-panel="' + btn.getAttribute("data-tab") + '"]').classList.add("active");
      };
    });
    $all("[data-view-doc]").forEach(function (el) {
      el.onclick = function () { goToSection("documents"); setTimeout(function () { openVerifyModal(el.getAttribute("data-view-doc")); }, 80); };
    });
    $all("[data-custody-open]").forEach(function (el) {
      el.onclick = function () { goToSection("custody"); setTimeout(function () { selectCustodyEvidence(el.getAttribute("data-custody-open")); }, 80); };
    });
  }

  function integrityBadge(ok) { return ok ? '<span class="badge badge-verified">✓ VERIFIED</span>' : '<span class="badge badge-fail">⚠ FAILED</span>'; }
  function statusPill(status) { return status === "SUCCESS" ? '<span class="badge badge-success">SUCCESS</span>' : '<span class="badge badge-denied">DENIED</span>'; }

  /* ------------------------------------------------------------------ */
  /* DOCUMENTS                                                            */
  /* ------------------------------------------------------------------ */

  let docTypeFilter = "all";
  let docSearchTerm = "";

  function renderDocuments() {
    const filtered = DB.documents.filter(function (d) {
      if (docTypeFilter !== "all" && d.type !== docTypeFilter) return false;
      if (docSearchTerm) {
        const t = docSearchTerm.toLowerCase();
        if (!(d.name.toLowerCase().includes(t) || d.caseId.toLowerCase().includes(t) || d.uploadedBy.toLowerCase().includes(t))) return false;
      }
      return true;
    });
    if (!filtered.length) { $("#docsTableBody").innerHTML = '<tr class="empty-row"><td colspan="9">No documents match your search.</td></tr>'; return; }

    $("#docsTableBody").innerHTML = filtered.map(function (d) {
      return '<tr>' +
        '<td class="doc-name-cell"><span class="fname">' + escapeHtml(d.name) + '</span><span class="ftype">' + d.type + '</span></td>' +
        '<td>' + d.caseId + '</td><td>' + d.type + '</td><td>' + escapeHtml(d.uploadedBy) + '</td><td>' + d.date + '</td>' +
        '<td>v' + d.currentVersion + '</td><td>' + integrityBadge(d.integrityOk) + '</td>' +
        '<td><span class="badge ' + (d.classification === "PUBLIC" ? "badge-public" : "badge-restricted") + '">' + d.classification + '</span></td>' +
        '<td class="row-actions">' +
          '<button class="mini-btn primary" data-verify-doc="' + d.id + '">Verify</button>' +
          '<button class="mini-btn" data-share-doc="' + d.id + '">Share</button>' +
          '<button class="mini-btn" data-history-doc="' + d.id + '">History</button>' +
        '</td></tr>';
    }).join("");

    $all("[data-verify-doc]").forEach(function (el) { el.onclick = function () { openVerifyModal(el.getAttribute("data-verify-doc")); }; });
    $all("[data-share-doc]").forEach(function (el) { el.onclick = function () { openShareModal(el.getAttribute("data-share-doc")); }; });
    $all("[data-history-doc]").forEach(function (el) { el.onclick = function () { showVersionHistory(el.getAttribute("data-history-doc")); }; });
  }

  function showVersionHistory(docId) {
    const d = DB.documents.find(function (x) { return x.id === docId; });
    if (!d) return;
    let body = '<h4 style="color:var(--ink-900);margin-bottom:10px;">' + escapeHtml(d.name) + ' — Version History</h4>';
    body += d.versions.slice().reverse().map(function (v, idx) {
      const isCurrent = idx === 0;
      return '<div class="integrity-hash-box" style="margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<strong style="color:var(--ink-900);">Version ' + v.version + (isCurrent ? ' (current)' : '') + '</strong>' +
        '<span class="muted-text small">' + v.date + '</span></div>' +
        '<div class="h-lbl">SHA-256</div><div class="h-val">' + v.hash + '</div>' +
        '<div class="muted-text small" style="margin-top:6px;">Changed by ' + escapeHtml(v.by) + '</div></div>';
    }).join("");
    openGenericModal("Document Version History", body);
  }

  /* ------------------------------------------------------------------ */
  /* EVIDENCE                                                             */
  /* ------------------------------------------------------------------ */

  function renderEvidence() {
    $("#evidenceGrid").innerHTML = DB.evidence.map(function (e) {
      const events = (DB.custody[e.id] || []).length;
      return '<div class="case-card" data-custody-open="' + e.id + '">' +
        '<div class="case-card-top"><span class="case-id">' + e.id + '</span><span class="badge badge-verified">TRACKED</span></div>' +
        '<div class="case-title">' + escapeHtml(e.label) + '</div>' +
        '<div class="case-meta-row"><span>Case</span><span>' + e.caseId + '</span></div>' +
        '<div class="case-meta-row"><span>Registered by</span><span>' + escapeHtml(e.registeredBy) + '</span></div>' +
        '<div class="case-meta-row"><span>Custody events</span><span>' + events + '</span></div>' +
        '</div>';
    }).join("");
    $all("[data-custody-open]").forEach(function (el) {
      el.onclick = function () { goToSection("custody"); setTimeout(function () { selectCustodyEvidence(el.getAttribute("data-custody-open")); }, 60); };
    });
  }

  /* ------------------------------------------------------------------ */
  /* CHAIN OF CUSTODY                                                     */
  /* ------------------------------------------------------------------ */

  function renderCustodySection() {
    $("#custodyEvidenceList").innerHTML = DB.evidence.map(function (e) {
      return '<div class="custody-evidence-item" data-ev="' + e.id + '"><div class="ce-id">' + e.id + '</div><div class="ce-name">' + escapeHtml(e.label) + '</div></div>';
    }).join("");
    $all("[data-ev]").forEach(function (el) { el.onclick = function () { selectCustodyEvidence(el.getAttribute("data-ev")); }; });
    if (activeCustodyId) selectCustodyEvidence(activeCustodyId);
  }

  function selectCustodyEvidence(evId) {
    activeCustodyId = evId;
    $all(".custody-evidence-item").forEach(function (el) { el.classList.toggle("active", el.getAttribute("data-ev") === evId); });
    const e = DB.evidence.find(function (x) { return x.id === evId; });
    const events = DB.custody[evId] || [];
    $("#custodyTimelineTitle").textContent = e ? (evId + " — " + e.label) : "Evidence Timeline";
    $("#custodyTimeline").innerHTML = events.map(function (ev) {
      return '<div class="custody-event">' +
        '<div class="ce-time">' + ev.time + '</div>' +
        '<div class="ce-action">' + escapeHtml(ev.action) + '</div>' +
        '<div class="ce-detail">' + escapeHtml(ev.detail) + ' — <strong>' + escapeHtml(ev.by) + '</strong> (' + ev.role + ')</div>' +
        (ev.hash ? '<div class="ce-hash">SHA-256: ' + ev.hash + '</div>' : '') +
        '</div>';
    }).join("") || '<p class="muted-text">No custody events recorded for this item.</p>';
  }

  /* ------------------------------------------------------------------ */
  /* INTEGRITY VERIFICATION SECTION                                       */
  /* ------------------------------------------------------------------ */

  function renderIntegritySection() {
    const sel = $("#integrityDocSelect");
    sel.innerHTML = DB.documents.map(function (d) { return '<option value="' + d.id + '">' + escapeHtml(d.name) + ' — ' + d.caseId + '</option>'; }).join("");
    sel.onchange = function () { runIntegrityCheck(sel.value); };
    if (DB.documents.length) runIntegrityCheck(sel.value);
    renderVerificationHistory();
  }

  function runIntegrityCheck(docId) {
    const d = DB.documents.find(function (x) { return x.id === docId; });
    if (!d) return;
    const area = $("#integrityResultArea");
    area.innerHTML =
      '<div class="integrity-hash-box"><div class="h-lbl">Original SHA-256 (registered)</div><div class="h-val">' + d.hash + '</div></div>' +
      '<div class="integrity-hash-box"><div class="h-lbl">Current SHA-256 (recalculated)</div><div class="h-val">' + d.hash + '</div></div>' +
      '<div class="integrity-result ' + (d.integrityOk ? "ok" : "fail") + '">' +
        '<div class="ir-icon">' + (d.integrityOk ? iconCheck() : iconAlertTriangle()) + '</div>' +
        '<div><div class="ir-title">' + (d.integrityOk ? "✓ DOCUMENT INTEGRITY VERIFIED" : "⚠ INTEGRITY FAILURE") + '</div>' +
        '<div class="ir-sub">' + (d.integrityOk ? "This document matches its original registered fingerprint." : "This document does not match its original registered fingerprint.") + '</div></div>' +
      '</div>' +
      '<div style="margin-top:14px;"><button class="btn-secondary" id="simulateTamperBtn">Simulate Tampering (Demo)</button> <button class="btn-secondary" id="restoreIntegrityBtn">Restore Original (Demo)</button></div>';

    $("#simulateTamperBtn").onclick = function () { simulateTamper(d.id); };
    $("#restoreIntegrityBtn").onclick = function () { restoreIntegrity(d.id); };

    verificationHistory.unshift({ time: nowTimestamp(), doc: d.name, by: currentUser.name, result: d.integrityOk ? "VERIFIED" : "FAILURE" });
    renderVerificationHistory();
    addAudit("Verified Integrity", d.name, d.caseId, "SUCCESS");
  }

  function simulateTamper(docId) {
    const d = DB.documents.find(function (x) { return x.id === docId; });
    if (!d) return;
    d.integrityOk = false;
    saveState();
    addAlert("high", "Document integrity failure detected", d.name + " no longer matches its registered SHA-256 fingerprint.");
    addAudit("Integrity Check Failed", d.name, d.caseId, "DENIED");
    runIntegrityCheck(docId);
    renderDocuments();
    toast("Tamper simulation complete", d.name + " now fails integrity verification.", "error");
  }

  function restoreIntegrity(docId) {
    const d = DB.documents.find(function (x) { return x.id === docId; });
    if (!d) return;
    d.integrityOk = true;
    saveState();
    addAudit("Integrity Restored (Demo)", d.name, d.caseId, "SUCCESS");
    runIntegrityCheck(docId);
    renderDocuments();
    toast("Restored", d.name + " now matches its original fingerprint.", "success");
  }

  function renderVerificationHistory() {
    $("#verificationHistoryBody").innerHTML = verificationHistory.length ?
      verificationHistory.slice(0, 12).map(function (v) {
        return '<tr><td>' + v.time + '</td><td>' + escapeHtml(v.doc) + '</td><td>' + escapeHtml(v.by) + '</td><td>' +
          (v.result === "VERIFIED" ? '<span class="badge badge-verified">✓ VERIFIED</span>' : '<span class="badge badge-fail">⚠ FAILURE</span>') + '</td></tr>';
      }).join("") : '<tr class="empty-row"><td colspan="4">No verifications run yet this session.</td></tr>';
  }

  /* ------------------------------------------------------------------ */
  /* AUDIT LOGS                                                           */
  /* ------------------------------------------------------------------ */

  let auditFilter = "all";
  let auditSearchTerm = "";

  function renderAuditLogs() {
    const filtered = DB.auditLogs.filter(function (a) {
      if (auditFilter === "SUCCESS" && a.status !== "SUCCESS") return false;
      if (auditFilter === "DENIED" && a.status !== "DENIED") return false;
      if (auditFilter === "security" && a.action.toLowerCase().indexOf("access attempt") === -1 && a.status !== "DENIED") return false;
      if (auditSearchTerm) {
        const t = auditSearchTerm.toLowerCase();
        if (!(a.user.toLowerCase().includes(t) || a.action.toLowerCase().includes(t) || a.doc.toLowerCase().includes(t))) return false;
      }
      return true;
    });
    $("#auditTableBody").innerHTML = filtered.length ? filtered.map(function (a) {
      return '<tr><td>' + a.time + '</td><td>' + escapeHtml(a.user) + '</td><td>' + a.role + '</td><td>' + a.action + '</td><td>' + a.doc + '</td><td>' + a.caseId + '</td><td class="hash-mono">' + a.session + '</td><td>' + statusPill(a.status) + '</td></tr>';
    }).join("") : '<tr class="empty-row"><td colspan="8">No matching audit entries.</td></tr>';
  }

  /* ------------------------------------------------------------------ */
  /* SECURITY CENTER                                                      */
  /* ------------------------------------------------------------------ */

  function renderSecurityCenter() {
    const failedLogins = DB.auditLogs.filter(function (a) { return a.action.indexOf("Login") !== -1 && a.status === "DENIED"; }).length;
    const accessViolations = DB.auditLogs.filter(function (a) { return a.status === "DENIED"; }).length;
    const docsAtRisk = DB.documents.filter(function (d) { return !d.integrityOk; }).length;

    const stats = [
      { label: "Integrity Status", value: DB.documents.filter(function (d) { return d.integrityOk; }).length + "/" + DB.documents.length, icon: iconCheck(), bg: "rgba(11,107,58,0.12)", color: "#0b6b3a" },
      { label: "Access Violations", value: accessViolations, icon: iconAlertTriangle(), bg: "rgba(179,34,28,0.12)", color: "#b3221c" },
      { label: "Failed Login Attempts", value: failedLogins, icon: iconShield(), bg: "rgba(138,100,0,0.12)", color: "#8a6400" },
      { label: "Suspicious Activity", value: DB.alerts.filter(function (a) { return a.sev === "high"; }).length, icon: iconAlertTriangle(), bg: "rgba(179,34,28,0.12)", color: "#b3221c" },
      { label: "Documents At Risk", value: docsAtRisk, icon: iconDoc(), bg: "rgba(18,59,107,0.12)", color: "#123b6b" },
      { label: "Total Alerts", value: DB.alerts.length, icon: iconActivity(), bg: "rgba(18,59,107,0.12)", color: "#123b6b" }
    ];
    $("#securityStatGrid").innerHTML = stats.map(function (s) {
      return '<div class="stat-card"><div class="stat-icon" style="background:' + s.bg + ';color:' + s.color + '">' + s.icon + '</div>' +
        '<div class="stat-label">' + s.label + '</div><div class="stat-value">' + s.value + '</div></div>';
    }).join("");

    $("#alertsList").innerHTML = DB.alerts.length ? DB.alerts.map(function (a) {
      const sevClass = a.sev === "high" ? "sev-high" : a.sev === "medium" ? "sev-medium" : "sev-info";
      const sevLabel = a.sev === "high" ? "🔴 HIGH" : a.sev === "medium" ? "🟡 MEDIUM" : "🟢 INFORMATION";
      return '<div class="alert-row" data-alert-detail="' + escapeHtml(a.desc) + '"><span class="alert-sev ' + sevClass + '"></span>' +
        '<div><div class="alert-title">' + sevLabel + ' — ' + escapeHtml(a.title) + '</div><div class="alert-desc">' + escapeHtml(a.desc) + '</div></div>' +
        '<div class="alert-time">' + a.time + '</div></div>';
    }).join("") : '<p class="muted-text">No active alerts.</p>';

    $all("[data-alert-detail]").forEach(function (el) { el.onclick = function () { toast("Alert Detail", el.getAttribute("data-alert-detail"), "warn"); }; });
  }

  /* ------------------------------------------------------------------ */
  /* USERS (ADMIN) — includes approving Pending registrations             */
  /* ------------------------------------------------------------------ */

  function renderUsers() {
    $("#usersTableBody").innerHTML = DB.users.map(function (u) {
      const statusDot = u.status === "Active" ? "d-active" : u.status === "Pending" ? "d-pending" : "d-inactive";
      const roleBadge = u.role === "admin" ? "badge-restricted" : u.role === "officer" ? "badge-verified" : "badge-low";
      let actions;
      if (u.status === "Pending") {
        actions = '<button class="mini-btn primary" data-approve-user="' + u.id + '">Approve</button> ' +
                  '<button class="mini-btn" data-reject-user="' + u.id + '">Reject</button>';
      } else {
        actions = '<button class="mini-btn" data-toggle-user="' + u.id + '">' + (u.status === "Active" ? "Deactivate" : "Activate") + '</button>';
      }
      return '<tr><td>' + escapeHtml(u.name) + '</td><td class="hash-mono">' + u.employeeId + '</td><td>' +
        '<span class="badge ' + roleBadge + '">' + roleLabel(u.role).toUpperCase() + '</span></td>' +
        '<td><span class="status-dot-inline"><span class="d ' + statusDot + '"></span>' + u.status + '</span></td>' +
        '<td>' + u.lastLogin + '</td>' +
        '<td class="row-actions">' + actions + '</td></tr>';
    }).join("");

    $all("[data-toggle-user]").forEach(function (el) {
      el.onclick = function () {
        const u = DB.users.find(function (x) { return x.id === el.getAttribute("data-toggle-user"); });
        if (!u) return;
        confirmAction(
          (u.status === "Active" ? "Deactivate User" : "Activate User"),
          "Are you sure you want to " + (u.status === "Active" ? "deactivate" : "activate") + " " + u.name + "?",
          function () {
            u.status = u.status === "Active" ? "Inactive" : "Active";
            saveState();
            addAudit((u.status === "Active" ? "Activated" : "Deactivated") + " user " + u.name, "—", "—", "SUCCESS");
            renderUsers();
            toast("Updated", u.name + " is now " + u.status.toLowerCase() + ".", "success");
          }
        );
      };
    });

    $all("[data-approve-user]").forEach(function (el) {
      el.onclick = function () {
        const u = DB.users.find(function (x) { return x.id === el.getAttribute("data-approve-user"); });
        if (!u) return;
        confirmAction("Approve Registration", "Grant " + roleLabel(u.role) + " access to " + u.name + " (" + u.employeeId + ")?", function () {
          u.status = "Active";
          saveState();
          addAudit("Approved registration for " + u.name, "—", "—", "SUCCESS");
          renderUsers();
          toast("Approved", u.name + " can now sign in.", "success");
        });
      };
    });

    $all("[data-reject-user]").forEach(function (el) {
      el.onclick = function () {
        const u = DB.users.find(function (x) { return x.id === el.getAttribute("data-reject-user"); });
        if (!u) return;
        confirmAction("Reject Registration", "Reject the registration request from " + u.name + " (" + u.employeeId + ")? This cannot be undone.", function () {
          DB.users = DB.users.filter(function (x) { return x.id !== u.id; });
          saveState();
          addAudit("Rejected registration for " + u.name, "—", "—", "SUCCESS");
          renderUsers();
          toast("Rejected", u.name + "'s registration request was removed.", "warn");
        });
      };
    });
  }


  /* ------------------------------------------------------------------ */
  /* GLOBAL SEARCH                                                        */
  /* ------------------------------------------------------------------ */

  function runGlobalSearch(term) {
    const box = $("#searchResults");
    if (!term) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    const t = term.toLowerCase();
    const caseMatches = DB.cases.filter(function (c) { return c.id.toLowerCase().includes(t) || c.title.toLowerCase().includes(t); }).slice(0, 4);
    const docMatches = DB.documents.filter(function (d) { return d.name.toLowerCase().includes(t) || d.type.toLowerCase().includes(t); }).slice(0, 4);
    const evMatches = DB.evidence.filter(function (e) { return e.id.toLowerCase().includes(t) || e.label.toLowerCase().includes(t); }).slice(0, 4);

    let html = "";
    if (caseMatches.length) {
      html += '<div class="search-group-label">Cases</div>' + caseMatches.map(function (c) {
        return '<div class="search-result-item" data-go-case="' + c.id + '"><div class="search-result-title">' + c.id + ' — ' + escapeHtml(c.title) + '</div><div class="search-result-sub">' + c.status + '</div></div>';
      }).join("");
    }
    if (docMatches.length) {
      html += '<div class="search-group-label">Documents</div>' + docMatches.map(function (d) {
        return '<div class="search-result-item" data-go-doc="' + d.id + '"><div class="search-result-title">' + escapeHtml(d.name) + '</div><div class="search-result-sub">' + d.caseId + ' · ' + d.type + '</div></div>';
      }).join("");
    }
    if (evMatches.length) {
      html += '<div class="search-group-label">Evidence</div>' + evMatches.map(function (e) {
        return '<div class="search-result-item" data-go-ev="' + e.id + '"><div class="search-result-title">' + e.id + ' — ' + escapeHtml(e.label) + '</div><div class="search-result-sub">' + e.caseId + '</div></div>';
      }).join("");
    }
    if (!html) html = '<div class="search-empty">No results for "' + escapeHtml(term) + '"</div>';

    box.innerHTML = html;
    box.classList.remove("hidden");

    $all("[data-go-case]", box).forEach(function (el) { el.onclick = function () { openCaseDetails(el.getAttribute("data-go-case")); box.classList.add("hidden"); $("#globalSearch").value = ""; }; });
    $all("[data-go-doc]", box).forEach(function (el) { el.onclick = function () { goToSection("documents"); box.classList.add("hidden"); $("#globalSearch").value = ""; setTimeout(function () { openVerifyModal(el.getAttribute("data-go-doc")); }, 80); }; });
    $all("[data-go-ev]", box).forEach(function (el) { el.onclick = function () { goToSection("custody"); box.classList.add("hidden"); $("#globalSearch").value = ""; setTimeout(function () { selectCustodyEvidence(el.getAttribute("data-go-ev")); }, 80); }; });
  }

  /* ------------------------------------------------------------------ */
  /* NOTIFICATIONS                                                        */
  /* ------------------------------------------------------------------ */

  function renderNotifications() {
    const panel = $("#notifPanel");
    panel.innerHTML = '<div class="notif-panel-head">Notifications</div>' + DB.notifications.map(function (n) {
      return '<div class="notif-item"><div class="notif-icon" style="background:rgba(18,59,107,0.12);color:#123b6b;">' + notifIcon(n.icon) + '</div>' +
        '<div><div class="notif-text">' + escapeHtml(n.text) + '</div><div class="notif-time">' + n.time + '</div></div></div>';
    }).join("");
    $("#notifDot").classList.toggle("hidden", DB.notifications.length === 0);
  }

  function notifIcon(kind) {
    const icons = {
      share: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><circle cx="18" cy="5" r="2.5" stroke="currentColor" stroke-width="1.6"/><circle cx="6" cy="12" r="2.5" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="19" r="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M8.2 10.7L15.8 6.3M8.2 13.3l7.6 4.4" stroke="currentColor" stroke-width="1.6"/></svg>',
      check: iconCheck(), alert: iconAlertTriangle(), case: iconCase(),
      transfer: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M4 7h13M17 7l-3-3M17 7l-3 3M20 17H7M7 17l3-3M7 17l3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    };
    return icons[kind] || iconCheck();
  }

  /* ------------------------------------------------------------------ */
  /* MODALS: GENERIC / CONFIRM                                            */
  /* ------------------------------------------------------------------ */

  function openModal(id) {
    $("#modalOverlay").classList.remove("hidden");
    $all(".modal").forEach(function (m) { m.classList.add("hidden"); });
    $("#" + id).classList.remove("hidden");
  }
  function closeModals() {
    stopQrScanner();
    $("#modalOverlay").classList.add("hidden");
    $all(".modal").forEach(function (m) { m.classList.add("hidden"); });
  }

  function openGenericModal(title, bodyHtml) {
    $("#verifyModalBody").innerHTML = bodyHtml;
    $("#verifyModal h3").textContent = title;
    openModal("verifyModal");
  }

  let pendingConfirmAction = null;
  function confirmAction(title, text, onConfirm) {
    $("#confirmModalTitle").textContent = title;
    $("#confirmModalText").textContent = text;
    pendingConfirmAction = onConfirm;
    openModal("confirmModal");
  }

  /* ------------------------------------------------------------------ */
  /* VERIFY MODAL                                                         */
  /* ------------------------------------------------------------------ */

  function openVerifyModal(docId) {
    const d = DB.documents.find(function (x) { return x.id === docId; });
    if (!d) return;
    $("#verifyModal h3").textContent = "Document Integrity Check";

    $("#verifyModalBody").innerHTML =
      '<div style="margin-bottom:14px;"><div class="h-lbl" style="font-size:11px;color:var(--ink-400);text-transform:uppercase;">Document</div><div style="font-size:15px;font-weight:700;color:var(--ink-900);">' + escapeHtml(d.name) + '</div></div>' +
      '<div class="integrity-hash-box"><div class="h-lbl">Original SHA-256</div><div class="h-val">' + d.hash + '</div></div>' +
      '<div class="integrity-hash-box"><div class="h-lbl">Current SHA-256</div><div class="h-val">' + d.hash + '</div></div>' +
      '<div id="verifyResultInline"></div>' +
      '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="mini-btn" data-share-doc="' + d.id + '">Share</button>' +
      '<button class="mini-btn" data-history-doc="' + d.id + '">Version History</button>' +
      '</div>';

    openModal("verifyModal");

    const resultBox = $("#verifyResultInline");
    resultBox.innerHTML = '<div class="muted-text small" style="margin-top:10px;">Calculating current fingerprint…</div>';
    setTimeout(function () {
      resultBox.innerHTML =
        '<div class="integrity-result ' + (d.integrityOk ? "ok" : "fail") + '">' +
          '<div class="ir-icon">' + (d.integrityOk ? iconCheck() : iconAlertTriangle()) + '</div>' +
          '<div><div class="ir-title">' + (d.integrityOk ? "✓ INTEGRITY VERIFIED" : "⚠ INTEGRITY FAILURE") + '</div>' +
          '<div class="ir-sub">' + (d.integrityOk ? "No modification detected." : "This document does not match its original registered fingerprint.") + '</div></div>' +
        '</div>';
      verificationHistory.unshift({ time: nowTimestamp(), doc: d.name, by: currentUser.name, result: d.integrityOk ? "VERIFIED" : "FAILURE" });
      addAudit("Verified Integrity", d.name, d.caseId, "SUCCESS");
    }, 650);

    $all('[data-share-doc="' + d.id + '"]', $("#verifyModal")).forEach(function (el) { el.onclick = function () { openShareModal(d.id); }; });
    $all('[data-history-doc="' + d.id + '"]', $("#verifyModal")).forEach(function (el) { el.onclick = function () { showVersionHistory(d.id); }; });
  }

  /* ------------------------------------------------------------------ */
  /* SHARE MODAL                                                          */
  /* ------------------------------------------------------------------ */

  let shareTargetDocId = null;

  function openShareModal(docId) {
    shareTargetDocId = docId;
    const sel = $("#shareUserSelect");
    sel.innerHTML = DB.users.filter(function (u) { return u.id !== currentUser.id && u.status === "Active"; }).map(function (u) {
      return '<option value="' + u.id + '">' + escapeHtml(u.name) + ' — ' + roleLabel(u.role) + '</option>';
    }).join("");
    $("#shareResultArea").innerHTML = "";
    $("#shareExpiry").value = "";
    $("#shareReason").value = "";
    openModal("shareModal");
  }

  function confirmShare() {
    const d = DB.documents.find(function (x) { return x.id === shareTargetDocId; });
    const user = DB.users.find(function (x) { return x.id === $("#shareUserSelect").value; });
    if (!d || !user) return;
    const perm = $("#sharePermission").value;
    const expiry = $("#shareExpiry").value || "No expiry set";
    const reason = $("#shareReason").value || "Not specified";

    d.access = d.access || [];
    d.access.push({ user: user.name, role: roleLabel(user.role), perm: perm });
    saveState();

    addAudit("Shared document with " + user.name + " (" + perm + ")", d.name, d.caseId, "SUCCESS");

    $("#shareResultArea").innerHTML =
      '<div class="upload-success-box"><div class="us-title">✓ Document shared</div>' +
      '<p class="muted-text small">Shared with: <strong style="color:var(--ink-900);">' + escapeHtml(user.name) + '</strong></p>' +
      '<p class="muted-text small">Permission: ' + perm + '</p>' +
      '<p class="muted-text small">Expires: ' + expiry + '</p>' +
      '<p class="muted-text small">Reason: ' + escapeHtml(reason) + '</p></div>';

    toast("Document shared", d.name + " shared with " + user.name, "success");
    renderDocuments();
  }

  /* ------------------------------------------------------------------ */
  /* UPLOAD MODAL                                                         */
  /* ------------------------------------------------------------------ */

  function openUploadModal() {
    const caseSel = $("#uploadCaseId");
    caseSel.innerHTML = DB.cases.map(function (c) { return '<option value="' + c.id + '">' + c.id + ' — ' + escapeHtml(c.title) + '</option>'; }).join("");
    $("#uploadDocName").value = "";
    $("#uploadDesc").value = "";
    $("#selectedFileInfo").classList.add("hidden");
    $("#selectedFileInfo").innerHTML = "";
    $("#uploadProgressArea").classList.add("hidden");
    $("#uploadProgressBar").style.width = "0%";
    $("#uploadResultArea").innerHTML = "";
    uploadedFileMeta = null;
    $("#fileInput").value = "";
    openModal("uploadModal");
  }

  function handleFileSelected(file) {
    if (!file) return;
    uploadedFileMeta = file;
    $("#selectedFileInfo").classList.remove("hidden");
    $("#selectedFileInfo").innerHTML = '<span>' + escapeHtml(file.name) + ' · ' + (file.size / 1024).toFixed(1) + ' KB</span><button class="mini-btn" id="clearFileBtn">Remove</button>';
    if (!$("#uploadDocName").value) $("#uploadDocName").value = file.name;
    $("#clearFileBtn").onclick = function (e) {
      e.stopPropagation();
      uploadedFileMeta = null;
      $("#selectedFileInfo").classList.add("hidden");
      $("#fileInput").value = "";
    };
  }

  async function confirmUpload() {
    const name = $("#uploadDocName").value.trim();
    const caseId = $("#uploadCaseId").value;
    const type = $("#uploadDocType").value;
    const classification = $("#uploadClassification").value;

    if (!name) { toast("Missing information", "Please enter a document name.", "error"); return; }
    if (!uploadedFileMeta) { toast("Missing file", "Please select a file to upload.", "error"); return; }

    $("#uploadProgressArea").classList.remove("hidden");
    $("#uploadResultArea").innerHTML = "";
    const bar = $("#uploadProgressBar");
    bar.style.width = "15%";

    let hash;
    try {
      bar.style.width = "55%";
      hash = await sha256Hex(uploadedFileMeta);
      bar.style.width = "90%";
    } catch (err) {
      toast("Upload failed", "Could not process the file.", "error");
      $("#uploadProgressArea").classList.add("hidden");
      return;
    }

    await new Promise(function (r) { setTimeout(r, 350); });
    bar.style.width = "100%";

    const newDoc = {
      id: "d" + (Date.now()), name: name, caseId: caseId, type: type, uploadedBy: currentUser.name,
      date: nowTimestamp().split(",")[0], classification: classification, currentVersion: "1.0",
      hash: hash, integrityOk: true,
      versions: [{ version: "1.0", date: nowTimestamp(), hash: hash, by: currentUser.name }],
      access: [{ user: currentUser.name, role: roleLabel(currentUser.role), perm: "READ + WRITE" }]
    };
    DB.documents.unshift(newDoc);
    saveState();
    addAudit("Uploaded", newDoc.name, newDoc.caseId, "SUCCESS");
    addAlert("info", "Document integrity verified", newDoc.name + " was registered and passed initial SHA-256 verification.");

    $("#uploadResultArea").innerHTML =
      '<div class="upload-success-box"><div class="us-title">✓ Document uploaded successfully</div>' +
      '<div class="h-lbl">SHA-256</div><div class="h-val">' + hash + '</div>' +
      '<p class="muted-text small" style="margin-top:8px;">Integrity Status: <strong style="color:#0b6b3a;">VERIFIED</strong></p></div>';

    toast("Upload complete", newDoc.name + " registered with a verified SHA-256 fingerprint.", "success");
    renderDocuments();
    if (activeSection === "dashboard") renderDashboard();
  }

  /* ------------------------------------------------------------------ */
  /* NEW CASE MODAL                                                       */
  /* ------------------------------------------------------------------ */

  function openNewCaseModal() {
    $("#newCaseTitle").value = "";
    $("#newCaseDesc").value = "";
    openModal("newCaseModal");
  }

  function confirmNewCase() {
    const title = $("#newCaseTitle").value.trim();
    if (!title) { toast("Missing information", "Please enter a case title.", "error"); return; }
    const nextNum = (DB.cases.length + 1).toString().padStart(3, "0");
    const id = "CASE-2026-" + nextNum;
    const newCase = {
      id: id, title: title, type: $("#newCaseType").value, status: $("#newCaseStatus").value,
      priority: $("#newCasePriority").value, investigator: currentUser.name,
      created: nowTimestamp().split(",")[0], updated: "Just now",
      description: $("#newCaseDesc").value.trim() || "No description provided."
    };
    DB.cases.unshift(newCase);
    saveState();
    addAudit("Created case " + id, "—", id, "SUCCESS");
    toast("Case created", id + " has been created.", "success");
    closeModals();
    renderCases();
    if (activeSection === "dashboard") renderDashboard();
  }

  /* ------------------------------------------------------------------ */
  /* ADD USER MODAL (admin-created accounts are Active immediately)       */
  /* ------------------------------------------------------------------ */

  function suggestEmployeeId(role) {
    const prefix = "UP-" + roleDeptCode(role) + "-";
    const existingSerials = DB.users
      .filter(function (u) { return u.role === role && u.employeeId && u.employeeId.indexOf(prefix) === 0; })
      .map(function (u) { return parseInt(u.employeeId.slice(prefix.length), 10); })
      .filter(function (n) { return !isNaN(n); });
    const base = role === "admin" ? 1 : role === "judge" ? 231 : 1042;
    const next = existingSerials.length ? Math.max.apply(null, existingSerials) + 1 : base;
    return prefix + String(next).padStart(4, "0");
  }

  function openAddUserModal() {
    $("#newUserName").value = "";
    $("#newUserRole").value = "officer";
    $("#newUserEmpId").value = "";
    $("#newUserEmpId").placeholder = suggestEmployeeId("officer");
    openModal("addUserModal");
  }

  function confirmAddUser() {
    const name = $("#newUserName").value.trim();
    const role = $("#newUserRole").value;
    let empId = normalizeId($("#newUserEmpId").value);
    if (!name) { toast("Missing information", "Please enter a name.", "error"); return; }
    if (!empId) empId = suggestEmployeeId(role);
    if (DB.users.some(function (u) { return u.employeeId === empId; })) {
      toast("Duplicate Employee ID", "A user with this Employee ID already exists.", "error"); return;
    }
    const newUser = { id: "u" + Date.now(), name: name, employeeId: empId, password: "demo123", role: role, status: "Active", lastLogin: "Never" };
    DB.users.push(newUser);
    saveState();
    addAudit("Added user " + name + " (" + empId + ")", "—", "—", "SUCCESS");
    toast("User added", name + " has been added as " + roleLabel(newUser.role) + " with ID " + empId + ".", "success");
    closeModals();
    renderUsers();
  }

  /* ------------------------------------------------------------------ */
  /* EVENT WIRING                                                         */
  /* ------------------------------------------------------------------ */

  function wireEvents() {
    initTabs();
    initPasswordToggles();
    initLoginForm();
    initSignupForm();

    $all("[data-scan-target]").forEach(function (btn) {
      btn.addEventListener("click", function () { openQrScanModal(btn.getAttribute("data-scan-target")); });
    });
    $("#viewIdCardsBtn").addEventListener("click", function () { renderIdCardModal(); openModal("idCardModal"); });

    // Sidebar nav
    $all(".nav-item").forEach(function (btn) { btn.addEventListener("click", function () { goToSection(btn.getAttribute("data-section")); }); });
    $("#sidebarToggle").addEventListener("click", function () {
      $("#sidebar").classList.toggle("open");
      $("#sidebarBackdrop").classList.toggle("hidden");
    });
    $("#sidebarBackdrop").addEventListener("click", function () {
      $("#sidebar").classList.remove("open");
      $("#sidebarBackdrop").classList.add("hidden");
    });

    // Top bar
    $("#userMenuBtn").addEventListener("click", function () { $("#userMenu").classList.toggle("hidden"); });
    $("#logoutBtn").addEventListener("click", function () { $("#userMenu").classList.add("hidden"); doLogout(); });
    $("#notifBtn").addEventListener("click", function () { $("#notifPanel").classList.toggle("hidden"); });

    document.addEventListener("click", function (e) {
      if (!$("#userMenuBtn").contains(e.target) && !$("#userMenu").contains(e.target)) $("#userMenu").classList.add("hidden");
      if (!$("#notifBtn").contains(e.target) && !$("#notifPanel").contains(e.target)) $("#notifPanel").classList.add("hidden");
      if (!$(".topbar-search").contains(e.target)) $("#searchResults").classList.add("hidden");
    });

    $("#globalSearch").addEventListener("input", function () { runGlobalSearch(this.value.trim()); });

    $all("[data-close-modal]").forEach(function (el) { el.addEventListener("click", closeModals); });
    $("#modalOverlay").addEventListener("click", function (e) { if (e.target === $("#modalOverlay")) closeModals(); });

    // Cases
    $("#newCaseBtn").addEventListener("click", openNewCaseModal);
    $("#confirmNewCaseBtn").addEventListener("click", confirmNewCase);
    $all("#caseFilterChips .chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        $all("#caseFilterChips .chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        caseFilter = chip.getAttribute("data-filter");
        renderCases();
      });
    });
    $("#caseSearch").addEventListener("input", function () { caseSearchTerm = this.value.trim(); renderCases(); });

    // Documents
    $("#uploadDocBtn").addEventListener("click", openUploadModal);
    $("#confirmUploadBtn").addEventListener("click", confirmUpload);
    $("#dropZone").addEventListener("click", function () { $("#fileInput").click(); });
    $("#fileInput").addEventListener("change", function () { handleFileSelected(this.files[0]); });
    $("#dropZone").addEventListener("dragover", function (e) { e.preventDefault(); this.classList.add("dragover"); });
    $("#dropZone").addEventListener("dragleave", function () { this.classList.remove("dragover"); });
    $("#dropZone").addEventListener("drop", function (e) {
      e.preventDefault(); this.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileSelected(e.dataTransfer.files[0]);
    });
    $all("#docTypeChips .chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        $all("#docTypeChips .chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        docTypeFilter = chip.getAttribute("data-doctype");
        renderDocuments();
      });
    });
    $("#docSearch").addEventListener("input", function () { docSearchTerm = this.value.trim(); renderDocuments(); });
    $("#confirmShareBtn").addEventListener("click", confirmShare);

    // Audit
    $all("#auditFilterChips .chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        $all("#auditFilterChips .chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        auditFilter = chip.getAttribute("data-audit-filter");
        renderAuditLogs();
      });
    });
    $("#auditSearch").addEventListener("input", function () { auditSearchTerm = this.value.trim(); renderAuditLogs(); });

    // Users
    $("#addUserBtn").addEventListener("click", openAddUserModal);
    $("#confirmAddUserBtn").addEventListener("click", confirmAddUser);
    $("#newUserRole").addEventListener("change", function () {
      if (!$("#newUserEmpId").value.trim()) $("#newUserEmpId").placeholder = suggestEmployeeId(this.value);
    });

    // Confirm modal
    $("#confirmModalOk").addEventListener("click", function () {
      if (pendingConfirmAction) pendingConfirmAction();
      pendingConfirmAction = null;
      closeModals();
    });

    // Settings
    $("#resetDataBtn").addEventListener("click", function () {
      confirmAction("Reset Demo Data", "This will restore all cases, documents, users and logs to their original demo state. Continue?", function () {
        resetState();
        toast("Demo data reset", "The prototype has been restored to its initial state.", "success");
        goToSection("dashboard");
      });
    });

    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModals(); });
  }

  /* ------------------------------------------------------------------ */
  /* INIT                                                                 */
  /* ------------------------------------------------------------------ */

  function init() {
    DB = loadState();
    wireEvents();
    // No persistent cross-reload session for security demo purposes —
    // always start at the login screen.
  }

  document.addEventListener("DOMContentLoaded", init);
})();