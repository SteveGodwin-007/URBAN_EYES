import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const mongoUri = process.env.MONGODB_URI;
const mongoUser = process.env.MONGODB_USER;
const mongoPassword = process.env.MONGODB_PASSWORD;
const mongoHost = process.env.MONGODB_HOST || 'cluster0.uotjzrt.mongodb.net';
const mongoDbName = process.env.MONGODB_DB || 'urban-eyes';

const finalMongoUri = mongoUri ?? (
  mongoUser && mongoPassword
    ? `mongodb+srv://${mongoUser}:${encodeURIComponent(mongoPassword)}@${mongoHost}/${mongoDbName}?retryWrites=true&w=majority`
    : null
);

// --- Data layer: PostgreSQL (preferred) -> MongoDB -> in-memory fallback ---
// The app must boot even when no database is reachable. DATABASE_URL (Tiger
// Cloud / any Postgres) is tried first, then MongoDB Atlas, and if both fail
// we degrade to a simple in-memory store so the dashboard, map and admin
// flows still work for demos. In-memory data resets on restart.

interface PotholeStore {
  find(filter?: any): { toArray(): Promise<any[]> };
  insertOne(doc: any): Promise<{ insertedId: any }>;
  updateOne(filter: any, update: any): Promise<{ matchedCount: number }>;
}

// PostgreSQL store — same contract as the Mongo collection, backed by a
// single `potholes` table (id + JSONB document).
class PgStore implements PotholeStore {
  private constructor(private pool: Pool) {}

  static async connect(connectionString: string): Promise<PgStore> {
    // pg merges parse(connectionString) OVER any explicit `ssl` option, so the
    // SSL mode must be carried by the URL itself. Tiger Cloud signs its
    // certificates with a private CA, so full verification fails ("self-signed
    // certificate in certificate chain"). Strategy: try the URL as-is first
    // (full verification); only if the failure is certificate-related, retry
    // with pg's documented `uselibpqcompat=true` flag, which gives
    // libpq-compatible `sslmode=require` semantics (TLS on, verification off —
    // traffic stays encrypted). Auth/SQL errors do NOT retry.
    const hasSslMode = /([?&])sslmode=/i.test(connectionString);
    const attempts: Array<{ label: string; connStr: string; relaxed: boolean }> = hasSslMode
      ? [
          { label: 'TLS with certificate verification', connStr: connectionString, relaxed: false },
          {
            label: 'TLS without certificate verification (private CA)',
            connStr: PgStore.withParam(connectionString, 'uselibpqcompat', 'true'),
            relaxed: true,
          },
        ]
      : [{ label: 'default', connStr: connectionString, relaxed: false }];

    let lastError: any;
    for (const attempt of attempts) {
      const pool = new Pool({
        connectionString: attempt.connStr,
        connectionTimeoutMillis: 10000,
      });
      try {
        // The schema check doubles as the connectivity check: bad credentials
        // or an unreachable host throw here and the caller falls back.
        await pool.query(`
          CREATE TABLE IF NOT EXISTS potholes (
            id         TEXT PRIMARY KEY,
            data       JSONB NOT NULL,
            created_at BIGINT NOT NULL
          )
        `);
        if (attempt.relaxed) {
          console.warn(
            '[POSTGRES] Server certificate not in the system trust store (private CA); '
            + 'connected with TLS encryption but without certificate validation.'
          );
        }
        return new PgStore(pool);
      } catch (error: any) {
        lastError = error;
        await pool.end().catch(() => {});
        const message = String(error?.message || error);
        if (attempt.relaxed || !/certificate|self-signed|ssl|tls/i.test(message)) {
          break; // certificate-independent failure (auth, DNS, timeout) — retrying won't help
        }
      }
    }
    throw lastError;
  }

  private static withParam(url: string, key: string, value: string): string {
    return url + (url.includes('?') ? '&' : '?') + key + '=' + value;
  }

  find(filter: any = {}) {
    return {
      toArray: async () => {
        const res = await this.pool.query(
          'SELECT id, data FROM potholes ORDER BY created_at ASC'
        );
        let results = res.rows.map((r: any) => ({ _id: r.id, ...r.data }));
        // Only the filter shape used by the duplicate check is supported
        // (mirrors MemoryStore).
        if (filter?.status?.$ne) {
          results = results.filter((d: any) => d.status !== filter.status.$ne);
        }
        return results;
      },
    };
  }

  async insertOne(doc: any) {
    const id = randomUUID();
    await this.pool.query(
      'INSERT INTO potholes (id, data, created_at) VALUES ($1, $2, $3)',
      [id, doc, Date.now()]
    );
    return { insertedId: id };
  }

  async updateOne(filter: any, update: any) {
    const targetId = filter?._id?.toString();
    if (!targetId) return { matchedCount: 0 };
    const res = await this.pool.query('SELECT data FROM potholes WHERE id = $1', [targetId]);
    const row = res.rows[0];
    if (!row) return { matchedCount: 0 };
    const doc = { ...row.data };
    if (update?.$set) Object.assign(doc, update.$set);
    if (update?.$push) {
      for (const [key, value] of Object.entries(update.$push)) {
        doc[key] = doc[key] || [];
        doc[key].push(value);
      }
    }
    await this.pool.query('UPDATE potholes SET data = $1 WHERE id = $2', [doc, targetId]);
    return { matchedCount: 1 };
  }
}

class MemoryStore implements PotholeStore {
  private docs: any[] = [];
  private seq = 0;

  find(filter: any = {}) {
    let results = this.docs;
    // Only the filter shape used by the duplicate check is supported.
    if (filter?.status?.$ne) {
      results = results.filter((d) => d.status !== filter.status.$ne);
    }
    return {
      toArray: async () => results.map((d) => ({ ...d })),
    };
  }

  async insertOne(doc: any) {
    this.seq += 1;
    const _id = `MEM-${String(this.seq).padStart(3, '0')}`;
    this.docs.push({ _id, ...doc });
    return { insertedId: _id };
  }

  async updateOne(filter: any, update: any) {
    const targetId = filter?._id?.toString();
    const doc = this.docs.find((d) => d._id.toString() === targetId);
    if (!doc) return { matchedCount: 0 };
    if (update?.$set) Object.assign(doc, update.$set);
    if (update?.$push) {
      for (const [key, value] of Object.entries(update.$push)) {
        doc[key] = doc[key] || [];
        doc[key].push(value);
      }
    }
    return { matchedCount: 1 };
  }
}

let potholesCollection: PotholeStore;
let dataSource: 'mongodb' | 'postgres' | 'memory';

async function connectStore(): Promise<{ store: PotholeStore; mode: 'mongodb' | 'postgres' | 'memory' }> {
  const problems: string[] = [];

  // 1) PostgreSQL via DATABASE_URL (Tiger Cloud, Neon, Render Postgres, ...)
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      const store = await PgStore.connect(databaseUrl);
      return { store, mode: 'postgres' };
    } catch (error: any) {
      problems.push(`PostgreSQL unreachable (${error?.message || error})`);
    }
  } else {
    problems.push('no DATABASE_URL set');
  }

  // 2) MongoDB Atlas (legacy / optional)
  if (finalMongoUri) {
    try {
      const mongoClient = new MongoClient(finalMongoUri, { serverSelectionTimeoutMS: 8000 });
      await mongoClient.connect();
      const db = mongoClient.db(mongoDbName);
      return { store: db.collection<any>('potholes'), mode: 'mongodb' };
    } catch (error: any) {
      problems.push(`MongoDB unreachable (${error?.message || error})`);
    }
  } else {
    problems.push('no MongoDB configuration found (set MONGODB_URI or MONGODB_USER + MONGODB_PASSWORD)');
  }

  // 3) In-memory fallback so the app still boots (data resets on restart).
  console.warn(`\n[MEMORY MODE] ${problems.join('; ')}.`);
  console.warn('[MEMORY MODE] Falling back to an in-memory store — data will reset on restart.\n');
  return { store: new MemoryStore(), mode: 'memory' };
}

const { store, mode } = await connectStore();
potholesCollection = store;
dataSource = mode;

async function startServer() {
  const expressApp = express();
  // Render (and most PaaS hosts) inject a PORT env var — always honour it
  // and fall back to 3000 for local development.
  const PORT = Number(process.env.PORT) || 3000;

  // Edge devices embed the captured JPEG as a base64 data URL (SEND_IMAGE=true),
  // which easily exceeds Express's default 100kb JSON limit and made the server
  // answer 413 (PayloadTooLargeError) — the Pi then logged "Server responded
  // 413" and nothing reached the dashboard. Allow up to 10mb for image uploads.
  expressApp.use(express.json({ limit: '10mb' }));

  // --- API Routes ---
  console.log(`[${dataSource.toUpperCase()}] Data source ready.`);

  // Spatial dedupe threshold (metres). Overridable so a stationary bench test
  // (e.g. IP-derived coordinates that never move) can set DEDUPE_DISTANCE_M=0.
  const DEDUPE_DISTANCE_M = Number(process.env.DEDUPE_DISTANCE_M ?? 10);

  // Helper: Haversine distance in meters
  function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; 
  }

  // Receive Pothole Detection from Edge Device
  expressApp.post('/api/potholes', async (req, res) => {
    try {
      const { latitude, longitude, imageUrl, confidence, busRouteId, busId, bboxSize } = req.body;

      // 1. Basic Validation
      if (!latitude || !longitude || !busRouteId) {
        return res.status(400).json({ error: 'Missing required coordinates or route ID' });
      }

      // 2. Duplicate Detection (Spatial Clustering - ~10m threshold)
      const existingDocs = await potholesCollection
        .find({ status: { $ne: 'ACTION_TAKEN' } })
        .toArray();

      let isDuplicate = false;
      existingDocs.forEach(doc => {
        const data = doc as any;
        const dist = getDistance(latitude, longitude, data.location.latitude, data.location.longitude);
        if (dist < DEDUPE_DISTANCE_M) { // configurable metres threshold (default 10)
          isDuplicate = true;
        }
      });

      if (isDuplicate) {
        return res.status(200).json({ status: 'duplicate', message: 'Pothole already documented in this vicinity' });
      }

      // 3. Severity Classification based on bounding box size (simulated)
      let severity = 'MEDIUM';
      if (bboxSize < 5000) severity = 'SMALL';
      else if (bboxSize > 20000) severity = 'LARGE';

      // 4. Smart Placeholder Images (Specific to Indian/Chennai urban contexts)
      const placeholders = {
        SMALL: 'https://images.unsplash.com/photo-1541339907198-e08756ebafe1?auto=format&fit=crop&q=80&w=800', // Broken asphalt
        MEDIUM: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=800', // Typical urban road damage
        LARGE: 'https://images.unsplash.com/photo-1597811985396-e13768f94676?auto=format&fit=crop&q=80&w=800'  // Severe road hazard
      };

      // Force "Indian Road" style keywords if we were using a search API, 
      // but for now we vary the placeholders based on severity more strictly.

      // 4. Save to Firestore
      const newPothole = {
        location: { latitude, longitude },
        imageUrl: imageUrl || placeholders[severity as keyof typeof placeholders],
        confidence,
        timestamp: new Date().toISOString(),
        busRouteId,
        busId: busId || 'BUS-001',
        status: 'DETECTED',
        severity,
        updatedAt: new Date().toISOString()
      };

      const result = await potholesCollection.insertOne(newPothole);
      
      res.status(201).json({ id: result.insertedId.toString(), ...newPothole });
    } catch (error) {
      console.error('Error adding pothole:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get all Potholes
  expressApp.get('/api/potholes', async (req, res) => {
    try {
      // Fetch all and sort in memory to avoid missing index errors during demo
      const docs = await potholesCollection.find().toArray();
      const potholes = docs.map(doc => ({ id: doc._id.toString(), ...doc } as any));
      
      // Sort by timestamp desc
      potholes.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      res.json(potholes);
    } catch (error) {
       console.error('Error fetching potholes:', error);
       res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update Pothole (GCC Admin)
  expressApp.patch('/api/potholes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { status, remarks } = req.body;
      
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };
      
      if (status) updateData.status = status;
      if (remarks) updateData.remarks = remarks;

      const historyEntry = {
        status: status || 'UPDATED',
        remarks: remarks || 'Manual update',
        timestamp: new Date().toISOString(),
        actionBy: 'GCC_ADMIN_UNIT_01'
      };

      // Memory-store ids (MEM-xxx) are not valid ObjectIds.
      const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };

      await potholesCollection.updateOne(
        filter,
        {
          $set: updateData,
          $push: { history: historyEntry }
        } as any
      );

      res.json({ id, ...updateData });
    } catch (error) {
      console.error('Error updating pothole:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Analytics Metrics
  expressApp.get('/api/stats', async (req, res) => {
    try {
      const docs = await potholesCollection.find().toArray();
      const stats = {
        total: 0,
        sentToGcc: 0,
        viewed: 0,
        resolved: 0,
        byRoute: {} as Record<string, number>,
        bySeverity: { SMALL: 0, MEDIUM: 0, LARGE:0 } as Record<string, number>
      };

      docs.forEach(doc => {
        const data = doc as any;
        stats.total++;
        if (data.status === 'SENT_TO_GCC') stats.sentToGcc++;
        if (data.status === 'VIEWED') stats.viewed++;
        if (data.status === 'ACTION_TAKEN') stats.resolved++;
        
        stats.byRoute[data.busRouteId] = (stats.byRoute[data.busRouteId] || 0) + 1;
        stats.bySeverity[data.severity as keyof typeof stats.bySeverity]++;
      });

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- Vite / Frontend Setup ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    expressApp.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    expressApp.use(express.static(distPath));
    expressApp.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  expressApp.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
