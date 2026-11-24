import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const settingsFile = path.join(dataDir, 'settings.json');
const defaults = {
  campaignName: 'ARG Early Access', enabled: false,
  discordInvite: 'https://discord.gg/replace-this',
  dmKeywords: ['arg', 'discord', 'updates', 'join'],
  commentKeywords: ['arg', 'discord', 'updates', 'join'],
  dmReply: 'Thanks for your interest in {campaign}! Join the Discord here: {discord_link}\n\nI’ll post release updates and instructions there. Once you join, check #announcements.',
  commentReply: 'Thanks for your interest in {campaign}! Join the Discord here: {discord_link}\n\nI’ll post release updates and instructions there. Once you join, check #announcements.',
  ignoreOwnMessages: true
};
let pool;
let fileQueue = Promise.resolve();
const mergeDefaults = (value) => ({ ...defaults, ...value });

export async function initializeStore() {
  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
    await pool.query('CREATE TABLE IF NOT EXISTS app_settings (id integer PRIMARY KEY CHECK (id=1), value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
    await pool.query('CREATE TABLE IF NOT EXISTS processed_events (event_id text PRIMARY KEY, processed_at timestamptz NOT NULL DEFAULT now())');
    await pool.query('INSERT INTO app_settings(id,value) VALUES(1,$1::jsonb) ON CONFLICT(id) DO NOTHING', [JSON.stringify(defaults)]);
    return;
  }
  await fs.mkdir(dataDir, { recursive: true });
  try { await fs.access(settingsFile); } catch { await fs.writeFile(settingsFile, JSON.stringify(defaults, null, 2)); }
}

export async function getSettings() {
  if (pool) {
    const { rows } = await pool.query('SELECT value FROM app_settings WHERE id=1');
    return mergeDefaults(rows[0]?.value || {});
  }
  return mergeDefaults(JSON.parse(await fs.readFile(settingsFile, 'utf8')));
}

export async function saveSettings(value) {
  const settings = mergeDefaults(value);
  if (pool) await pool.query('UPDATE app_settings SET value=$1::jsonb, updated_at=now() WHERE id=1', [JSON.stringify(settings)]);
  else {
    fileQueue = fileQueue.then(() => fs.writeFile(settingsFile, JSON.stringify(settings, null, 2)));
    await fileQueue;
  }
  return settings;
}

export async function claimEvent(eventId) {
  if (!eventId) return true;
  if (pool) {
    try { await pool.query('INSERT INTO processed_events(event_id) VALUES($1)', [eventId]); return true; }
    catch (error) { if (error.code === '23505') return false; throw error; }
  }
  const file = path.join(dataDir, 'processed-events.json');
  let events = [];
  try { events = JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
  if (events.includes(eventId)) return false;
  events.push(eventId);
  await fs.writeFile(file, JSON.stringify(events.slice(-5000)));
  return true;
}

export async function closeStore() { await pool?.end(); }
