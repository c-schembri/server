const aws = require('aws-sdk');

//
// Setup AWS.
//
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: process.env.AWS_REGION
  });

  console.log("Connecting to AWS via manual config (local).")
} else {
  console.log("Using IAM role for AWS credentials.")
}

const s3 = new aws.S3();

/**
 * Creates an Amazon S3 bucket with the specified name.
 *
 * This function attempts to create an S3 bucket with the provided name. If the bucket
 * already exists and is owned by you, it logs a message indicating that the bucket
 * already exists. If the bucket exists but is not owned by you, it logs a message
 * indicating that the bucket is already owned by another AWS account. If any other error
 * occurs during bucket creation, it logs an error message.
 *
 * @param {string} bucket The name of the S3 bucket to create.
 * @return {Promise<void>} A promise that resolves when the bucket creation is complete or rejects if an error occurs.
 */
async function createS3Bucket(bucket) {
  try {
    await s3.createBucket({ Bucket: bucket }).promise();
    console.log(`Created bucket: ${bucket}`);
  } catch (err) {
    if (err.code === 'BucketAlreadyExists') {
      console.log(`Bucket already exists: ${bucket}`);
    } else if (err.code === 'BucketAlreadyOwnedByYou') {
      console.log(`Bucket already owned by you: ${bucket}`);
    } else {
      console.error(`Error creating bucket: ${err.message}`);
    }
  }
}

/**
 * Uploads JSON data to an Amazon S3 bucket.
 *
 * This function uploads JSON data to the specified Amazon S3 bucket using the AWS SDK's
 * `upload` method. It converts the provided JavaScript object into a JSON string and
 * sets the content type to "application/json" for the S3 object.
 *
 * @param {string} bucket The name of the S3 bucket where the JSON data will be uploaded.
 * @param {string} key The unique key or path of the S3 object within the bucket.
 * @param {Object} body The JavaScript object containing the JSON data to be uploaded.
 * @return {Promise<void>} A promise that resolves when the JSON data has been successfully uploaded to S3, or rejects if an error occurs during the upload process.
 *
 * @throws {Error} If there is an error during the upload process, an error object is thrown with details about the error.
*/
async function uploadJsonToS3(bucket, key, body) {
  const params = {
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(body),
    ContentType: "application/json"
  };

  try {
    await s3.upload(params).promise();
    console.log(`JSON file uploaded to s3://${bucket}/${key} successfully.`);
  } catch (err) {
    console.error(`Error uploading JSON file to s3://${bucket}/${key}:`, err);
  }
}

/**
 * Retrieves a JSON object from an Amazon S3 bucket.
 *
 * This function retrieves a JSON object stored in an Amazon S3 bucket using the AWS SDK's
 * `getObject` method. It automatically parses the JSON content and logs the parsed data.
 *
 * @param {string} bucket The name of the S3 bucket where the JSON object is stored.
 * @param {string} key The unique key or path of the S3 object within the bucket.
 * @returns {Promise<Object>} A promise that resolves with the parsed JSON object or rejects if an error occurs during retrieval or parsing.
 *
 * @throws {Error} If there is an error during retrieval or parsing, an error object is thrown
 *                with details about the error.
 */
async function getObjectFromS3(bucket, key) {
  const params = {
    Bucket: bucket,
    Key: key,
  };

  try {
    const data = await s3.getObject(params).promise();
    const parsedData = JSON.parse(data.Body.toString("utf-8"));
    console.log(`Retrieved object from s3://${bucket}/${key} successfully.`)
    return parsedData;
  } catch (err) {
    console.error("Error retrieving or parsing JSON object:", err);
    throw err;
  }
}

module.exports = {
  createS3Bucket,
  uploadJsonToS3,
  getObjectFromS3,
};