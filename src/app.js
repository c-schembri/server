require("dotenv").config();

const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const ffmpeg = require('fluent-ffmpeg');

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
const bucket = 'cschembri-project';

// Middleware
app.use(express.json());
app.use(bodyParser.json());

// File upload
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: bucket,
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      authenticateUserAndGenerateKey(req.body.email, req.body.password, file, cb);
    },
  }),
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

// Routes
app.post('/register', registerUser);
app.post('/login', loginUser);

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  return res.status(200).json({ message: 'File uploaded to S3 bucket successfully' });
});

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
    if (authenticateUser(email, password)) {
      return res.status(200).json({ message: 'Login successful' });
    }

    return res.status(401).json({ message: 'Authentication failed' })
  } catch (err) {
    console.error('Error logging in user:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function authenticateUserAndGenerateKey(email, password, file, cb) {
  try {
    if (!authenticateUser(email, password)) {
      return cb(new Error("Authentication failed"))
    }

    const key = `${email}/${Date.now()}-${Math.floor(Math.random() * 1000)}-${file.originalname}`;
    cb(null, key);
  } catch (err) {
    cb(err);
  }
}

async function authenticateUser(email, password) {
  const SELECT_QUERY = 'SELECT email, password FROM user WHERE email = ?';
  const [results] = await db.execute(SELECT_QUERY, [email]);

  if (results.length === 0) {
    false;
  }

  const user = results[0];
  const storedPasswordHash = user.password;
  const match = await bcrypt.compare(password, storedPasswordHash);

  if (!match) {
    return false;
  }

  return true;
}

app.get('/files', async (req, res) => {
  const { email, password } = req.query;

  if (!authenticateUser(email, password)) {
    return res.status(401).json({ message: 'Authentication failed' });
  }

  const s3Params = {
    Bucket: bucket, // Replace with your S3 bucket name
    Prefix: `${email}/`, // Prefix to filter objects belonging to the user
  };

  // List objects in the S3 bucket
  s3.listObjectsV2(s3Params, (err, data) => {
    if (err) {
      console.error('Error listing S3 objects:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }

    // Extract the object keys (filenames) from the result
    const objectKeys = data.Contents.map((object) => object.Key);

    return res.status(200).json({ files: objectKeys });
  });
});

app.get('/convert-to-h264', (req, res) => {
  const { email, password, filename } = req.query;

  if (!authenticateUser(email, password)) {
    return res.status(401).json({ message: 'Authentication failed' });
  }

  const key = `${email}/${filename}`;

  // Fetch the file from S3
  s3.getObject({ Bucket: bucket, Key: key }, (err, data) => {
    if (err) {
      console.error('Error fetching file from S3:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }

    const tmpRaw = `/tmp/${Date.now()}_raw.mkv`
    fs.writeFileSync(tmpRaw, data.Body);

    // Implement the H.264 conversion using FFmpeg
    //const originalFileData = data.Body;

    // Create a temporary file to store the converted data
    const tempFile = `/tmp/${Date.now()}_converted.mkv`;

    ffmpeg()
      .input(tmpRaw)
      .videoCodec('libx264') // Set the H.264 video codec
      .audioCodec('aac') // Set the AAC audio codec
      .outputOptions([
        '-crf 18', // Constant Rate Factor (18 is considered high quality)
        '-preset slow', // Use a slower preset for better quality
        '-strict experimental', // Required for using the 'aac' audio codec
      ])
      .toFormat('mkv')
      .on('end', () => {
        // Read the temporary file and save it back to S3
        fs.readFile(tempFile, (readErr, convertedData) => {
          if (readErr) {
            console.error('Error reading converted file:', readErr);
            return res.status(500).json({ message: 'Internal server error' });
          }

          // Save the converted data back to S3
          saveToS3(sourceKey, convertedData, (saveErr) => {
            if (saveErr) {
              console.error('Error saving converted file to S3:', saveErr);
              return res.status(500).json({ message: 'Internal server error' });
            }

            // Clean up the temporary file
            fs.unlinkSync(tempFile);

            return res.status(200).json({ message: 'Conversion and save to S3 successful' });
          });
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg conversion error:', err);
        return res.status(500).json({ message: 'Internal server error' });
      })
      .save(tempFile);
  });
});
