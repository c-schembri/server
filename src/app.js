require("dotenv").config();

const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');

const app = express();
const port = 3001;

// Database connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10
});

// AWS S3 configuration
const s3 = new AWS.S3();

// Middleware
app.use(express.json());
app.use(bodyParser.json());

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

// Routes
app.post('/register', registerUser);
app.post('/login', loginUser);
app.post('/upload', authenticateUserAndUpload);

// User registration
async function registerUser(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const INSERT_QUERY = 'INSERT INTO user (email, password) VALUES (?, ?)';
    const [results] = await db.execute(INSERT_QUERY, [email, hashedPassword]);
    return res.status(201).json({ message: 'Registration successful' });
  } catch (err) {
    console.error('Error registering user:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// User login
async function loginUser(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const SELECT_QUERY = 'SELECT id, email, password FROM user WHERE email = ?';
    const [results] = await db.execute(SELECT_QUERY, [email]);

    if (results.length === 0) {
      return res.status(401).json({ message: 'Authentication failed' });
    }

    const user = results[0];
    const storedPasswordHash = user.password;

    const match = await bcrypt.compare(password, storedPasswordHash);

    if (match) {
      return res.status(200).json({ message: 'Login successful' });
    } else {
      return res.status(401).json({ message: 'Authentication failed' });
    }
  } catch (err) {
    console.error('Error logging in user:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// File upload
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'cschembri-project',
    acl: 'public-read',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      authenticateUserAndGenerateKey(req.body.email, req.body.password, file, cb);
    },
  }),
});

async function authenticateUserAndUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  return res.status(200).json({ message: 'File uploaded to S3 bucket successfully' });
}

async function authenticateUserAndGenerateKey(email, password, file, cb) {
  try {
    const SELECT_QUERY = 'SELECT email, password FROM user WHERE email = ?';
    const [results] = await db.execute(SELECT_QUERY, [email]);

    if (results.length === 0) {
      return cb(new Error('User not found'));
    }

    const user = results[0];
    const storedPasswordHash = user.password;
    const match = await bcrypt.compare(password, storedPasswordHash);

    if (!match) {
      return cb(new Error('Authentication failed'));
    }

    const userEmail = user.email;
    const fileExt = file.originalname.split('.').pop();
    const key = `${userEmail}/${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
    cb(null, key);
  } catch (err) {
    cb(err);
  }
}
