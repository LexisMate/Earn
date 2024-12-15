const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const pool = require('../db');
const crypto = require('crypto');

// OTP Cache for temporary storage
let otpCache = {};

// Route: Register and Send OTP
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
  body('rePassword')
    .custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;

  try {
    // Check if the user already exists
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    // Generate and store OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpCache[email] = { otp, password };

    // Email Transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // Send OTP to email
    await transporter.sendMail({
      from: process.env.SMTP_EMAIL,
      to: email,
      subject: 'Your Registration OTP',
      text: `Your OTP is: ${otp}`,
    });

    res.json({ message: 'OTP sent to your email!' });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'Error during registration' });
  }
});

// Route: Verify OTP and Register User
router.post('/verify-otp', async (req, res) => {
  const { email, otp, password } = req.body;

  // Check if OTP matches
  if (!otpCache[email] || otpCache[email].otp !== otp) {
    return res.status(400).json({ message: 'Invalid OTP or OTP expired' });
  }

  try {
    // Hash the password
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    // Insert user into the database
    await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2)',
      [email, hashedPassword]
    );

    // Clean up OTP cache
    delete otpCache[email];

    res.json({ message: 'Registration successful!' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ message: 'Error verifying OTP' });
  }
});

// Route: Fetch All Users
router.get('/users', async (req, res) => {
  try {
    const users = await pool.query('SELECT id, email, created_at FROM users');
    res.json(users.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

module.exports = router;
