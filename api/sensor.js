// api/sensor.js  (Vercel serverless function)
let latestData = {
  sound: 65.5,
  vibration: 2450,
  temperature: 24.5,
  humidity: 45.2,
  timestamp: Date.now()
};

const API_KEY = process.env.SENSOR_API_KEY; // set in Vercel dashboard

export default function handler(req, res) {
  // CORS headers so your frontend can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ESP32 pushes data → POST /api/sensor
  if (req.method === 'POST') {
    const { sound, vibration, temperature, humidity, apiKey } = req.body;

    if (apiKey !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    latestData = {
      sound: parseFloat(sound),
      vibration: parseFloat(vibration),
      temperature: parseFloat(temperature),
      humidity: parseFloat(humidity),
      timestamp: Date.now()
    };

    return res.status(200).json({ ok: true });
  }

  // Frontend polls → GET /api/sensor
  if (req.method === 'GET') {
    return res.status(200).json(latestData);
  }

  res.status(405).end();
}