require("dotenv").config();

const express = require('express');
const axios = require('axios');
const { createS3Bucket, uploadJsonToS3, getObjectFromS3 } = require('./aws'); 
const cors = require('cors');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Connected to the database');
  }
});

//
// AWS config.
//
const bucket = "cschembri-docker-mashup";
const key = "counter.json";

//
// Setup Express.
//
const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
const port = 3001;

//
// Main server entry point.
//
app.listen(port, async () => {
  console.log(`Server is running at http://localhost:${port}`);

  //console.log("Verifying AWS functionality...")
  //const defaultBody = { counter: 0 }
  //await createS3Bucket(bucket);
  //await uploadJsonToS3(bucket, key, defaultBody);
  //await getObjectFromS3(bucket, key).then((object) => console.log(object));
  //console.log("AWS functionality verified.")
});

// POST /register route
app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  // Check if email and password are provided
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  // Hash the password using bcrypt
  bcrypt.hash(password, 10, (bcryptErr, hashedPassword) => {
    if (bcryptErr) {
      console.error('Error hashing the password:', bcryptErr);
      return res.status(500).json({ message: 'Internal server error' });
    }

    const INSERT_QUERY = 'INSERT INTO users (email, password) VALUES (?, ?)';

    // Insert user data into the database
    db.query(INSERT_QUERY, [email, hashedPassword], (err, result) => {
      if (err) {
        console.error('Error inserting user data:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }

      return res.status(201).json({ message: 'Registration successful' });
    });
  });
});

// POST /login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Check if email and password are provided
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const SELECT_QUERY = 'SELECT id, email, password FROM users WHERE email = ?';

  // Query the database to retrieve the user's information
  db.query(SELECT_QUERY, [email], (err, results) => {
    if (err) {
      console.error('Error querying the database: ', err);
      return res.status(500).json({ message: 'Internal server error' });
    }

    if (results.length === 0) {
      // User not found
      return res.status(401).json({ message: 'Authentication failed' });
    }

    const user = results[0];
    const storedPasswordHash = user.password;

    // Compare the provided password with the stored password hash
    bcrypt.compare(password, storedPasswordHash, (bcryptErr, match) => {
      if (bcryptErr) {
        console.error('Error comparing password hashes: ', bcryptErr);
        return res.status(500).json({ message: 'Internal server error' });
      }

      if (match) {
        // Passwords match, authentication successful
        return res.status(200).json({ message: 'Login successful' });
      } else {
        // Passwords do not match, authentication failed
        return res.status(401).json({ message: 'Authentication failed' });
      }
    });
  });
});
