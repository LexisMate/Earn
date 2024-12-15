require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const userRoutes = require('./routes/user');

const app = express();
app.use(bodyParser.json());

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve "login.html" at "/login"
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Route to serve "register.html" at "/register"
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Middleware to check if user is logged in
const checkAuth = (req, res, next) => {
  const token = req.headers.authorization; // Token from frontend
  if (!token) return res.redirect('/login'); // Redirect to login if no token
  
  // Validate token (simplified, replace with real logic like JWT/session validation)
  if (token !== 'valid-token') return res.redirect('/login'); 
  next();
};

// Protected route to serve "dashboard.html"
app.get('/dashboard', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API Routes
app.use('/api/user', userRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
