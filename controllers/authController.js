const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// @route   POST /api/auth/register
// @desc    Register a new user (admin or warga)
exports.register = async (req, res) => {
  const { username, password, role } = req.body;

  try {
    // 1. Validate inputs
    if (!username || !password || !role) {
      return res.status(400).json({ message: 'Please provide username, password, and role.' });
    }

    if (!['admin', 'warga'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be admin or warga.' });
    }

    // 2. Check if user already exists
    const [existingUsers] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Username already exists.' });
    }

    // 3. Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Insert into database
    await db.execute('INSERT INTO users (username, password, password_plain, role) VALUES (?, ?, ?, ?)', [
      username,
      hashedPassword,
      password,
      role
    ]);

    res.status(201).json({ message: 'User registered successfully!' });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

// @route   POST /api/auth/login
// @desc    Login user and return JWT
exports.login = async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. Validate inputs
    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide username and password.' });
    }

    // 2. Find user in database
    const [users] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(400).json({ message: 'Username Anda salah.' });
    }

    const user = users[0];

    // 3. Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Password Anda salah.' });
    }

    // 4. Create JWT Payload
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    // 5. Sign JWT
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1d' },
      (err, token) => {
        if (err) throw err;
        res.json({
          message: 'Login successful',
          token,
          user: payload
        });
      }
    );
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
};
