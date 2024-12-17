const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const pool = require('../db');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let otpCache = {};

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
  const { email, password } = req.body;
  try {
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: 'Email is already registered' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpCache[email] = { otp, password };
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
    res.json({ message: 'OTP sent to your email!' });
  } catch (error) {
    console.error('Error during registration process:', error.message);
    res.status(500).json({ message: 'Error during registration' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(404).json({ message: 'Email not registered' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpCache[email] = { otp };
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
      subject: 'Password Reset OTP',
      text: `Your OTP is: ${otp}`,
    });
    res.json({ message: 'OTP sent to your email!' });
  } catch (error) {
    console.error('Error sending reset OTP:', error.message);
    res.status(500).json({ message: 'Error sending reset OTP' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!otpCache[email] || otpCache[email].otp !== otp) {
    return res.status(400).json({ message: 'Invalid OTP or OTP expired' });
  }

  try {
    if (otpCache[email].password) {
      // Registration flow
      const hashedPassword = crypto.createHash('sha256').update(otpCache[email].password).digest('hex');
      await pool.query('INSERT INTO users (email, password) VALUES ($1, $2)', [email, hashedPassword]);
      delete otpCache[email];
      return res.json({ message: 'Registration successful!' });
    } else if (newPassword) {
      // Password reset flow
      const hashedPassword = crypto.createHash('sha256').update(newPassword).digest('hex');
      await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);
      delete otpCache[email];
      return res.json({ message: 'Password reset successful!' });
    } else {
      return res.status(400).json({ message: 'Invalid request' });
    }
  } catch (error) {
    console.error('Error in OTP verification:', error.message);
    res.status(500).json({ message: 'Error during OTP verification' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    if (user.rows[0].password !== hashedPassword) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }
    const token = jwt.sign({ email: user.rows[0].email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login successful', token });
  } catch (error) {
    console.error('Error during login process:', error.message);
    res.status(500).json({ message: 'Error during login' });
  }
});

module.exports = router;
