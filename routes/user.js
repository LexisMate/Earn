const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const pool = require('../db');
const crypto = require('crypto');

let otpCache = {};

// Registration route
router.post('/register', [
  body('email').isEmail().withMessage('Invalid email').matches(/@gmail\.com$/).withMessage('Only Gmail accounts are allowed'),
  body('password').isLength({ min: 8, max: 12 })
    .withMessage('Password must be 8-12 characters long')
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

  const { email, password } = req.body;

  try {
    // Check if user already exists
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      console.warn(`Registration attempt with existing email: ${email}`);
      return res.status(400).json({ message: 'Email is already registered' });
    }

    // Generate OTP and cache it
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpCache[email] = { otp, password }; // Temporarily save OTP and password
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
    console.error('Error during registration process:', error.message, error.stack);
    res.status(500).json({ message: 'Error during registration' });
  }
});

// Verify OTP route
router.post('/verify-otp', async (req, res) => {
  const { email, otp, password } = req.body;

  if (!otpCache[email] || otpCache[email].otp !== otp) {
    console.warn(`Invalid OTP attempt for ${email}`);
    return res.status(400).json({ message: 'Invalid OTP or OTP expired' });
  }

  try {
    // Hash the password
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    // Save user to the database
    await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2)',
      [email, hashedPassword]
    );

    // Clear OTP from cache
    delete otpCache[email];
    console.log(`User ${email} successfully registered.`);
    res.json({ message: 'Registration successful!' });
  } catch (error) {
    console.error('Error verifying OTP:', error.message, error.stack);
    res.status(500).json({ message: 'Error verifying OTP' });
  }
});
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    console.warn('Login attempt with missing email or password');
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    // Check if user exists
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      console.warn(`Login attempt with unregistered email: ${email}`);
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Validate password
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    if (user.rows[0].password !== hashedPassword) {
      console.warn(`Invalid password attempt for email: ${email}`);
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Successful login
    console.log(`User ${email} logged in successfully`);
    res.json({ message: 'Login successful' });
  } catch (error) {
    console.error('Error during login process:', error.message, error.stack);
    res.status(500).json({ message: 'Error during login' });
  }
});

// Fetch all users (for debugging)
router.get('/users', async (req, res) => {
  try {
    const users = await pool.query('SELECT id, email, created_at FROM users');
    console.log('Fetched users:', users.rows);
    res.json(users.rows);
  } catch (error) {
    console.error('Error fetching users:', error.message, error.stack);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

module.exports = router;
