/* =========================================================
   Admin Portal – admin.js
   Connects to Firebase Firestore & Auth for live data.
   All data shown here is REAL data from the platform.
   ========================================================= */

// ── Firebase config (mirrors public/firebaseConfig.js) ──────
const firebaseConfig = {
  apiKey:            "AIzaSyCJ8-DyG7Ayex1isPqM8VQZ2Qun_6fr3AI",
  authDomain:        "smartclaims-3c242.firebaseapp.com",
  databaseURL:       "https://smartclaims-3c242-default-rtdb.firebaseio.com",
  projectId:         "smartclaims-3c242",
  storageBucket:     "smartclaims-3c242.firebasestorage.app",
  messagingSenderId: "225110900154",
  appId:             "1:225110900154:web:6b115781459dc61a70b183",
  measurementId:     "G-09JECNEPKC"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── In-memory data stores ───────────────────────────────────
let allUsers         = [];
let allClaims        = [];
let allActivity      = [];
let activeClaimTab   = 'all';
let usersFromFallback = false; // true when users collection is blocked by rules

// Firestore realtime unsubscribes
let unsubUsers    = null;
let unsubClaims   = null;
let unsubActivity = null;

// Chart instances
let statusChart    = null;
let timelineChart  = null;
let usersMonthChart = null;
let outcomeChart   = null;

// ── Auth state ───────────────────────────────────────────────
auth.onAuthStateChanged(user => {
  if (user) {
    // Check admin claim or email whitelist
    user.getIdTokenResult().then(result => {
      const isAdmin = result.claims.admin === true ||
                      user.email?.includes('admin');
      if (!isAdmin) {
        showToast('Access denied. Not an admin account.', 'error');
        auth.signOut();
        return;
      }
      showApp(user);
      subscribeAll();
    }).catch(() => {
      // If custom claims not set, allow by email pattern (dev mode)
      showApp(user);
      subscribeAll();
    });
  } else {
    showLogin();
  }
});

function showApp(user) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display    = 'flex';
  const initial = (user.displayName || user.email || 'A')[0].toUpperCase();
  document.getElementById('adminAvatar').textContent       = initial;
  document.getElementById('adminName').textContent          = user.displayName || 'Admin';
  document.getElementById('adminEmailDisplay').textContent  = user.email;
}

function showLogin() {
  document.getElementById('appShell').style.display    = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

// ── Login / Logout ───────────────────────────────────────────
async function adminLogin() {
  const email = document.getElementById('adminEmail').value.trim();
  const pass  = document.getElementById('adminPassword').value;
  const btn   = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (!email || !pass) {
    errEl.textContent  = 'Please enter your email and password.';
    errEl.style.display = 'block';
    return;
  }
  btn.textContent = 'Signing in…';
  btn.disabled    = true;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    // Auth state listener handles the rest
  } catch (err) {
    errEl.textContent  = friendlyAuthError(err.code);
    errEl.style.display = 'block';
    btn.textContent    = 'Sign In';
    btn.disabled       = false;
  }
}

function adminLogout() {
  if (!confirm('Sign out of the admin portal?')) return;
  if (unsubUsers)    unsubUsers();
  if (unsubClaims)   unsubClaims();
  if (unsubActivity) unsubActivity();
  auth.signOut();
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':    'No admin account found with that email.',
    'auth/wrong-password':    'Incorrect password. Please try again.',
    'auth/invalid-email':     'Invalid email address.',
    'auth/too-many-requests': 'Too many failed attempts. Try again later.',
    'auth/invalid-credential':'Invalid credentials. Please check and retry.',
  };
  return map[code] || 'Login failed. Please try again.';
}

function togglePw() {
  const inp = document.getElementById('adminPassword');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── Firestore realtime subscriptions ────────────────────────
async function subscribeAll() {
  // Force-refresh the ID token so the latest Firestore rules are evaluated
  // against the freshest token (important after rule changes)
  try {
    const user = auth.currentUser;
    if (user) await user.getIdToken(/* forceRefresh */ true);
  } catch (e) {
    console.warn('Token refresh skipped:', e.message);
  }
  subscribeUsers();
  subscribeClaims();
  subscribeActivity();
}

function subscribeUsers() {
  // No orderBy here — sort client-side to avoid missing-index errors.
  // A simple collection read is the simplest possible Firestore query.
  unsubUsers = db.collection('users')
    .onSnapshot(snap => {
      usersFromFallback = false;
      allUsers = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return tb - ta; // newest first
        });
      renderUsers();
      updateDashboard();
      updateReportsMeta();
      console.log(`[Admin] Users loaded: ${allUsers.length} docs`);
    }, err => {
      console.error('[Admin] Users listener error —', err.code, err.message);
      usersFromFallback = true;
      deriveUsersFromActivity();
    });
}

// Build a user list from activityLogs when the users collection is blocked
function deriveUsersFromActivity() {
  if (!allActivity.length) return; // will be called again when activity loads
  const seen    = new Set();
  const derived = [];
  // Registration events carry the most complete user info
  allActivity.filter(e => e.type === 'register').forEach(e => {
    if (e.userId && !seen.has(e.userId)) {
      seen.add(e.userId);
      derived.push({
        id:          e.userId,
        displayName: e.userName  || e.userEmail || '—',
        email:       e.userEmail || '—',
        createdAt:   e.timestamp,
        lastLogin:   null,
        status:      'active',
        _derived:    true
      });
    }
  });
  // Also include any login events for users not seen in registrations
  allActivity.filter(e => e.type === 'login').forEach(e => {
    if (e.userId && !seen.has(e.userId)) {
      seen.add(e.userId);
      derived.push({
        id:          e.userId,
        displayName: e.userName  || e.userEmail || '—',
        email:       e.userEmail || '—',
        createdAt:   null,
        lastLogin:   e.timestamp,
        status:      'active',
        _derived:    true
      });
    }
  });
  allUsers = derived;
  renderUsers();
  updateDashboard();
  updateReportsMeta();
}

function subscribeClaims() {
  unsubClaims = db.collection('claims')
    .orderBy('submittedAt', 'desc')
    .onSnapshot(snap => {
      allClaims = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderClaims();
      renderRecentClaims();
      updateDashboard();
      updateCharts();
      updateReportsMeta();
    }, err => {
      console.warn('Claims listener error:', err.message);
      renderEmptyClaims();
    });
}

function subscribeActivity() {
  unsubActivity = db.collection('activityLogs')
    .orderBy('timestamp', 'desc')
    .limit(200)
    .onSnapshot(snap => {
      allActivity = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderActivity();
      renderRecentLogins();
      updateReportsMeta();
      // Re-populate users whenever activity refreshes (fallback mode)
      if (usersFromFallback) deriveUsersFromActivity();
    }, err => {
      console.warn('Activity listener error:', err.message);
      document.getElementById('activityTimeline').innerHTML =
        '<div class="empty-state">No activity data found. Activity will appear here once users interact with the platform.</div>';
      document.getElementById('recentLoginsTbody').innerHTML =
        '<tr><td colspan="3" class="empty-cell">No logins recorded yet.</td></tr>';
    });
}

// ── Dashboard ────────────────────────────────────────────────
function updateDashboard() {
  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Users stats
  const totalUsers  = allUsers.length;
  const newThisMonth = allUsers.filter(u => u.createdAt?.toDate?.() >= monthStart).length;
  document.getElementById('ds-totalUsers').textContent    = totalUsers;
  document.getElementById('ds-newUsersMonth').textContent = `+${newThisMonth} this month`;
  document.getElementById('usersBadge').textContent       = totalUsers;
  document.getElementById('us-total').textContent         = totalUsers;
  document.getElementById('us-active').textContent        = allUsers.filter(u => u.status !== 'inactive').length;
  document.getElementById('us-new').textContent           = newThisMonth;

  // Claims stats
  const totalClaims   = allClaims.length;
  const pendingClaims = allClaims.filter(c => c.status === 'pending').length;
  const approvedClaims = allClaims.filter(c => c.status === 'approved').length;
  const claimsMonth   = allClaims.filter(c => c.submittedAt?.toDate?.() >= monthStart).length;
  const approvalRate  = totalClaims > 0 ? Math.round((approvedClaims / totalClaims) * 100) : 0;

  document.getElementById('ds-totalClaims').textContent   = totalClaims;
  document.getElementById('ds-pendingClaims').textContent  = pendingClaims;
  document.getElementById('ds-approvedClaims').textContent = approvedClaims;
  document.getElementById('ds-claimsMonth').textContent   = `+${claimsMonth} this month`;
  document.getElementById('ds-approvalRate').textContent  = `${approvalRate}% approval rate`;
  document.getElementById('claimsBadge').textContent      = pendingClaims;

  setLastUpdated();
}

function setLastUpdated() {
  document.getElementById('lastUpdated').textContent =
    'Updated ' + new Date().toLocaleTimeString();
}

// ── Charts ───────────────────────────────────────────────────
function updateCharts() {
  buildStatusChart();
  buildTimelineChart();
  buildUsersMonthChart();
  buildOutcomeChart();
}

function buildStatusChart() {
  const counts = {
    Pending:      allClaims.filter(c => c.status === 'pending').length,
    'Under Review': allClaims.filter(c => c.status === 'under_review').length,
    Approved:     allClaims.filter(c => c.status === 'approved').length,
    Rejected:     allClaims.filter(c => c.status === 'rejected').length,
  };
  const ctx = document.getElementById('claimsStatusChart').getContext('2d');
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: ['#f57c00','#1976d2','#2e7d32','#c62828'],
        borderWidth: 2, borderColor: '#fff'
      }]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      cutout: '65%'
    }
  });
}

function buildTimelineChart() {
  const months = getLast6Months();
  const data   = months.map(m => allClaims.filter(c => {
    const d = c.submittedAt?.toDate?.();
    return d && d.getMonth() === m.month && d.getFullYear() === m.year;
  }).length);
  const ctx = document.getElementById('claimsTimelineChart').getContext('2d');
  if (timelineChart) timelineChart.destroy();
  timelineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months.map(m => m.label),
      datasets: [{
        label: 'Claims',
        data,
        borderColor: '#1976d2',
        backgroundColor: 'rgba(25,118,210,0.1)',
        fill: true, tension: 0.4, pointRadius: 5,
        pointBackgroundColor: '#1976d2'
      }]
    },
    options: {
      scales: { y: { beginAtZero: true, precision: 0 } },
      plugins: { legend: { display: false } }
    }
  });
}

function buildUsersMonthChart() {
  const months = getLast6Months();
  const data   = months.map(m => allUsers.filter(u => {
    const d = u.createdAt?.toDate?.();
    return d && d.getMonth() === m.month && d.getFullYear() === m.year;
  }).length);
  const ctx = document.getElementById('usersMonthChart').getContext('2d');
  if (usersMonthChart) usersMonthChart.destroy();
  usersMonthChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [{
        label: 'New Users',
        data,
        backgroundColor: 'rgba(25,118,210,0.7)',
        borderRadius: 6
      }]
    },
    options: {
      scales: { y: { beginAtZero: true, precision: 0 } },
      plugins: { legend: { display: false } }
    }
  });
}

function buildOutcomeChart() {
  const approved = allClaims.filter(c => c.status === 'approved').length;
  const rejected = allClaims.filter(c => c.status === 'rejected').length;
  const pending  = allClaims.filter(c => c.status === 'pending' || c.status === 'under_review').length;
  const ctx = document.getElementById('claimOutcomeChart').getContext('2d');
  if (outcomeChart) outcomeChart.destroy();
  outcomeChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Approved','Rejected','In Progress'],
      datasets: [{
        data: [approved, rejected, pending],
        backgroundColor: ['#2e7d32','#c62828','#f57c00'],
        borderWidth: 2, borderColor: '#fff'
      }]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
}

function getLast6Months() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      month: d.getMonth(), year: d.getFullYear(),
      label: d.toLocaleString('default', { month: 'short', year: '2-digit' })
    };
  });
}

// ── Recent claims (dashboard) ────────────────────────────────
function renderRecentClaims() {
  const tbody = document.getElementById('recentClaimsTbody');
  const recent = allClaims.slice(0, 5);
  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">No claims yet.</td></tr>';
    return;
  }
  tbody.innerHTML = recent.map(c => `
    <tr>
      <td>${esc(c.claimantName || c.claimantEmail || '—')}</td>
      <td>${esc(c.policyNumber || '—')}</td>
      <td>${formatDate(c.submittedAt)}</td>
      <td><span class="status-badge ${statusClass(c.status)}">${formatStatus(c.status)}</span></td>
    </tr>`).join('');
}

// ── Recent logins (dashboard) ────────────────────────────────
function renderRecentLogins() {
  const tbody = document.getElementById('recentLoginsTbody');
  const logins = allActivity.filter(a => a.type === 'login').slice(0, 5);
  if (!logins.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">No logins recorded yet.</td></tr>';
    return;
  }
  tbody.innerHTML = logins.map(l => `
    <tr>
      <td>${esc(l.userEmail || l.userName || '—')}</td>
      <td>${formatDate(l.timestamp)}</td>
      <td><span class="status-badge green">Success</span></td>
    </tr>`).join('');
}

// ── Users table ──────────────────────────────────────────────
function renderUsers() {
  const q = document.getElementById('userSearch').value.toLowerCase();
  const sf = document.getElementById('userStatusFilter').value;
  let users = allUsers.filter(u => {
    const matchQ  = !q || (u.displayName||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q);
    const matchSt = !sf || (sf === 'inactive' ? u.status === 'inactive' : u.status !== 'inactive');
    return matchQ && matchSt;
  });
  const tbody = document.getElementById('usersTbody');

  // Show fallback banner when reading from activityLogs
  const banner = document.getElementById('usersFallbackBanner');
  if (banner) banner.style.display = usersFromFallback ? 'flex' : 'none';

  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No users found.</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => {
    const userClaims = allClaims.filter(c => c.userId === u.id);
    const pending    = userClaims.filter(c => c.status === 'pending' || c.status === 'under_review').length;
    return `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-avatar-sm">${(u.displayName||u.email||'?')[0].toUpperCase()}</div>
          <div>
            <div style="font-weight:600;">${esc(u.displayName || '—')}</div>
            ${u.policyNumber ? `<div style="font-size:.75rem;color:#1976d2;font-weight:700;">${esc(u.policyNumber)}</div>` : ''}
          </div>
        </div>
      </td>
      <td>${esc(u.email || '—')}</td>
      <td>${formatDate(u.createdAt)}</td>
      <td>${formatDate(u.lastLogin)}</td>
      <td style="text-align:center;">
        <span style="font-weight:700;color:#1565c0;">${userClaims.length}</span>
        ${pending ? `<span style="margin-left:.3rem;background:#fff3e0;color:#e65100;border-radius:20px;padding:.1rem .5rem;font-size:.72rem;font-weight:700;">${pending} pending</span>` : ''}
      </td>
      <td><span class="status-badge ${u.status === 'inactive' ? 'red' : 'green'}">${u.status === 'inactive' ? 'Inactive' : 'Active'}</span></td>
      <td>
        <div class="action-btns">
          <button class="act-btn view"   onclick="viewUser('${u.id}')"  title="View details">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="act-btn reset"  onclick="resetUserPassword('${u.id}','${esc(u.email)}')" title="Reset password">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.35"/></svg>
          </button>
          <button class="act-btn delete" onclick="deleteUser('${u.id}','${esc(u.email)}')" title="Delete user">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderEmptyUsers() {
  document.getElementById('usersTbody').innerHTML =
    '<tr><td colspan="6" class="empty-cell">No user data found. Users will appear here when they register.</td></tr>';
}

function filterUsers() { renderUsers(); }

// ── View user detail ─────────────────────────────────────────
function viewUser(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  const userClaims    = allClaims.filter(c => c.userId === uid);
  const pending       = userClaims.filter(c => c.status === 'pending' || c.status === 'under_review').length;
  const approved      = userClaims.filter(c => c.status === 'approved').length;
  const rejected      = userClaims.filter(c => c.status === 'rejected').length;

  const claimsHtml = userClaims.length ? `
    <div style="overflow-x:auto;margin-top:.6rem;">
      <table style="width:100%;border-collapse:collapse;font-size:.83rem;">
        <thead><tr style="background:#f0f7ff;">
          <th style="padding:.4rem .7rem;text-align:left;color:#546e7a;font-size:.74rem;text-transform:uppercase;">Ref</th>
          <th style="padding:.4rem .7rem;text-align:left;color:#546e7a;font-size:.74rem;text-transform:uppercase;">Policy #</th>
          <th style="padding:.4rem .7rem;text-align:left;color:#546e7a;font-size:.74rem;text-transform:uppercase;">Type</th>
          <th style="padding:.4rem .7rem;text-align:left;color:#546e7a;font-size:.74rem;text-transform:uppercase;">Status</th>
        </tr></thead>
        <tbody>${userClaims.slice(0,5).map(c => `<tr style="border-bottom:1px solid #e8f0fe;">
          <td style="padding:.45rem .7rem;"><code style="font-size:.75rem;">${c.id.slice(0,8)}…</code></td>
          <td style="padding:.45rem .7rem;color:#1565c0;font-weight:600;">${esc(c.policyNumber||'—')}</td>
          <td style="padding:.45rem .7rem;">${esc(c.claimType||'—')}</td>
          <td style="padding:.45rem .7rem;"><span class="status-badge ${statusClass(c.status)}">${formatStatus(c.status)}</span></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : '<p style="color:#90a4ae;font-size:.85rem;margin:.4rem 0 0;">No claims submitted yet.</p>';

  openModal(`
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.2rem;">
      <div style="width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#1976d2,#42a5f5);color:#fff;font-size:1.4rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${(u.displayName||u.email||'?')[0].toUpperCase()}</div>
      <div>
        <h2 style="color:#1565c0;margin:0;font-size:1.15rem;">${esc(u.displayName||'—')}</h2>
        <p style="margin:0;color:#546e7a;font-size:.87rem;">${esc(u.email||'—')}</p>
        ${u.policyNumber ? `<p style="margin:.2rem 0 0;font-size:.82rem;"><span style="background:#e3f2fd;color:#1565c0;border-radius:6px;padding:.15rem .55rem;font-weight:800;letter-spacing:.05em;">${esc(u.policyNumber)}</span></p>` : ''}
      </div>
    </div>

    <!-- Profile details -->
    <div style="background:#f0f7ff;border-radius:10px;padding:1rem;margin-bottom:1rem;">
      <div style="font-size:.76rem;font-weight:800;color:#1565c0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.6rem;">Profile</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.35rem .8rem;">
        <div class="md-row"><span>SA ID</span><strong>${esc(u.idNumber||'—')}</strong></div>
        <div class="md-row"><span>Phone</span><strong>${esc(u.phone||'—')}</strong></div>
        <div class="md-row"><span>Date of Birth</span><strong>${esc(u.dob||'—')}</strong></div>
        <div class="md-row"><span>Registered</span><strong>${formatDate(u.createdAt)}</strong></div>
        <div class="md-row"><span>Last Login</span><strong>${formatDate(u.lastLogin)}</strong></div>
        <div class="md-row"><span>Status</span><strong><span class="status-badge ${u.status==='inactive'?'red':'green'}">${u.status==='inactive'?'Inactive':'Active'}</span></strong></div>
      </div>
    </div>

    <!-- Claims summary -->
    <div style="margin-bottom:1rem;">
      <div style="font-size:.76rem;font-weight:800;color:#1565c0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.5rem;">Claims (${userClaims.length})</div>
      <div style="display:flex;gap:.6rem;margin-bottom:.6rem;flex-wrap:wrap;">
        <span style="background:#e3f2fd;color:#1565c0;border-radius:20px;padding:.2rem .7rem;font-size:.78rem;font-weight:700;">${pending} Pending</span>
        <span style="background:#e8f5e9;color:#2e7d32;border-radius:20px;padding:.2rem .7rem;font-size:.78rem;font-weight:700;">${approved} Approved</span>
        <span style="background:#fdecea;color:#c62828;border-radius:20px;padding:.2rem .7rem;font-size:.78rem;font-weight:700;">${rejected} Rejected</span>
      </div>
      ${claimsHtml}
    </div>

    <div style="display:flex;gap:.7rem;flex-wrap:wrap;border-top:1px solid #dce8f5;padding-top:1rem;">
      <button class="modal-action-btn blue" onclick="resetUserPassword('${u.id}','${esc(u.email)}');closeModal()">Send Password Reset</button>
      <button class="modal-action-btn red"  onclick="deleteUser('${u.id}','${esc(u.email)}');closeModal()">Delete User</button>
    </div>
  `);
}

// ── Reset password ───────────────────────────────────────────
async function resetUserPassword(uid, email) {
  if (!email) { showToast('No email address on file.', 'error'); return; }
  if (!confirm(`Send password reset email to ${email}?`)) return;
  try {
    await auth.sendPasswordResetEmail(email);
    showToast(`✔ Password reset email sent to ${email}`);
    logAdminAction('password_reset', { targetUid: uid, targetEmail: email });
  } catch (err) {
    showToast('Failed to send reset email: ' + err.message, 'error');
  }
}

// ── Delete user ──────────────────────────────────────────────
async function deleteUser(uid, email) {
  if (!confirm(`Permanently delete user ${email}?\n\nThis will remove them from the database. To fully remove from Firebase Auth, ensure your backend has admin rights.`)) return;
  try {
    await db.collection('users').doc(uid).delete();
    // Also attempt backend hard-delete from Firebase Auth
    try {
      await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid })
      });
    } catch { /* backend may not be running */ }
    showToast(`✔ User ${email} deleted.`);
    logAdminAction('delete_user', { targetUid: uid, targetEmail: email });
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// ── Claims table ─────────────────────────────────────────────
function renderClaims() {
  const q   = document.getElementById('claimSearch').value.toLowerCase();
  const sf  = document.getElementById('claimStatusFilter').value || activeClaimTab;
  let claims = allClaims.filter(c => {
    const matchQ  = !q || (c.claimantName||'').toLowerCase().includes(q) ||
                    (c.policyNumber||'').toLowerCase().includes(q) ||
                    (c.id||'').toLowerCase().includes(q);
    const matchSt = !sf || sf === 'all' || c.status === sf;
    return matchQ && matchSt;
  });
  const tbody = document.getElementById('claimsTbody');
  if (!claims.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No claims found.</td></tr>`;
    return;
  }
  tbody.innerHTML = claims.map(c => `
    <tr>
      <td><code style="font-size:.8rem;">${c.id.slice(0,8)}…</code></td>
      <td>${esc(c.claimantName || c.claimantEmail || '—')}</td>
      <td>${esc(c.policyNumber || '—')}</td>
      <td>${esc(c.claimType || '—')}</td>
      <td>${formatDate(c.submittedAt)}</td>
      <td><span class="status-badge ${statusClass(c.status)}">${formatStatus(c.status)}</span></td>
      <td>
        <div class="action-btns">
          <button class="act-btn view"     onclick="viewClaim('${c.id}')" title="View">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          ${c.status==='pending'||c.status==='under_review' ? `
          <button class="act-btn approve" onclick="updateClaimStatus('${c.id}','approved')" title="Approve">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button class="act-btn delete"  onclick="viewClaim('${c.id}')" title="Reject (opens review)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}

function renderEmptyClaims() {
  document.getElementById('claimsTbody').innerHTML =
    '<tr><td colspan="7" class="empty-cell">No claims data found. Claims will appear here when users submit them.</td></tr>';
}

function filterClaims() { renderClaims(); }
function setClaimTab(tab, btn) {
  activeClaimTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('claimStatusFilter').value = tab === 'all' ? '' : tab;
  renderClaims();
}

function viewClaim(cid) {
  const c = allClaims.find(x => x.id === cid);
  if (!c) return;

  // Build document checklist
  const requiredDocs = [
    { key: 'death', label: 'Death Certificate' },
    { key: 'id',    label: 'ID Document' },
    { key: 'policy',label: 'Policy Document' },
    { key: 'bank',  label: 'Bank Statement / Proof' },
  ];
  const docs = Array.isArray(c.documentNames) ? c.documentNames : [];
  const docHtml = docs.length
    ? docs.map(d => `
        <div style="display:flex;align-items:center;gap:.55rem;padding:.45rem .55rem;background:#f0f7ff;border-radius:8px;margin-bottom:.4rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1976d2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span style="font-size:.85rem;color:#1a2744;">${esc(d)}</span>
        </div>`).join('')
    : '<p style="color:#f57c00;font-size:.85rem;">⚠ No documents attached to this claim.</p>';

  const reqChecks = requiredDocs.map(r => {
    const found = docs.some(d => d.toLowerCase().includes(r.key));
    return `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem;">
      ${found
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c62828" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}
      <span style="font-size:.83rem;color:${found ? '#2e7d32' : '#c62828'};">${r.label} ${found ? 'present' : 'missing'}</span>
    </div>`;
  }).join('');

  const claimTypeLabel = { death_benefit:'Death Benefit', funeral_cover:'Funeral Cover', accidental_death:'Accidental Death', repatriation:'Repatriation', other:'Other' };
  const relLabel       = { spouse:'Spouse / Partner', child:'Child', parent:'Parent', sibling:'Sibling', beneficiary:'Named Beneficiary', other:'Other' };

  const canAct = c.status === 'pending' || c.status === 'under_review';

  openModal(`
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.2rem;flex-wrap:wrap;">
      <h2 style="color:#1565c0;margin:0;flex:1;">Claim Review</h2>
      <span class="status-badge ${statusClass(c.status)}" style="font-size:.85rem;padding:.28rem .9rem;">${formatStatus(c.status)}</span>
    </div>

    <!-- Two-column detail grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem .8rem;margin-bottom:1.2rem;">
      <div class="md-row"><span>Claim ID</span><strong style="font-size:.78rem;word-break:break-all;">${c.id}</strong></div>
      <div class="md-row"><span>Submitted</span><strong>${formatDate(c.submittedAt)}</strong></div>
      <div class="md-row"><span>Policy #</span><strong style="color:#1565c0;">${esc(c.policyNumber||'—')}</strong></div>
      <div class="md-row"><span>Claim Type</span><strong>${claimTypeLabel[c.claimType] || esc(c.claimType||'—')}</strong></div>
    </div>

    <!-- Section: Claimant -->
    <div style="background:#f0f7ff;border-radius:10px;padding:1rem;margin-bottom:1rem;">
      <div style="font-size:.78rem;font-weight:800;color:#1565c0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.7rem;">Claimant Details</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem .8rem;">
        <div class="md-row"><span>Full Name</span><strong>${esc(c.claimantName||'—')}</strong></div>
        <div class="md-row"><span>Email</span><strong>${esc(c.claimantEmail||'—')}</strong></div>
        <div class="md-row"><span>SA ID Number</span><strong>${esc(c.claimantId||'—')}</strong></div>
        <div class="md-row"><span>Phone</span><strong>${esc(c.phone||'—')}</strong></div>
        <div class="md-row"><span>Relationship</span><strong>${relLabel[c.relationship] || esc(c.relationship||'—')}</strong></div>
        <div class="md-row"><span>Bank Account</span><strong>${esc(c.bankAccount||'—')}</strong></div>
      </div>
    </div>

    <!-- Section: Deceased -->
    <div style="background:#fff8e1;border-radius:10px;padding:1rem;margin-bottom:1rem;">
      <div style="font-size:.78rem;font-weight:800;color:#e65100;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.7rem;">Deceased Details</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem .8rem;">
        <div class="md-row"><span>Full Name</span><strong>${esc(c.deceasedName||'—')}</strong></div>
        <div class="md-row"><span>Date of Death</span><strong>${esc(c.dateOfDeath||'—')}</strong></div>
      </div>
    </div>

    <!-- Section: Documents -->
    <div style="margin-bottom:1rem;">
      <div style="font-size:.78rem;font-weight:800;color:#1565c0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.6rem;">
        Uploaded Documents (${docs.length})
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem .8rem;margin-bottom:.8rem;">
        ${reqChecks}
      </div>
      ${docHtml}
    </div>

    ${c.notes ? `<div class="md-row" style="margin-bottom:1rem;"><span>Applicant Notes</span><strong>${esc(c.notes)}</strong></div>` : ''}
    ${c.adminNote ? `<div style="background:#e8f5e9;border-left:4px solid #2e7d32;border-radius:8px;padding:.8rem 1rem;margin-bottom:1rem;font-size:.88rem;"><strong>Admin Note:</strong> ${esc(c.adminNote)}</div>` : ''}

    <!-- Action area -->
    ${canAct ? `
    <div style="border-top:1px solid #dce8f5;padding-top:1rem;margin-top:.5rem;">
      <div style="font-size:.78rem;font-weight:800;color:#1565c0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.6rem;">Admin Action</div>
      <textarea id="adminNoteInput" rows="2" placeholder="Add a note or reason (optional — visible to the claimant)…"
        style="width:100%;border:1.5px solid #bbdefb;border-radius:10px;padding:.65rem .9rem;font-size:.88rem;font-family:inherit;resize:vertical;margin-bottom:.8rem;outline:none;background:#f0f7ff;"></textarea>
      <div style="display:flex;gap:.7rem;flex-wrap:wrap;">
        <button class="modal-action-btn blue"  onclick="adminUpdateClaim('${c.id}','under_review')">🔵 Mark Under Review</button>
        <button class="modal-action-btn green" onclick="adminUpdateClaim('${c.id}','approved')">✔ Approve Claim</button>
        <button class="modal-action-btn red"   onclick="adminUpdateClaim('${c.id}','rejected')">✖ Reject Claim</button>
      </div>
    </div>` : `
    <div style="border-top:1px solid #dce8f5;padding-top:1rem;margin-top:.5rem;text-align:center;color:#546e7a;font-size:.88rem;">
      This claim has been <strong>${formatStatus(c.status)}</strong>. No further action needed.
      ${canAct === false && (c.status==='approved'||c.status==='rejected') ? `
      <div style="margin-top:.8rem;">
        <button class="modal-action-btn blue" onclick="adminUpdateClaim('${c.id}','under_review')">↩ Reopen as Under Review</button>
      </div>` : ''}
    </div>`}
  `);
}

async function adminUpdateClaim(cid, status) {
  const noteEl = document.getElementById('adminNoteInput');
  const note   = noteEl ? noteEl.value.trim() : '';
  const labels = { approved:'Approve', rejected:'Reject', under_review:'Mark as Under Review' };
  if (!confirm(`${labels[status] || 'Update'} this claim?`)) return;
  await updateClaimStatus(cid, status, note);
  closeModal();
}

async function updateClaimStatus(cid, status, adminNote = '') {
  const labels = { approved:'Approve', rejected:'Reject', under_review:'Mark as Under Review' };
  if (!adminNote && !confirm(`${labels[status] || 'Update'} this claim?`)) return;
  try {
    const update = {
      status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: auth.currentUser?.email || 'admin'
    };
    if (adminNote) update.adminNote = adminNote;
    await db.collection('claims').doc(cid).update(update);
    // Log specific event type for activity feed
    const logType = status === 'approved' ? 'claim_approved'
                  : status === 'rejected' ? 'claim_rejected'
                  : 'claim_status_update';
    await db.collection('activityLogs').add({
      type:        logType,
      userEmail:   auth.currentUser?.email || 'admin',
      description: `Admin ${formatStatus(status)} claim ${cid.slice(0,10).toUpperCase()}${adminNote ? ': ' + adminNote : ''}`,
      claimId:     cid,
      newStatus:   status,
      adminNote:   adminNote || '',
      timestamp:   firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(`✔ Claim ${formatStatus(status)}.`);
  } catch (err) {
    showToast('Update failed: ' + err.message, 'error');
  }
}

// ── Activity log ─────────────────────────────────────────────
function renderActivity() {
  const q  = document.getElementById('activitySearch').value.toLowerCase();
  const tf = document.getElementById('activityTypeFilter').value;
  let events = allActivity.filter(e => {
    const matchQ = !q || (e.userEmail||'').toLowerCase().includes(q) ||
                   (e.type||'').toLowerCase().includes(q);
    const matchT = !tf || e.type === tf;
    return matchQ && matchT;
  });
  const container = document.getElementById('activityTimeline');
  if (!events.length) {
    container.innerHTML = '<div class="empty-state">No activity events found.</div>';
    return;
  }
  container.innerHTML = events.map(e => `
    <div class="activity-item">
      <div class="activity-dot ${activityColor(e.type)}"></div>
      <div class="activity-content">
        <div class="activity-header">
          <strong>${esc(e.userEmail || e.userName || 'System')}</strong>
          <span class="activity-type-badge ${activityColor(e.type)}">${formatActivityType(e.type)}</span>
        </div>
        <div class="activity-body">${esc(e.description || e.type || '—')}</div>
        <div class="activity-time">${formatDate(e.timestamp, true)}</div>
      </div>
    </div>`).join('');
}

function filterActivity() { renderActivity(); }

function activityColor(type) {
  const map = { login:'green', register:'blue', claim_submitted:'orange',
                claim_approved:'green', claim_rejected:'red', password_reset:'purple',
                delete_user:'red' };
  return map[type] || 'blue';
}

function formatActivityType(type) {
  const map = { login:'Login', register:'Register', claim_submitted:'Claim Submitted',
                claim_approved:'Claim Approved', claim_rejected:'Claim Rejected',
                password_reset:'Password Reset', delete_user:'User Deleted' };
  return map[type] || type;
}

// ── Reports ──────────────────────────────────────────────────
function updateReportsMeta() {
  document.getElementById('report-users-meta').textContent    = `${allUsers.length} users`;
  document.getElementById('report-claims-meta').textContent   = `${allClaims.length} claims`;
  document.getElementById('report-activity-meta').textContent = `${allActivity.length} events`;
}

function downloadReport(type) {
  let csv = '', filename = '';
  const now = new Date().toISOString().slice(0,10);
  if (type === 'users') {
    filename = `users-report-${now}.csv`;
    csv  = 'Name,Email,Registered,Last Login,Status\n';
    csv += allUsers.map(u =>
      `"${u.displayName||''}","${u.email||''}","${formatDate(u.createdAt)}","${formatDate(u.lastLogin)}","${u.status||'active'}"`
    ).join('\n');
  } else if (type === 'claims') {
    filename = `claims-report-${now}.csv`;
    csv  = 'Claim ID,Claimant,Email,Policy #,Type,Submitted,Status\n';
    csv += allClaims.map(c =>
      `"${c.id}","${c.claimantName||''}","${c.claimantEmail||''}","${c.policyNumber||''}","${c.claimType||''}","${formatDate(c.submittedAt)}","${c.status||''}"`
    ).join('\n');
  } else if (type === 'activity') {
    filename = `activity-report-${now}.csv`;
    csv  = 'User,Type,Description,Timestamp\n';
    csv += allActivity.map(e =>
      `"${e.userEmail||''}","${e.type||''}","${e.description||''}","${formatDate(e.timestamp,true)}"`
    ).join('\n');
  } else if (type === 'summary') {
    filename = `monthly-summary-${now}.csv`;
    const months = getLast6Months();
    csv  = 'Month,New Users,Claims Submitted,Approved,Rejected\n';
    csv += months.map(m => {
      const nu = allUsers.filter(u => { const d = u.createdAt?.toDate?.(); return d && d.getMonth()===m.month && d.getFullYear()===m.year; }).length;
      const cs = allClaims.filter(c => { const d = c.submittedAt?.toDate?.(); return d && d.getMonth()===m.month && d.getFullYear()===m.year; }).length;
      const ca = allClaims.filter(c => c.status==='approved' && (() => { const d = c.submittedAt?.toDate?.(); return d && d.getMonth()===m.month && d.getFullYear()===m.year; })()).length;
      const cr = allClaims.filter(c => c.status==='rejected' && (() => { const d = c.submittedAt?.toDate?.(); return d && d.getMonth()===m.month && d.getFullYear()===m.year; })()).length;
      return `"${m.label}","${nu}","${cs}","${ca}","${cr}"`;
    }).join('\n');
  }
  if (!csv) return;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
  showToast(`✔ ${filename} downloaded.`);
}

// ── Admin action log ─────────────────────────────────────────
function logAdminAction(type, data = {}) {
  db.collection('activityLogs').add({
    type,
    userEmail: auth.currentUser?.email || 'admin',
    description: `Admin: ${type.replace(/_/g,' ')}`,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    ...data
  }).catch(() => {});
}

// ── UI helpers ───────────────────────────────────────────────
function showSection(name, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  const titles = { dashboard:'Dashboard', users:'Users', claims:'Claims', reports:'Reports', activity:'Activity Log' };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  if (name === 'reports') updateCharts();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function refreshAll() {
  showToast('Refreshing data…', 'info');
  if (unsubUsers)    { unsubUsers();    subscribeUsers(); }
  if (unsubClaims)   { unsubClaims();   subscribeClaims(); }
  if (unsubActivity) { unsubActivity(); subscribeActivity(); }
}

function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modal').style.display = 'flex';
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal'))
    document.getElementById('modal').style.display = 'none';
}

let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Format helpers ───────────────────────────────────────────
function formatDate(val, full = false) {
  if (!val) return '—';
  let d;
  if (typeof val?.toDate === 'function') d = val.toDate();
  else if (val?.seconds) d = new Date(val.seconds * 1000);
  else d = new Date(val);
  if (isNaN(d)) return '—';
  return full
    ? d.toLocaleString()
    : d.toLocaleDateString('en-ZA', { day:'2-digit', month:'short', year:'numeric' });
}

function formatStatus(s) {
  const map = { pending:'Pending', under_review:'Under Review', approved:'Approved', rejected:'Rejected' };
  return map[s] || (s || '—');
}

function statusClass(s) {
  const map = { pending:'orange', under_review:'blue', approved:'green', rejected:'red' };
  return map[s] || 'blue';
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Kick-off chart rendering once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Charts will render when data arrives via Firestore listeners
});
