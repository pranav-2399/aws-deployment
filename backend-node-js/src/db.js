import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

if (
  !process.env.MONGODB_DB_NAME ||
  !process.env.MONGODB_LOCAL_URI
) {
  throw new Error('Please provide all the required environment variables');
}
//  ||!process.env.MONGODB_USER || !process.env.MONGODB_PASSWORD || !process.env.MONGODB_URI

const LOCAL_DB_URI = process.env.MONGODB_LOCAL_URI.replace(
  '<DB_NAME>',
  process.env.MONGODB_DB_NAME
);

// const DB_URI = process.env.MONGODB_URI.replace('<USER>', process.env.MONGODB_USER).replace(
//   '<PASSWORD>',
//   process.env.MONGODB_PASSWORD
// );

// const URI = process.env.NODE_ENV === 'production' ? DB_URI : LOCAL_DB_URI;

export const connectDB = async () => {
  try {
    await mongoose.connect(LOCAL_DB_URI, { dbName: process.env.MONGODB_DB_NAME });
    console.log('Connected to DB!');
  } catch (error) {
    console.error(error);
    throw error;
  }
};
