const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const pool = require('../db');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

let otpCache = {};

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) {
    console.warn('Unauthorized access attempt');
    return res.status(401).json({ message: 'Unauthorized' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Invalid token:', err.message);
      return res.status(403).json({ message: 'Forbidden' });
    }
    req.user = user;
    next();
  });
};

// reCAPTCHA Verification
const verifyRecaptcha = async (recaptchaResponse) => {
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaResponse}`;
  
  const response = await fetch(verifyUrl, { method: 'POST' });
  const data = await response.json();
  return data.success;
};

// Registration route
router.post('/register', [
  body('email')
    .isEmail().withMessage('Invalid email')
    .matches(/@gmail\.com$/).withMessage('Only Gmail accounts are allowed'),
  body('password')
    .isLength({ min: 8, max: 12 }).withMessage('Password must be 8-12 characters long')
    .matches(/[A-Z]/).withMessage('Password must include an uppercase letter')
    .matches(/[a-z]/).withMessage('Password must include a lowercase letter')
    .matches(/\d/).withMessage('Password must include a number')
    .matches(/[@$!%*?&#]/).withMessage('Password must include a special character'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error('Validation error:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, recaptchaResponse } = req.body;

  try {
    // Verify reCAPTCHA
    const captchaValid = await verifyRecaptcha(recaptchaResponse);
    if (!captchaValid) {
      return res.status(400).json({ message: 'reCAPTCHA verification failed' });
    }

    // Check if user already exists
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      console.warn(`Registration attempt with existing email: ${email}`);
      return res.status(400).json({ message: 'Email is already registered' });
    }

    // Generate OTP and save it to cache
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpCache[email] = { otp, password };
    console.log(`Generated OTP for ${email}: ${otp}`);

    // Send OTP via email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_EMAIL,
      to: email,
      subject: 'Your Registration OTP',
      text: `Your OTP is: ${otp}`,
    });

    console.log(`OTP email sent to ${email}`);
    res.json({ message: 'OTP sent to your email!' });

  } catch (error) {
    console.error('Error during registration process:', error.message);
    res.status(500).json({ message: 'Error during registration' });
  }
});

// Verify OTP and complete registration
router.post('/verify-otp', async (req, res) => {
  const { email, otp, password } = req.body;

  if (!otpCache[email] || otpCache[email].otp !== otp) {
    console.warn(`Invalid OTP attempt for ${email}`);
    return res.status(400).json({ message: 'Invalid OTP or OTP expired' });
  }

  try {
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2)',
      [email, hashedPassword]
    );

    delete otpCache[email];
    console.log(`User ${email} successfully registered.`);
    res.json({ message: 'Registration successful!' });

  } catch (error) {
    console.error('Error verifying OTP:', error.message);
    res.status(500).json({ message: 'Error verifying OTP' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  const { email, password, recaptchaResponse } = req.body;

  if (!email || !password) {
    console.warn('Login attempt with missing email or password');
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    // Verify reCAPTCHA
    const captchaValid = await verifyRecaptcha(recaptchaResponse);
    if (!captchaValid) {
      return res.status(400).json({ message: 'reCAPTCHA verification failed' });
    }

    // Check user credentials
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      console.warn(`Login attempt with unregistered email: ${email}`);
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    if (user.rows[0].password !== hashedPassword) {
      console.warn(`Invalid password attempt for email: ${email}`);
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ email: user.rows[0].email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log(`User ${email} logged in successfully`);
    res.json({ message: 'Login successful', token });

  } catch (error) {
    console.error('Error during login process:', error.message);
    res.status(500).json({ message: 'Error during login' });
  }
});

// Other routes remain unchanged
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    console.log(`Dashboard accessed by ${user.email}`);
    res.json({ message: `Welcome to the dashboard, ${user.email}!` });
  } catch (error) {
    console.error('Error accessing dashboard:', error.message);
    res.status(500).json({ message: 'Error accessing dashboard' });
  }
});

router.get('/users', authenticateToken, async (req, res) => {
  try {
    const users = await pool.query('SELECT id, email, created_at FROM users');
    console.log('Fetched users:', users.rows);
    res.json(users.rows);
  } catch (error) {
    console.error('Error fetching users:', error.message);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

module.exports = router;
