import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { startMqttBridge } from './mqtt.js';

const mqttClient = startMqttBridge();
const server = app.listen(config.PORT, () => console.log(`API listening on port ${config.PORT}`));
async function shutdown(signal: string) {
  console.log(`${signal} received`);
  server.close(async () => { mqttClient?.end(true); await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
