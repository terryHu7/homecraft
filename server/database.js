import { MongoClient } from 'mongodb';

let pending;

export function databaseIssue(error) {
  if (['querySrv', 'queryTxt'].includes(error.syscall)) {
    return 'MongoDB DNS lookup failed. Check DNS or use the standard mongodb:// connection string from Atlas.';
  }
  if (error.name === 'MongoParseError') return 'The MongoDB connection string is invalid.';
  if (error.code === 18 || error.codeName === 'AuthenticationFailed') {
    return 'MongoDB rejected the database credentials. Check the database user and password in the connection string.';
  }
  if (error.name === 'MongoServerSelectionError') {
    return 'MongoDB could not be reached. Check the cluster status, network connection, and Atlas IP access list.';
  }
  return null;
}

export function connectDatabase() {
  if (!pending) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw Error('Configure MONGODB_URI.');
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    pending = client.connect().then(() => ({
      client, db: client.db(process.env.MONGODB_DB || 'aswins_world'),
    })).catch(async error => {
      pending = null;
      await client.close();
      throw error;
    });
  }
  return pending;
}
