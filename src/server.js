// Express backend for Smart Funeral Claims Platform
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 5000;

// File upload setup
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Fallback root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// TODO: Add routes for claims, auth, admin, uploads

// Claim submission endpoint
app.post('/api/claims', upload.array('documents'), (req, res) => {
  const { policyNumber, claimantName, claimType } = req.body;
  const files = req.files;
  if (!policyNumber || !claimantName || !claimType || !files || files.length === 0) {
    return res.status(400).json({ error: 'All fields and documents are required.' });
  }
  // Here you would save claim details to a database
  // For now, just return a success response
  res.json({
    message: 'Claim submitted successfully',
    claim: {
      policyNumber,
      claimantName,
      claimType,
      documents: files.map(f => f.filename)
    }
  });
});

// ── Admin routes (Firebase Admin SDK) ────────────────────────
// Requires: npm install firebase-admin  in /src
// Set GOOGLE_APPLICATION_CREDENTIALS env var or place serviceAccountKey.json in /src

let adminAuth = null;
let adminFirestore = null;

try {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(keyPath)) {
      const serviceAccount = require('./serviceAccountKey.json');
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('[Admin SDK] Initialized with service account key');
    } else {
      // Fallback to application default credentials
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
      console.log('[Admin SDK] Initialized with application default credentials');
    }
  }
  adminAuth = admin.auth();
  adminFirestore = admin.firestore();
} catch (e) {
  console.warn('[Admin SDK] Not available — OTP and admin features disabled:', e.message);
}

// Simple admin-only middleware (check custom claim via ID token)
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  if (!adminAuth) {
    return res.status(503).json({ error: 'Admin SDK not configured' });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    if (!decoded.admin && !decoded.email?.includes('admin')) {
      return res.status(403).json({ error: 'Forbidden: admin only' });
    }
    req.adminUid = decoded.uid;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// DELETE a Firebase Auth user
app.post('/api/admin/delete-user', requireAdmin, async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'uid is required' });
  try {
    await adminAuth.deleteUser(uid);
    res.json({ success: true, uid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE claim status (admin override via backend)
app.post('/api/admin/set-claim-status', requireAdmin, async (req, res) => {
  const { claimId, status } = req.body;
  const allowed = ['pending', 'under_review', 'approved', 'rejected'];
  if (!claimId || !allowed.includes(status)) {
    return res.status(400).json({ error: 'claimId and valid status required' });
  }
  if (!adminFirestore) return res.status(503).json({ error: 'Admin SDK not configured' });
  try {
    await adminFirestore.collection('claims').doc(claimId).update({
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: req.adminUid
    });
    res.json({ success: true, claimId, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Email OTP (2-Factor Authentication) ──────────────────────

function createMailTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function otpEmailHtml(code, email) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f7ff;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(21,101,192,.12);">
    <div style="background:linear-gradient(90deg,#0d1f44,#1565c0);padding:28px 32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:1.4rem;letter-spacing:.02em;">Smart Funeral Claims</h1>
      <p style="color:#90caf9;margin:6px 0 0;font-size:.88rem;">Secure Login Verification</p>
    </div>
    <div style="padding:36px 32px;">
      <p style="color:#1a2744;font-size:1rem;margin:0 0 8px;">Hello,</p>
      <p style="color:#37474f;font-size:.95rem;margin:0 0 28px;">Use the code below to complete your login to <strong>${email}</strong>. This code expires in <strong>10 minutes</strong>.</p>
      <div style="text-align:center;margin:0 0 28px;">
        <div style="display:inline-block;background:#e3f2fd;border:2px dashed #1976d2;border-radius:14px;padding:18px 36px;">
          <span style="font-size:2.4rem;font-weight:900;letter-spacing:.35em;color:#1565c0;font-family:'Courier New',monospace;">${code}</span>
        </div>
      </div>
      <p style="color:#546e7a;font-size:.85rem;margin:0 0 6px;">⚠ Do not share this code with anyone.</p>
      <p style="color:#546e7a;font-size:.85rem;margin:0;">If you did not attempt to log in, please change your password immediately.</p>
    </div>
    <div style="background:#f0f7ff;padding:16px 32px;text-align:center;border-top:1px solid #dce8f5;">
      <p style="color:#90a4ae;font-size:.78rem;margin:0;">© ${new Date().getFullYear()} Smart Funeral Claims · Automated message — do not reply</p>
    </div>
  </div>
</body></html>`;
}

// POST /api/send-otp  — step 1: verify Firebase credentials, send OTP email
app.post('/api/send-otp', async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'idToken required' });
  if (!adminAuth || !adminFirestore) {
    return res.status(503).json({ error: 'OTP service not configured' });
  }
  if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your-email@gmail.com') {
    return res.status(503).json({ error: 'SMTP not configured' });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const { uid, email } = decoded;

    // Generate cryptographically random 6-digit code
    const code      = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min

    // Store in Firestore (only server-side Admin SDK can write here)
    await adminFirestore.collection('otpCodes').doc(uid).set({
      code, expiresAt, attempts: 0, email,
      createdAt: new Date().toISOString()
    });

    // Send email
    const transporter = createMailTransporter();
    await transporter.sendMail({
      from:    `"Smart Funeral Claims" <${process.env.SMTP_USER}>`,
      to:      email,
      subject: `${code} — Your login verification code`,
      html:    otpEmailHtml(code, email)
    });

    res.json({ success: true, uid });
  } catch (err) {
    console.error('[OTP send]', err.message);
    res.status(500).json({ error: 'Could not send verification code. Try again.' });
  }
});

// POST /api/verify-otp  — step 2: check code, return custom token
app.post('/api/verify-otp', async (req, res) => {
  const { uid, code } = req.body || {};
  if (!uid || !code) return res.status(400).json({ error: 'uid and code required' });
  if (!adminAuth || !adminFirestore) {
    return res.status(503).json({ error: 'OTP service not configured' });
  }

  try {
    const snap = await adminFirestore.collection('otpCodes').doc(uid).get();
    if (!snap.exists) {
      return res.status(400).json({ error: 'Code not found. Please log in again.' });
    }

    const data = snap.data();

    // Check expiry
    if (Date.now() > data.expiresAt) {
      await adminFirestore.collection('otpCodes').doc(uid).delete();
      return res.status(400).json({ error: 'Code expired. Please log in again.' });
    }

    // Check attempt limit (max 5)
    if (data.attempts >= 5) {
      await adminFirestore.collection('otpCodes').doc(uid).delete();
      return res.status(400).json({ error: 'Too many incorrect attempts. Please log in again.' });
    }

    // Verify code (constant-time compare to prevent timing attacks)
    const expected = Buffer.from(data.code.padEnd(10));
    const provided = Buffer.from(String(code).trim().padEnd(10));
    const match    = expected.length === provided.length &&
                     crypto.timingSafeEqual(expected, provided);

    if (!match) {
      const newAttempts = data.attempts + 1;
      await adminFirestore.collection('otpCodes').doc(uid).update({ attempts: newAttempts });
      const left = 5 - newAttempts;
      return res.status(400).json({
        error: `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} remaining.`
      });
    }

    // Success — delete OTP and return a custom Firebase token
    await adminFirestore.collection('otpCodes').doc(uid).delete();
    const customToken = await adminAuth.createCustomToken(uid);
    res.json({ success: true, customToken });
  } catch (err) {
    console.error('[OTP verify]', err.message);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// POST /api/resend-otp  — re-authenticate and resend
app.post('/api/resend-otp', async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'idToken required' });
  if (!adminAuth || !adminFirestore) {
    return res.status(503).json({ error: 'OTP service not configured' });
  }
  if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your-email@gmail.com') {
    return res.status(503).json({ error: 'SMTP not configured' });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const { uid, email } = decoded;

    // Rate-limit: don't allow resend if last code was sent < 60 s ago
    const existing = await adminFirestore.collection('otpCodes').doc(uid).get();
    if (existing.exists) {
      const ageMs = Date.now() - new Date(existing.data().createdAt).getTime();
      if (ageMs < 60_000) {
        return res.status(429).json({ error: 'Please wait before requesting a new code.' });
      }
    }

    const code      = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await adminFirestore.collection('otpCodes').doc(uid).set({
      code, expiresAt, attempts: 0, email,
      createdAt: new Date().toISOString()
    });

    const transporter = createMailTransporter();
    await transporter.sendMail({
      from:    `"Smart Funeral Claims" <${process.env.SMTP_USER}>`,
      to:      email,
      subject: `${code} — Your new login verification code`,
      html:    otpEmailHtml(code, email)
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[OTP resend]', err.message);
    res.status(500).json({ error: 'Could not resend code. Try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
