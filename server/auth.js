import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { connectDatabase } from './database.js';

const accessAge = 15 * 60;
const refreshAge = 7 * 24 * 60 * 60;
const issuer = 'homecraft-office';
const audience = 'homecraft-admin';
const digest = token => createHash('sha256').update(token).digest('hex');
const emailOf = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validPassword = value => typeof value === 'string' && Buffer.byteLength(value) <= 72;

export async function seedAdmin(email, password) {
  email = emailOf(email);
  if (!email || !validPassword(password) || password.length < 12) throw Error('Provide an email and a password of 12 characters to 72 bytes.');
  const { client, db } = await connectDatabase();
  try {
    const result = await db.collection('users').updateOne({ _id: email }, {
      $setOnInsert: { email, role: 'admin', passwordHash: await bcrypt.hash(password, 12) },
    }, { upsert: true });
    return result.upsertedCount === 1;
  } finally { await client.close(); }
}

export function createAuth(secret, secure) {
  const key = typeof secret === 'string' && /^[a-f0-9]{64}$/i.test(secret) ? Buffer.from(secret, 'hex') : null;
  const prefix = secure ? '__Host-office_' : 'office_';
  let sessionIndex;
  const sessions = async () => {
    const collection = (await connectDatabase()).db.collection('admin_sessions');
    sessionIndex ??= collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      .catch(error => { sessionIndex = null; throw error; });
    await sessionIndex;
    return collection;
  };
  async function read(request, kind) {
    const name = prefix + kind + '=';
    const token = request.headers.cookie?.split(';').map(item => item.trim())
      .find(item => item.startsWith(name))?.slice(name.length);
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'], issuer, audience, typ: 'office-' + kind + '+jwt', requiredClaims: ['sub', 'exp'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return { token, payload };
    } catch { return null; }
  }
  const cookie = (kind, value, age) => prefix + kind + '=' + value +
    '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + age + (secure ? '; Secure' : '');
  async function issue(email, sid, expiresAt) {
    const remaining = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    const sign = (kind, age) => new SignJWT({ sid })
      .setProtectedHeader({ alg: 'HS256', typ: 'office-' + kind + '+jwt' })
      .setIssuer(issuer).setAudience(audience).setSubject(email).setJti(randomUUID())
      .setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + age).sign(key);
    const refresh = await sign('refresh', remaining);
    const access = Math.min(accessAge, remaining);
    return {
      refreshHash: digest(refresh),
      cookies: [cookie('access', await sign('access', access), access), cookie('refresh', refresh, remaining)],
    };
  }
  const active = ({ sub, sid }) => ({ _id: sid, email: sub, expiresAt: { $gt: new Date() } });
  return {
    configured: Boolean(key && process.env.MONGODB_URI),
    async login(request, credentials) {
      const email = emailOf(credentials?.email), password = credentials?.password;
      if (!email || email.length > 254 || !validPassword(password)) return null;
      const { db } = await connectDatabase();
      const user = await db.collection('users').findOne({ _id: email, role: 'admin' });
      const fallback = '$2b$12$......................V6rgUC3aTjfZEGVcGHTZ4jYqIT3U.z.';
      const matches = await bcrypt.compare(password, user?.passwordHash || fallback);
      if (!user || !matches) return null;
      const collection = await sessions();
      const previous = await read(request, 'refresh') || await read(request, 'access');
      if (previous) await collection.deleteOne(active(previous.payload));
      const sid = randomUUID(), expiresAt = new Date(Date.now() + refreshAge * 1000);
      const issued = await issue(email, sid, expiresAt);
      await collection.insertOne({ _id: sid, email, expiresAt, refreshHash: issued.refreshHash });
      return issued.cookies;
    },
    async refresh(request) {
      const current = await read(request, 'refresh');
      if (!current) return null;
      const collection = await sessions();
      const filter = { ...active(current.payload), refreshHash: digest(current.token) };
      const session = await collection.findOne(filter);
      if (!session || session.expiresAt.getTime() - Date.now() < 1000) return null;
      const issued = await issue(session.email, session._id, session.expiresAt);
      const result = await collection.updateOne(filter, { $set: { refreshHash: issued.refreshHash } });
      return result.modifiedCount === 1 ? issued.cookies : null;
    },
    async authorized(request) {
      const access = await read(request, 'access');
      return Boolean(access && await (await sessions()).findOne(active(access.payload)));
    },
    async logout(request) {
      const session = await read(request, 'refresh') || await read(request, 'access');
      if (session) await (await sessions()).deleteOne(active(session.payload));
      return [cookie('access', '', 0), cookie('refresh', '', 0)];
    },
  };
}
