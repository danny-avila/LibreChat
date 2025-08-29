# Enhanced Content Usage Examples

## 1. Multimedia Content Examples

### Images
```
Here's a diagram showing the process:
https://example.com/process-diagram.png

The image above illustrates the three main steps in our workflow.
```

### Videos
```
Watch this tutorial video:
https://example.com/tutorial-video.mp4

This 5-minute video covers the basics of the enhanced content system.
```

### Audio
```
Listen to the pronunciation:
https://example.com/pronunciation-guide.mp3

The audio file demonstrates correct pronunciation of technical terms.
```

## 2. Text-to-Speech Examples

### Basic TTS Usage
```
Learn to pronounce: [tts:en-US]Hello, how are you today?[/tts]

In Spanish: [tts:es-ES]Hola, ¿cómo estás hoy?[/tts]

In French: [tts:fr-FR]Bonjour, comment allez-vous aujourd'hui?[/tts]
```

### Technical Terminology
```
The term [tts:en-US]asynchronous[/tts] refers to operations that don't block execution.

In programming, [tts:en-US]polymorphism[/tts] allows objects of different types to be treated uniformly.
```

### Language Learning Context
```
Practice these German phrases:
- [tts:de-DE]Guten Morgen[/tts] - Good morning
- [tts:de-DE]Wie geht es Ihnen?[/tts] - How are you?
- [tts:de-DE]Auf Wiedersehen[/tts] - Goodbye
```

## 3. Chart Examples

### Bar Chart with JSON Data
```
Here's the sales data for this quarter:

[chart:bar]{
  "labels": ["January", "February", "March"],
  "datasets": [{
    "label": "Sales ($)",
    "data": [12000, 15000, 18000],
    "backgroundColor": ["#FF6384", "#36A2EB", "#FFCE56"]
  }]
}[/chart]

The chart shows steady growth throughout the quarter.
```

### Line Chart for Trends
```
Website traffic over the past 6 months:

[chart:line]{
  "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  "datasets": [{
    "label": "Visitors",
    "data": [1200, 1900, 3000, 5000, 2300, 3200],
    "borderColor": "#36A2EB",
    "fill": false
  }]
}[/chart]

Notice the spike in April due to our marketing campaign.
```

### Pie Chart for Proportions
```
Budget allocation breakdown:

[chart:pie]{
  "labels": ["Development", "Marketing", "Operations", "Research"],
  "datasets": [{
    "data": [40, 25, 20, 15],
    "backgroundColor": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0"]
  }]
}[/chart]

Development takes the largest portion at 40% of the budget.
```

### CSV Data from URL
```
Here's the latest market data:

[chart:line]https://example.com/market-data.csv[/chart]

The chart automatically updates with the latest data from our API.
```

### Inline CSV Data
```
Comparison of different solutions:

[chart:bar]
Solution,Performance,Cost,Ease of Use
Solution A,85,100,70
Solution B,90,120,85
Solution C,75,80,90
[/chart]

Solution B offers the best performance but at higher cost.
```

## 4. Interactive Widget Examples

### React Calculator Widget
```
Try this interactive calculator:

[widget:react]
function Calculator() {
  const [result, setResult] = React.useState(0);
  const [input, setInput] = React.useState('');
  
  const calculate = () => {
    try {
      setResult(eval(input));
    } catch (e) {
      setResult('Error');
    }
  };
  
  return (
    <div style={{padding: '20px', border: '1px solid #ccc', borderRadius: '8px'}}>
      <h3>Simple Calculator</h3>
      <input 
        type="text" 
        value={input} 
        onChange={(e) => setInput(e.target.value)}
        placeholder="Enter calculation (e.g., 2+2)"
        style={{width: '200px', padding: '8px', marginRight: '10px'}}
      />
      <button onClick={calculate} style={{padding: '8px 16px'}}>Calculate</button>
      <div style={{marginTop: '10px', fontSize: '18px'}}>
        Result: <strong>{result}</strong>
      </div>
    </div>
  );
}
[/widget]

Enter mathematical expressions and click Calculate to see results.

*Note: This widget will be displayed in LibreChat's artifacts panel when clicked.*
```

### HTML Form Widget
```
Fill out this feedback form:

[widget:html]
<div style="padding: 20px; border: 1px solid #ddd; border-radius: 8px; max-width: 400px;">
  <h3>Feedback Form</h3>
  <form id="feedbackForm">
    <div style="margin-bottom: 15px;">
      <label for="name">Name:</label><br>
      <input type="text" id="name" name="name" style="width: 100%; padding: 8px; margin-top: 5px;">
    </div>
    <div style="margin-bottom: 15px;">
      <label for="rating">Rating:</label><br>
      <select id="rating" name="rating" style="width: 100%; padding: 8px; margin-top: 5px;">
        <option value="">Select rating</option>
        <option value="5">Excellent</option>
        <option value="4">Good</option>
        <option value="3">Average</option>
        <option value="2">Poor</option>
        <option value="1">Very Poor</option>
      </select>
    </div>
    <div style="margin-bottom: 15px;">
      <label for="comments">Comments:</label><br>
      <textarea id="comments" name="comments" rows="4" style="width: 100%; padding: 8px; margin-top: 5px;"></textarea>
    </div>
    <button type="button" onclick="submitFeedback()" style="background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px;">
      Submit Feedback
    </button>
  </form>
  <div id="result" style="margin-top: 15px; color: green;"></div>
</div>

<script>
function submitFeedback() {
  const name = document.getElementById('name').value;
  const rating = document.getElementById('rating').value;
  const comments = document.getElementById('comments').value;
  
  if (name && rating) {
    document.getElementById('result').innerHTML = 
      `Thank you ${name}! Your ${rating}-star rating has been recorded.`;
  } else {
    document.getElementById('result').innerHTML = 
      'Please fill in all required fields.';
    document.getElementById('result').style.color = 'red';
  }
}
</script>
[/widget]

This form demonstrates interactive HTML elements with JavaScript.

*Note: Interactive widgets are displayed in the artifacts panel for better security and user experience.*
```

### Configuration Tool Widget
```
Configure your settings:

[widget:react]
function ConfigTool() {
  const [config, setConfig] = React.useState({
    theme: 'light',
    notifications: true,
    autoSave: false,
    language: 'en'
  });
  
  const updateConfig = (key, value) => {
    setConfig(prev => ({...prev, [key]: value}));
  };
  
  return (
    <div style={{padding: '20px', border: '1px solid #ccc', borderRadius: '8px', maxWidth: '400px'}}>
      <h3>Settings Configuration</h3>
      
      <div style={{marginBottom: '15px'}}>
        <label>Theme:</label><br/>
        <select 
          value={config.theme} 
          onChange={(e) => updateConfig('theme', e.target.value)}
          style={{width: '100%', padding: '8px', marginTop: '5px'}}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="auto">Auto</option>
        </select>
      </div>
      
      <div style={{marginBottom: '15px'}}>
        <label>
          <input 
            type="checkbox" 
            checked={config.notifications}
            onChange={(e) => updateConfig('notifications', e.target.checked)}
            style={{marginRight: '8px'}}
          />
          Enable Notifications
        </label>
      </div>
      
      <div style={{marginBottom: '15px'}}>
        <label>
          <input 
            type="checkbox" 
            checked={config.autoSave}
            onChange={(e) => updateConfig('autoSave', e.target.checked)}
            style={{marginRight: '8px'}}
          />
          Auto-save Changes
        </label>
      </div>
      
      <div style={{marginBottom: '15px'}}>
        <label>Language:</label><br/>
        <select 
          value={config.language} 
          onChange={(e) => updateConfig('language', e.target.value)}
          style={{width: '100%', padding: '8px', marginTop: '5px'}}
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
        </select>
      </div>
      
      <div style={{marginTop: '20px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px'}}>
        <strong>Current Configuration:</strong>
        <pre style={{margin: '10px 0', fontSize: '12px'}}>
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>
    </div>
  );
}
[/widget]

Adjust the settings above to see the configuration update in real-time.
```

## 5. Code Execution Examples

### Python Data Analysis
```
Let's analyze some sample data:

[run:python]
import json
import statistics

# Sample sales data
sales_data = [1200, 1500, 1800, 1300, 1700, 1900, 1600]

# Calculate statistics
mean_sales = statistics.mean(sales_data)
median_sales = statistics.median(sales_data)
max_sales = max(sales_data)
min_sales = min(sales_data)

print(f"Sales Statistics:")
print(f"Mean: ${mean_sales:.2f}")
print(f"Median: ${median_sales:.2f}")
print(f"Max: ${max_sales}")
print(f"Min: ${min_sales}")
print(f"Range: ${max_sales - min_sales}")

# Create a simple trend analysis
trend = "increasing" if sales_data[-1] > sales_data[0] else "decreasing"
print(f"Overall trend: {trend}")
[/run]

The code above calculates key statistics for our sales data.
```

### JavaScript Algorithm Demo
```
Here's a sorting algorithm demonstration:

[run:javascript]
// Bubble sort implementation with step tracking
function bubbleSort(arr) {
    const n = arr.length;
    let steps = 0;
    let swaps = 0;
    
    console.log("Initial array:", arr);
    
    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - i - 1; j++) {
            steps++;
            if (arr[j] > arr[j + 1]) {
                // Swap elements
                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                swaps++;
            }
        }
        console.log(`After pass ${i + 1}:`, [...arr]);
    }
    
    console.log(`\nSorting completed!`);
    console.log(`Total steps: ${steps}`);
    console.log(`Total swaps: ${swaps}`);
    console.log(`Final sorted array:`, arr);
    
    return arr;
}

// Test with sample data
const numbers = [64, 34, 25, 12, 22, 11, 90];
bubbleSort([...numbers]);
[/run]

This demonstrates the bubble sort algorithm with step-by-step execution.
```

### Data Processing Pipeline
```
Let's process some CSV-like data:

[run:python]
# Simulate processing a CSV dataset
data = """Name,Age,Department,Salary
John,28,Engineering,75000
Sarah,32,Marketing,68000
Mike,25,Engineering,72000
Lisa,29,Sales,65000
Tom,35,Engineering,85000"""

lines = data.strip().split('\n')
headers = lines[0].split(',')
rows = [line.split(',') for line in lines[1:]]

print("Dataset Overview:")
print(f"Columns: {', '.join(headers)}")
print(f"Rows: {len(rows)}")
print()

# Calculate average salary by department
dept_salaries = {}
for row in rows:
    name, age, dept, salary = row
    salary = int(salary)
    if dept not in dept_salaries:
        dept_salaries[dept] = []
    dept_salaries[dept].append(salary)

print("Average Salary by Department:")
for dept, salaries in dept_salaries.items():
    avg_salary = sum(salaries) / len(salaries)
    print(f"{dept}: ${avg_salary:,.2f} ({len(salaries)} employees)")

# Find highest paid employee
highest_paid = max(rows, key=lambda x: int(x[3]))
print(f"\nHighest paid: {highest_paid[0]} (${int(highest_paid[3]):,})")
[/run]

This example shows data processing and analysis techniques.
```

## 6. Combined Examples

### Educational Math Lesson
```
# Quadratic Equations

A quadratic equation has the form ax² + bx + c = 0.

Let's solve the equation: 2x² + 5x - 3 = 0

[run:python]
import math

# Coefficients
a, b, c = 2, 5, -3

print(f"Solving: {a}x² + {b}x + {c} = 0")

# Calculate discriminant
discriminant = b**2 - 4*a*c
print(f"Discriminant: {b}² - 4({a})({c}) = {discriminant}")

if discriminant >= 0:
    x1 = (-b + math.sqrt(discriminant)) / (2*a)
    x2 = (-b - math.sqrt(discriminant)) / (2*a)
    print(f"Solutions: x₁ = {x1:.3f}, x₂ = {x2:.3f}")
else:
    print("No real solutions (complex roots)")
[/run]

Practice pronunciation: [tts:en-US]quadratic equation[/tts], [tts:en-US]discriminant[/tts]

Here's the graph of our equation:

[chart:line]{
  "labels": [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2],
  "datasets": [{
    "label": "2x² + 5x - 3",
    "data": [9, 4.5, 1, -1.5, -3, -3.5, -3, -1.5, 1, 4.5, 9],
    "borderColor": "#FF6384",
    "fill": false
  }]
}[/chart]

Try this interactive quadratic solver:

[widget:react]
function QuadraticSolver() {
  const [a, setA] = React.useState(2);
  const [b, setB] = React.useState(5);
  const [c, setC] = React.useState(-3);
  const [solutions, setSolutions] = React.useState(null);
  
  const solve = () => {
    const discriminant = b*b - 4*a*c;
    if (discriminant >= 0) {
      const x1 = (-b + Math.sqrt(discriminant)) / (2*a);
      const x2 = (-b - Math.sqrt(discriminant)) / (2*a);
      setSolutions({x1: x1.toFixed(3), x2: x2.toFixed(3), discriminant});
    } else {
      setSolutions({error: "No real solutions", discriminant});
    }
  };
  
  return (
    <div style={{padding: '20px', border: '1px solid #ccc', borderRadius: '8px'}}>
      <h3>Quadratic Equation Solver</h3>
      <div style={{marginBottom: '10px'}}>
        <input type="number" value={a} onChange={(e) => setA(Number(e.target.value))} style={{width: '60px', marginRight: '5px'}} />
        x² + 
        <input type="number" value={b} onChange={(e) => setB(Number(e.target.value))} style={{width: '60px', margin: '0 5px'}} />
        x + 
        <input type="number" value={c} onChange={(e) => setC(Number(e.target.value))} style={{width: '60px', marginLeft: '5px'}} />
        = 0
      </div>
      <button onClick={solve} style={{padding: '8px 16px', marginBottom: '10px'}}>Solve</button>
      {solutions && (
        <div>
          <p>Discriminant: {solutions.discriminant}</p>
          {solutions.error ? (
            <p style={{color: 'red'}}>{solutions.error}</p>
          ) : (
            <p>Solutions: x₁ = {solutions.x1}, x₂ = {solutions.x2}</p>
          )}
        </div>
      )}
    </div>
  );
}
[/widget]
```

This comprehensive example combines code execution, TTS, charts, and interactive widgets for an engaging educational experience.