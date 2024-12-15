require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const userRoutes = require('./routes/user');
const pool = require('./db');
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Error creating table:', err);
  } else {
    console.log('Users table ensured in the database.');
  }
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});
const checkAuth = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.redirect('/login');
  if (token !== 'valid-token') return res.redirect('/login');
  next();
};
app.get('/dashboard', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.use('/api/user', userRoutes);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
