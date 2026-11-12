import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "orders.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page INTEGER NOT NULL,
      product TEXT NOT NULL,
      size TEXT,
      name TEXT,
      address TEXT,
      postal_code TEXT,
      phone TEXT,
      email TEXT,
      delivery TEXT,
      fields_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

export type OrderInput = {
  page: number;
  product: string;
  fields: Record<string, string>;
};

export function insertOrder(input: OrderInput): number | bigint {
  const f = input.fields;
  const stmt = getDb().prepare(`
    INSERT INTO orders
      (page, product, size, name, address, postal_code, phone, email, delivery, fields_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    input.page,
    input.product,
    f["size"] || null,
    f["name surname"] || null,
    f["address"] || null,
    f["postal code"] || null,
    f["phone number"] || null,
    f["Email"] || null,
    f["delivery"] || null,
    JSON.stringify(f)
  );
  return info.lastInsertRowid;
}

export type OrderRow = {
  id: number;
  page: number;
  product: string;
  size: string | null;
  name: string | null;
  address: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  delivery: string | null;
  fields_json: string;
  created_at: string;
};

export function listOrders(): OrderRow[] {
  return getDb()
    .prepare(`SELECT * FROM orders ORDER BY id DESC`)
    .all() as OrderRow[];
}
