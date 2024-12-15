require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const userRoutes = require('./routes/user');
const pool = require('./db');
const app = express();

// Middleware to serve static assets like CSS and JS files from the 'public' folder
app.use(bodyParser.json());
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
// Dynamically handle page routing without .html extensions
const pages = ['login', 'register', 'dashboard', 'withdraw', 'settings'];

// Loop through the pages and create routes for each
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, `${page}.html`));
  });
});

// Database table creation
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

// Authentication middleware
const checkAuth = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.redirect('/login');
  if (token !== 'valid-token') return res.redirect('/login');
  next();
};

// API Routes
app.use('/api/user', userRoutes);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
