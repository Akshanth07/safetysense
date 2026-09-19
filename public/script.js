// ============================================================
// Machine Health Monitor - script.js
// Supports real ESP32 data via API polling
// ============================================================

// --- Configuration ---
const API_URL = '/api/sensor'; // Vercel serverless endpoint
const POLL_INTERVAL = 2000;    // Fetch every 2 seconds

// Initialize variables
let sensorData = {
    sound: 65.5,
    vibration: 2450,
    temperature: 24.5,
    humidity: 45.2
};

let startTime = Date.now();
let healthHistory = [];
let machineHealth = 87;
let isLiveMode = true; // true = ESP32 API, false = simulation fallback

// DOM Elements
const currentTimeEl = document.getElementById('currentTime');
const lastSyncTimeEl = document.getElementById('lastSyncTime');
const uptimeEl = document.getElementById('uptime');

// Sensor value elements
const soundValueEl = document.getElementById('soundValue');
const vibrationValueEl = document.getElementById('vibrationValue');
const temperatureValueEl = document.getElementById('temperatureValue');
const humidityValueEl = document.getElementById('humidityValue');

// Health score elements
const soundHealthScoreEl = document.getElementById('soundHealthScore');
const vibrationHealthScoreEl = document.getElementById('vibrationHealthScore');
const temperatureHealthScoreEl = document.getElementById('temperatureHealthScore');
const humidityHealthScoreEl = document.getElementById('humidityHealthScore');

// Factor value elements
const soundFactorValueEl = document.getElementById('soundFactorValue');
const vibrationFactorValueEl = document.getElementById('vibrationFactorValue');
const temperatureFactorValueEl = document.getElementById('temperatureFactorValue');
const humidityFactorValueEl = document.getElementById('humidityFactorValue');

// Health index elements
const healthValueEl = document.getElementById('healthValue');
const healthProgressEl = document.getElementById('healthProgress');
const healthStatusEl = document.getElementById('healthStatus');
const trendIndicatorEl = document.getElementById('trendIndicator');
const healthDescriptionEl = document.getElementById('healthDescription');

// Progress bar elements
const soundProgressEl = document.getElementById('soundProgress');
const vibrationProgressEl = document.getElementById('vibrationProgress');
const temperatureProgressEl = document.getElementById('temperatureProgress');
const humidityProgressEl = document.getElementById('humidityProgress');

// Time elements
const soundTimeEl = document.getElementById('soundTime');
const vibrationTimeEl = document.getElementById('vibrationTime');
const temperatureTimeEl = document.getElementById('temperatureTime');
const humidityTimeEl = document.getElementById('humidityTime');

// Alert list element
const alertListEl = document.getElementById('alertList');

// Health calculation weights
const healthWeights = {
    sound: 0.25,
    vibration: 0.35,
    temperature: 0.20,
    humidity: 0.20
};

// Health thresholds
const HEALTH_THRESHOLDS = {
    EXCELLENT: 90,
    GOOD: 75,
    FAIR: 60,
    POOR: 40,
    CRITICAL: 20
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
    updateCurrentTime();
    updateUptime();
    startLiveDataFetching();
    setupEventListeners();
    updateModeIndicator('live');
});

// ============================================================
// LIVE DATA FETCHING (ESP32 via API)
// ============================================================

async function fetchLiveData() {
    try {
        const res = await fetch(API_URL);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        // Validate all expected fields exist
        if (
            data.sound === undefined ||
            data.vibration === undefined ||
            data.temperature === undefined ||
            data.humidity === undefined
        ) {
            throw new Error('Incomplete data from API');
        }

        // Update sensor data
        sensorData.sound       = parseFloat(data.sound);
        sensorData.vibration   = parseFloat(data.vibration);
        sensorData.temperature = parseFloat(data.temperature);
        sensorData.humidity    = parseFloat(data.humidity);

        // Check data freshness
        const ageSeconds = data.timestamp
            ? (Date.now() - data.timestamp) / 1000
            : 0;

        updateConnectionStatus(ageSeconds <= 10 ? 'live' : 'stale', ageSeconds);

        // Update last sync time
        const syncTime = data.timestamp
            ? new Date(data.timestamp).toLocaleTimeString('en-US', {
                hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit'
              })
            : new Date().toLocaleTimeString('en-US', {
                hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit'
              });

        lastSyncTimeEl.textContent = syncTime;

        // Refresh display
        updateSensorDisplay();
        updateHealthIndex();
        updateAlerts();

        // Switch badge to LIVE if we were in fallback
        if (!isLiveMode) {
            isLiveMode = true;
            updateModeIndicator('live');
        }

    } catch (err) {
        console.warn('API fetch failed, using simulation fallback:', err.message);
        updateConnectionStatus('offline');

        // Fallback: simulate data so dashboard stays alive
        if (isLiveMode) {
            isLiveMode = false;
            updateModeIndicator('demo');
        }
        simulateFallbackData();
    }
}

function startLiveDataFetching() {
    fetchLiveData();                         // Immediate first call
    setInterval(fetchLiveData, POLL_INTERVAL);
}

// ============================================================
// FALLBACK SIMULATION (used when API is unreachable)
// ============================================================

function simulateFallbackData() {
    const now = Date.now();
    const t = now * 0.001;
    const anomaly = Math.random() < 0.1 ? Math.random() * 50 - 25 : 0;

    sensorData = {
        sound:       Math.max(30,  Math.min(120,  65  + Math.sin(t * 0.5) * 15 + Math.random() * 5  + anomaly * 0.5)),
        vibration:   Math.max(0,   Math.min(5000, 2500 + Math.cos(t * 0.3) * 800 + Math.random() * 200 + anomaly)),
        temperature: Math.max(-10, Math.min(50,   24  + Math.sin(t * 0.2) * 3  + Math.random() * 0.5 + anomaly * 0.1)),
        humidity:    Math.max(0,   Math.min(100,  45  + Math.cos(t * 0.15) * 8 + Math.random() * 1.5 + anomaly * 0.3))
    };

    updateSensorDisplay();
    updateHealthIndex();

    lastSyncTimeEl.textContent = new Date().toLocaleTimeString('en-US', {
        hour12: true, hour: '2-digit', minute: '2-digit'
    });

    updateAlerts();
}

// ============================================================
// CONNECTION STATUS UI
// ============================================================

function updateConnectionStatus(state, ageSeconds = 0) {
    const dot = document.querySelector('.connection-status .status-dot');
    const label = document.querySelector('.connection-status span');

    if (!dot || !label) return;

    if (state === 'live') {
        dot.style.background = '#10b981';
        dot.style.boxShadow  = '0 0 10px #10b981';
        label.textContent    = 'ESP32 Live';
    } else if (state === 'stale') {
        dot.style.background = '#f59e0b';
        dot.style.boxShadow  = '0 0 10px #f59e0b';
        label.textContent    = `Stale (${Math.round(ageSeconds)}s ago)`;
    } else {
        dot.style.background = '#ef4444';
        dot.style.boxShadow  = '0 0 10px #ef4444';
        label.textContent    = 'Offline – Simulation';
    }
}

function updateModeIndicator(mode) {
    const badge = document.querySelector('.status-badge');
    if (!badge) return;

    if (mode === 'live') {
        badge.style.background = 'linear-gradient(90deg, #10b981, #06b6d4)';
        badge.innerHTML = '<i class="fas fa-satellite-dish"></i> LIVE DATA';
    } else {
        badge.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        badge.innerHTML = '<i class="fas fa-code"></i> DEMO MODE';
    }
}

// ============================================================
// CLOCK & UPTIME
// ============================================================

function updateCurrentTime() {
    currentTimeEl.textContent = new Date().toLocaleTimeString('en-US', {
        hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    setTimeout(updateCurrentTime, 1000);
}

function updateUptime() {
    const diff = Date.now() - startTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    uptimeEl.textContent =
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    setTimeout(updateUptime, 1000);
}

// ============================================================
// SENSOR HEALTH CALCULATIONS
// ============================================================

function calculateSensorHealth(value, sensorType) {
    let score = 100;

    switch (sensorType) {
        case 'sound':
            if (value > 85)      score = 0;
            else if (value > 70) score = 50 - ((value - 70) / 15) * 50;
            else                 score = 100 - ((value - 30) / 40) * 20;
            break;

        case 'vibration':
            if (value > 3000)      score = 0;
            else if (value > 2500) score = 50 - ((value - 2500) / 500) * 50;
            else                   score = 100 - ((value - 500) / 2000) * 30;
            break;

        case 'temperature':
            if (value > 35 || value < 10)       score = 0;
            else if (value > 30 || value < 15)  score = 50;
            else if (value > 25 || value < 20)  score = 75;
            else                                score = 100;
            break;

        case 'humidity':
            if (value > 80 || value < 20)       score = 0;
            else if (value > 70 || value < 30)  score = 50;
            else if (value > 60 || value < 40)  score = 75;
            else                                score = 100;
            break;
    }

    return Math.max(0, Math.min(100, score));
}

function calculateHealthScore(sound, vibration, temperature, humidity) {
    return Math.round(
        calculateSensorHealth(sound,       'sound')       * healthWeights.sound +
        calculateSensorHealth(vibration,   'vibration')   * healthWeights.vibration +
        calculateSensorHealth(temperature, 'temperature') * healthWeights.temperature +
        calculateSensorHealth(humidity,    'humidity')    * healthWeights.humidity
    );
}

// ============================================================
// DISPLAY UPDATES
// ============================================================

function updateSensorDisplay() {
    soundValueEl.textContent       = sensorData.sound.toFixed(1);
    vibrationValueEl.textContent   = Math.round(sensorData.vibration).toLocaleString();
    temperatureValueEl.textContent = sensorData.temperature.toFixed(1);
    humidityValueEl.textContent    = sensorData.humidity.toFixed(1);

    soundProgressEl.style.width       = `${((sensorData.sound - 30) / 90) * 100}%`;
    vibrationProgressEl.style.width   = `${(sensorData.vibration / 5000) * 100}%`;
    temperatureProgressEl.style.width = `${((sensorData.temperature + 10) / 60) * 100}%`;
    humidityProgressEl.style.width    = `${sensorData.humidity}%`;

    const timeStr = new Date().toLocaleTimeString('en-US', {
        hour12: true, hour: '2-digit', minute: '2-digit'
    });
    soundTimeEl.textContent       = timeStr;
    vibrationTimeEl.textContent   = timeStr;
    temperatureTimeEl.textContent = timeStr;
    humidityTimeEl.textContent    = timeStr;

    updateSensorStatus();
}

function updateSensorStatus() {
    const cards = {
        sound:       document.querySelector('.sound-card .status-indicator'),
        vibration:   document.querySelector('.vibration-card .status-indicator'),
        temperature: document.querySelector('.temperature-card .status-indicator'),
        humidity:    document.querySelector('.humidity-card .status-indicator')
    };

    Object.entries(cards).forEach(([type, el]) => {
        if (el) updateStatus(el, calculateSensorHealth(sensorData[type], type));
    });
}

function updateStatus(element, healthScore) {
    if (healthScore >= 75) {
        element.className = 'status-indicator normal';
        element.innerHTML = `<i class="fas fa-check-circle"></i> Normal`;
    } else if (healthScore >= 50) {
        element.className = 'status-indicator warning';
        element.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Warning`;
    } else {
        element.className = 'status-indicator critical';
        element.innerHTML = `<i class="fas fa-exclamation-circle"></i> Critical`;
    }
}

function updateHealthIndex() {
    const scores = {
        sound:       calculateSensorHealth(sensorData.sound,       'sound'),
        vibration:   calculateSensorHealth(sensorData.vibration,   'vibration'),
        temperature: calculateSensorHealth(sensorData.temperature, 'temperature'),
        humidity:    calculateSensorHealth(sensorData.humidity,    'humidity')
    };

    // Update individual score displays
    soundHealthScoreEl.textContent       = Math.round(scores.sound);
    vibrationHealthScoreEl.textContent   = Math.round(scores.vibration);
    temperatureHealthScoreEl.textContent = Math.round(scores.temperature);
    humidityHealthScoreEl.textContent    = Math.round(scores.humidity);

    soundFactorValueEl.textContent       = Math.round(scores.sound)       + '%';
    vibrationFactorValueEl.textContent   = Math.round(scores.vibration)   + '%';
    temperatureFactorValueEl.textContent = Math.round(scores.temperature) + '%';
    humidityFactorValueEl.textContent    = Math.round(scores.humidity)    + '%';

    document.querySelector('.factor-progress-fill.sound').style.width       = scores.sound       + '%';
    document.querySelector('.factor-progress-fill.vibration').style.width   = scores.vibration   + '%';
    document.querySelector('.factor-progress-fill.temperature').style.width = scores.temperature + '%';
    document.querySelector('.factor-progress-fill.humidity').style.width    = scores.humidity    + '%';

    // Overall health
    machineHealth = calculateHealthScore(
        sensorData.sound, sensorData.vibration,
        sensorData.temperature, sensorData.humidity
    );

    healthValueEl.textContent = machineHealth;
    healthProgressEl.style.strokeDashoffset = 283 - (283 * machineHealth / 100);

    // Status label
    let statusText, statusClass, statusIcon, gaugeColor, description;

    if (machineHealth >= HEALTH_THRESHOLDS.EXCELLENT) {
        statusText = 'Excellent'; statusClass = 'normal';
        statusIcon = 'fas fa-check-circle'; gaugeColor = '#10b981';
        description = 'Machine operating at optimal performance. All parameters within excellent range.';
    } else if (machineHealth >= HEALTH_THRESHOLDS.GOOD) {
        statusText = 'Good'; statusClass = 'normal';
        statusIcon = 'fas fa-check-circle'; gaugeColor = '#3b82f6';
        description = 'Machine operating normally. Monitor vibration levels if they continue to rise.';
    } else if (machineHealth >= HEALTH_THRESHOLDS.FAIR) {
        statusText = 'Fair'; statusClass = 'warning';
        statusIcon = 'fas fa-exclamation-triangle'; gaugeColor = '#f59e0b';
        description = 'Machine requires attention. Some parameters approaching warning levels.';
    } else if (machineHealth >= HEALTH_THRESHOLDS.POOR) {
        statusText = 'Poor'; statusClass = 'critical';
        statusIcon = 'fas fa-exclamation-circle'; gaugeColor = '#ef4444';
        description = 'Machine health deteriorating. Immediate inspection recommended.';
    } else {
        statusText = 'Critical'; statusClass = 'critical';
        statusIcon = 'fas fa-skull-crossbones'; gaugeColor = '#dc2626';
        description = 'CRITICAL: Machine requires immediate maintenance! Risk of failure.';
    }

    healthStatusEl.className = `health-status ${statusClass}`;
    healthStatusEl.innerHTML = `<i class="${statusIcon}"></i> <span>${statusText}</span>`;
    healthProgressEl.style.stroke = gaugeColor;

    updateHealthTrend();
    healthDescriptionEl.textContent = description;

    healthHistory.push({ timestamp: new Date(), value: machineHealth });
    if (healthHistory.length > 10) healthHistory = healthHistory.slice(-10);
}

function updateHealthTrend() {
    if (healthHistory.length < 2) {
        trendIndicatorEl.className = 'trend-indicator';
        trendIndicatorEl.innerHTML = '<i class="fas fa-minus"></i> <span>Stable</span>';
        return;
    }

    const recent = healthHistory.slice(-5);
    let sum = 0;
    for (let i = 1; i < recent.length; i++) {
        sum += recent[i].value - recent[i - 1].value;
    }
    const avg = sum / (recent.length - 1);

    if (avg > 1) {
        trendIndicatorEl.className = 'trend-indicator up';
        trendIndicatorEl.innerHTML = '<i class="fas fa-arrow-up"></i> <span>Improving</span>';
    } else if (avg < -1) {
        trendIndicatorEl.className = 'trend-indicator down';
        trendIndicatorEl.innerHTML = '<i class="fas fa-arrow-down"></i> <span>Deteriorating</span>';
    } else {
        trendIndicatorEl.className = 'trend-indicator';
        trendIndicatorEl.innerHTML = '<i class="fas fa-minus"></i> <span>Stable</span>';
    }
}

// ============================================================
// ALERTS
// ============================================================

function updateAlerts() {
    const scores = {
        sound:       calculateSensorHealth(sensorData.sound,       'sound'),
        vibration:   calculateSensorHealth(sensorData.vibration,   'vibration'),
        temperature: calculateSensorHealth(sensorData.temperature, 'temperature'),
        humidity:    calculateSensorHealth(sensorData.humidity,    'humidity')
    };

    const alerts = [];

    const sensors = [
        { key: 'sound',       label: 'Sound Level',   unit: 'dB',  val: sensorData.sound.toFixed(1) },
        { key: 'vibration',   label: 'Vibration',     unit: 'Hz',  val: Math.round(sensorData.vibration) },
        { key: 'temperature', label: 'Temperature',   unit: '°C',  val: sensorData.temperature.toFixed(1) },
        { key: 'humidity',    label: 'Humidity',      unit: '%',   val: sensorData.humidity.toFixed(1) }
    ];

    sensors.forEach(({ key, label, unit, val }) => {
        const h = scores[key];
        if (h < 50) {
            alerts.push({
                type: 'critical',
                title: `Critical ${label}`,
                message: `Health critical: ${Math.round(h)}% (${val} ${unit})`
            });
        } else if (h < 75) {
            alerts.push({
                type: 'warning',
                title: `Elevated ${label}`,
                message: `Health warning: ${Math.round(h)}% (${val} ${unit})`
            });
        }
    });

    if (machineHealth < HEALTH_THRESHOLDS.POOR) {
        alerts.unshift({
            type: 'critical',
            title: 'CRITICAL MACHINE HEALTH',
            message: `Overall health index: ${machineHealth}%. Immediate maintenance required!`
        });
    } else if (machineHealth < HEALTH_THRESHOLDS.FAIR) {
        alerts.unshift({
            type: 'warning',
            title: 'Poor Machine Health',
            message: `Overall health index: ${machineHealth}%. Inspection recommended.`
        });
    }

    if (!isLiveMode) {
        alerts.unshift({
            type: 'warning',
            title: 'ESP32 Offline',
            message: 'Cannot reach API. Showing simulated data.'
        });
    }

    if (alerts.length === 0) {
        alerts.push({
            type: 'info',
            title: 'System Normal',
            message: `All sensors operating normally. Health index: ${machineHealth}%`
        });
    }

    alertListEl.innerHTML = alerts.map(({ type, title, message }) => `
        <div class="alert-item ${type}">
            <i class="fas ${type === 'critical' ? 'fa-exclamation-circle' :
                            type === 'warning'  ? 'fa-exclamation-triangle' :
                                                  'fa-info-circle'}"></i>
            <div class="alert-content">
                <strong>${title}</strong>
                <span>${message}</span>
            </div>
        </div>
    `).join('');
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {
    document.addEventListener('keypress', function (e) {
        // Press 'C' to configure health weights
        if (e.key === 'c' || e.key === 'C') {
            const input = prompt(
                'Configure sensor weights (must sum to 100):\n' +
                `Current: Sound ${healthWeights.sound * 100}, Vibration ${healthWeights.vibration * 100}, ` +
                `Temperature ${healthWeights.temperature * 100}, Humidity ${healthWeights.humidity * 100}\n\n` +
                'Enter new values (e.g. 25,35,20,20):',
                `${healthWeights.sound * 100},${healthWeights.vibration * 100},${healthWeights.temperature * 100},${healthWeights.humidity * 100}`
            );

            if (input) {
                const w = input.split(',').map(v => parseFloat(v.trim()) / 100);
                if (w.length === 4 && Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 0.01) {
                    [healthWeights.sound, healthWeights.vibration,
                     healthWeights.temperature, healthWeights.humidity] = w;
                    updateHealthIndex();
                    alert('Weights updated!');
                } else {
                    alert('Invalid. Must be 4 numbers summing to 100.');
                }
            }
        }

        // Press 'R' to force an immediate API refresh
        if (e.key === 'r' || e.key === 'R') {
            fetchLiveData();
        }
    });
}