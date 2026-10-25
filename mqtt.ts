import mqtt from 'mqtt';
import { config } from './config.js';

export function startMqttBridge() {
  if (!config.MQTT_ENABLED) return undefined;
  const client = mqtt.connect(config.MQTT_URL, { username: config.MQTT_USERNAME, password: config.MQTT_PASSWORD, reconnectPeriod: 2000 });
  client.on('connect', () => client.subscribe('anti-sleep/devices/+/status', { qos: 1 }));
  client.on('error', error => console.error('MQTT error', error.message));
  return client;
}
