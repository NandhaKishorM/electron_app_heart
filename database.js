
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs-extra';

const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'history.db');

// Ensure db directory exists
fs.ensureDirSync(path.dirname(dbPath));

const db = new Database(dbPath);

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    role TEXT CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT,
    image_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

export const database = {
  createSession: (title = 'New Chat') => {
    const stmt = db.prepare('INSERT INTO sessions (title) VALUES (?)');
    const info = stmt.run(title);
    return info.lastInsertRowid;
  },

  getSessions: ({ search, dateFrom, dateTo, page = 1, limit = 5 } = {}) => {
    let query = 'SELECT COUNT(*) as total FROM sessions WHERE 1=1';
    let dataQuery = 'SELECT * FROM sessions WHERE 1=1';
    const params = [];

    if (search) {
      const p = `%${search}%`;
      query += ' AND title LIKE ?';
      dataQuery += ' AND title LIKE ?';
      params.push(p);
    }

    // Date Filtering (YYYY-MM-DD)
    if (dateFrom) {
      query += ' AND date(created_at) >= date(?)';
      dataQuery += ' AND date(created_at) >= date(?)';
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ' AND date(created_at) <= date(?)';
      dataQuery += ' AND date(created_at) <= date(?)';
      params.push(dateTo);
    }

    const total = db.prepare(query).get(...params).total;

    dataQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const offset = (page - 1) * limit;

    // Params for data query need limit/offset at end
    const dataParams = [...params, limit, offset];

    const sessions = db.prepare(dataQuery).all(...dataParams);

    return {
      sessions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  getSession: (sessionId) => {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return null;
    const messages = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId);
    return { ...session, messages };
  },

  addMessage: (sessionId, role, content, imagePath = null) => {
    const stmt = db.prepare('INSERT INTO messages (session_id, role, content, image_path) VALUES (?, ?, ?, ?)');
    return stmt.run(sessionId, role, content, imagePath);
  },

  getMessages: (sessionId) => {
    return db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId);
  },

  deleteSession: (sessionId) => {
    return db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  },

  clearAll: () => {
    db.prepare('DELETE FROM sessions').run();
  },

  // Settings
  getSetting: (key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },

  saveSetting: (key, value) => {
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    return stmt.run(key, value);
  },

  getAllSettings: () => {
    return db.prepare('SELECT * FROM settings').all();
  }
};

// Initialize Settings Table
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);
