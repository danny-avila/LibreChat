# Widget Renderer Demo

This document demonstrates the interactive widget rendering capabilities of the enhanced content system.

## React Widget Example

```widget:react
import React, { useState } from 'react';

export default function CounterWidget() {
  const [count, setCount] = useState(0);
  
  return (
    <div style={{ 
      padding: '20px', 
      textAlign: 'center',
      backgroundColor: '#f0f9ff',
      borderRadius: '8px',
      border: '2px solid #0ea5e9'
    }}>
      <h2 style={{ color: '#0c4a6e', marginBottom: '16px' }}>
        Interactive Counter
      </h2>
      <div style={{ 
        fontSize: '48px', 
        fontWeight: 'bold', 
        color: '#0369a1',
        marginBottom: '16px'
      }}>
        {count}
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button 
          onClick={() => setCount(count - 1)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Decrease
        </button>
        <button 
          onClick={() => setCount(0)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Reset
        </button>
        <button 
          onClick={() => setCount(count + 1)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Increase
        </button>
      </div>
    </div>
  );
}
```

## HTML Widget Example

```widget:html
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
        }
        .container {
            max-width: 400px;
            margin: 0 auto;
            padding: 30px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 15px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        h1 {
            margin-bottom: 20px;
            font-size: 2em;
        }
        .clock {
            font-size: 3em;
            font-weight: bold;
            margin: 20px 0;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        }
        .date {
            font-size: 1.2em;
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Live Clock Widget</h1>
        <div class="clock" id="clock">00:00:00</div>
        <div class="date" id="date">Loading...</div>
    </div>

    <script>
        function updateClock() {
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            const dateString = now.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            document.getElementById('clock').textContent = timeString;
            document.getElementById('date').textContent = dateString;
        }
        
        // Update immediately and then every second
        updateClock();
        setInterval(updateClock, 1000);
    </script>
</body>
</html>
```

## Advanced React Widget with Hooks

```widget:react
import React, { useState, useEffect } from 'react';

export default function WeatherWidget() {
  const [weather, setWeather] = useState({
    temperature: 22,
    condition: 'Sunny',
    humidity: 65,
    windSpeed: 12
  });
  
  const [city, setCity] = useState('San Francisco');
  
  // Simulate weather data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setWeather(prev => ({
        ...prev,
        temperature: Math.round(prev.temperature + (Math.random() - 0.5) * 2),
        humidity: Math.max(30, Math.min(90, prev.humidity + (Math.random() - 0.5) * 10))
      }));
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);
  
  const getWeatherIcon = (condition) => {
    switch(condition) {
      case 'Sunny': return '☀️';
      case 'Cloudy': return '☁️';
      case 'Rainy': return '🌧️';
      default: return '🌤️';
    }
  };
  
  return (
    <div style={{
      padding: '24px',
      background: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)',
      borderRadius: '12px',
      color: 'white',
      fontFamily: 'system-ui, sans-serif',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '32px', marginRight: '12px' }}>
          {getWeatherIcon(weather.condition)}
        </span>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px' }}>{city}</h3>
          <p style={{ margin: 0, opacity: 0.8 }}>{weather.condition}</p>
        </div>
      </div>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '16px',
        marginTop: '20px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {weather.temperature}°C
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Temperature</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {weather.humidity}%
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Humidity</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {weather.windSpeed} km/h
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Wind Speed</div>
        </div>
      </div>
      
      <div style={{ marginTop: '20px' }}>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Enter city name"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            '::placeholder': { color: 'rgba(255, 255, 255, 0.7)' }
          }}
        />
      </div>
    </div>
  );
}
```

## Features Demonstrated

### Security Features
- **Sandboxed Execution**: All widgets run in isolated Sandpack environments
- **Resource Limitations**: Automatic timeout after 30 seconds
- **Safe Code Execution**: No access to parent window or sensitive APIs

### Interactive Capabilities
- **React Components**: Full React 18 support with hooks and state management
- **HTML/CSS/JavaScript**: Complete web technologies support
- **Real-time Updates**: Live data and interactive elements
- **Event Handling**: Click events, form inputs, and user interactions

### Development Features
- **Code Editor**: Syntax highlighting and error detection
- **Live Preview**: Real-time rendering of changes
- **Console Output**: Debug information and error messages
- **File Management**: Multiple file support for complex widgets

### Responsive Design
- **Mobile Optimized**: Touch-friendly controls and responsive layouts
- **Dark Mode Support**: Automatic theme detection and adaptation
- **Accessibility**: Proper ARIA labels and keyboard navigation

## Usage in Chat

Agents can create interactive widgets by using the `widget:react` or `widget:html` syntax in their responses. The system will automatically detect these blocks and render them as interactive components with full sandboxing and security measures.

This enables rich, interactive experiences while maintaining security and performance standards.