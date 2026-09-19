const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve the dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint for Arduino data (for future use)
app.post('/api/sensor-data', (req, res) => {
    const sensorData = req.body;
    console.log('Received sensor data:', sensorData);
    
    // Calculate health index
    const healthIndex = calculateHealthIndex(sensorData);
    
    // Here you would save to database or process the data
    res.json({
        success: true,
        message: 'Data received',
        timestamp: new Date().toISOString(),
        healthIndex: healthIndex,
        recommendations: generateRecommendations(healthIndex, sensorData)
    });
});

// API endpoint to get current data
app.get('/api/sensor-data', (req, res) => {
    // Return simulated data for demo
    const sound = 65.5 + Math.random() * 10 - 5;
    const vibration = 2450 + Math.random() * 400 - 200;
    const temperature = 24.5 + Math.random() * 3 - 1.5;
    const humidity = 45.2 + Math.random() * 10 - 5;
    
    // Calculate health index
    const healthIndex = calculateHealthIndex({
        sound: sound,
        vibration: vibration,
        temperature: temperature,
        humidity: humidity
    });
    
    res.json({
        data: [
            {
                sensor: 'sound',
                value: sound,
                unit: 'dB',
                healthScore: calculateSensorHealth(sound, 'sound'),
                timestamp: new Date().toISOString()
            },
            {
                sensor: 'vibration',
                value: vibration,
                unit: 'Hz',
                healthScore: calculateSensorHealth(vibration, 'vibration'),
                timestamp: new Date().toISOString()
            },
            {
                sensor: 'temperature',
                value: temperature,
                unit: '°C',
                healthScore: calculateSensorHealth(temperature, 'temperature'),
                timestamp: new Date().toISOString()
            },
            {
                sensor: 'humidity',
                value: humidity,
                unit: '%',
                healthScore: calculateSensorHealth(humidity, 'humidity'),
                timestamp: new Date().toISOString()
            }
        ],
        healthIndex: healthIndex,
        overallStatus: getHealthStatus(healthIndex),
        timestamp: new Date().toISOString()
    });
});

// Health calculation functions
function calculateSensorHealth(value, sensorType) {
    let score = 100;
    
    switch(sensorType) {
        case 'sound':
            if (value > 85) score = 0;
            else if (value > 70) score = 50 - ((value - 70) / 15) * 50;
            else score = 100 - ((value - 30) / 40) * 20;
            break;
            
        case 'vibration':
            if (value > 3000) score = 0;
            else if (value > 2500) score = 50 - ((value - 2500) / 500) * 50;
            else score = 100 - ((value - 500) / 2000) * 30;
            break;
            
        case 'temperature':
            if (value > 35 || value < 10) score = 0;
            else if (value > 30 || value < 15) score = 50;
            else if (value > 25 || value < 20) score = 75;
            else score = 100;
            break;
            
        case 'humidity':
            if (value > 80 || value < 20) score = 0;
            else if (value > 70 || value < 30) score = 50;
            else if (value > 60 || value < 40) score = 75;
            else score = 100;
            break;
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
}

function calculateHealthIndex(sensorData) {
    const weights = {
        sound: 0.25,
        vibration: 0.35,
        temperature: 0.20,
        humidity: 0.20
    };
    
    const soundHealth = calculateSensorHealth(sensorData.sound, 'sound');
    const vibrationHealth = calculateSensorHealth(sensorData.vibration, 'vibration');
    const temperatureHealth = calculateSensorHealth(sensorData.temperature, 'temperature');
    const humidityHealth = calculateSensorHealth(sensorData.humidity, 'humidity');
    
    const totalHealth = 
        (soundHealth * weights.sound) +
        (vibrationHealth * weights.vibration) +
        (temperatureHealth * weights.temperature) +
        (humidityHealth * weights.humidity);
    
    return Math.round(totalHealth);
}

function getHealthStatus(healthIndex) {
    if (healthIndex >= 90) return 'excellent';
    if (healthIndex >= 75) return 'good';
    if (healthIndex >= 60) return 'fair';
    if (healthIndex >= 40) return 'poor';
    return 'critical';
}

function generateRecommendations(healthIndex, sensorData) {
    const recommendations = [];
    
    if (healthIndex < 75) {
        recommendations.push('Machine requires attention. Consider scheduling maintenance.');
    }
    
    if (sensorData.sound > 70) {
        recommendations.push('Consider adding sound dampening or checking for loose components.');
    }
    
    if (sensorData.vibration > 2500) {
        recommendations.push('Check machine alignment and balance. Inspect bearings and mounts.');
    }
    
    if (sensorData.temperature > 30) {
        recommendations.push('Ensure adequate cooling and ventilation around the machine.');
    }
    
    if (sensorData.humidity > 70) {
        recommendations.push('Consider dehumidification to prevent corrosion and electrical issues.');
    }
    
    if (recommendations.length === 0) {
        recommendations.push('Machine operating optimally. Continue regular maintenance schedule.');
    }
    
    return recommendations;
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`📡 API Endpoint: http://localhost:${PORT}/api/sensor-data`);
    console.log(`\n✨ Machine Health Monitor Features:`);
    console.log(`   • Real-time health index calculation`);
    console.log(`   • Multi-sensor weighted scoring`);
    console.log(`   • Alert system with thresholds`);
    console.log(`   • Clean dashboard without charts/footer`);
});