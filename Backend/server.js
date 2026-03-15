require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express  = require('express');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');

const app = express();
app.use(cors({ origin: '*' })); // tighten this in production
app.use(express.json());

// ── CONNECT TO MONGODB ──────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ── SCHEMAS ─────────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const SetsSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  data:      { type: Array, default: [] },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Sets = mongoose.model('Sets', SetsSchema);

// ── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── ROUTES ───────────────────────────────────────────────────────────────────

// Sign Up
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({ email, password: hashed });
    const token  = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({ token, user: { id: user._id, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Log In
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'No account found with that email' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Incorrect password' });

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get sets
app.get('/sets', authMiddleware, async (req, res) => {
  try {
    const doc = await Sets.findOne({ userId: req.user.id });
    res.json({ data: doc?.data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save sets
app.post('/sets', authMiddleware, async (req, res) => {
  try {
    await Sets.findOneAndUpdate(
      { userId: req.user.id },
      { data: req.body.data, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT, () =>
  console.log(`🚀 Server running on http://localhost:${process.env.PORT}`)
);