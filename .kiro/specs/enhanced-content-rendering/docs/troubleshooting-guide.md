# Enhanced Content Troubleshooting Guide

## Common Issues and Solutions

### 1. Multimedia Content Issues

#### Problem: Images not displaying
**Symptoms:**
- Image URLs show as plain text
- Broken image icons appear
- Loading indicators never complete

**Solutions:**
1. **Check URL validity:**
   ```
   ✅ Correct: https://example.com/image.jpg
   ❌ Incorrect: www.example.com/image.jpg (missing protocol)
   ```

2. **Verify image format support:**
   - Supported: jpg, jpeg, png, gif, webp, svg
   - Unsupported: tiff, bmp, raw formats

3. **Check CORS headers:**
   - Ensure the image server allows cross-origin requests
   - Use images from trusted domains

4. **Test URL accessibility:**
   - Open the URL directly in browser
   - Check if authentication is required

#### Problem: Videos not playing
**Symptoms:**
- Video player shows but won't start
- "Format not supported" errors
- Audio plays but no video

**Solutions:**
1. **Use supported formats:**
   - Recommended: mp4 (H.264), webm
   - Avoid: avi, mov, wmv

2. **Check video encoding:**
   - Use web-compatible codecs
   - Ensure proper container format

3. **Verify file size:**
   - Large files may timeout
   - Consider using streaming URLs

#### Problem: Audio not working
**Symptoms:**
- Audio player appears but no sound
- Controls are disabled
- Format errors

**Solutions:**
1. **Check audio formats:**
   - Supported: mp3, wav, ogg, m4a
   - Ensure proper encoding

2. **Browser audio policy:**
   - Some browsers require user interaction before audio
   - Click play button manually first

3. **Volume settings:**
   - Check system volume
   - Check browser audio settings

### 2. Text-to-Speech Issues

#### Problem: TTS not working
**Symptoms:**
- Clickable text appears but no speech
- "TTS not supported" messages
- Silent playback

**Solutions:**
1. **Check browser support:**
   ```javascript
   // Test in browser console
   if ('speechSynthesis' in window) {
     console.log('TTS supported');
   } else {
     console.log('TTS not supported');
   }
   ```

2. **Verify language codes:**
   ```
   ✅ Correct: [tts:en-US]text[/tts]
   ❌ Incorrect: [tts:english]text[/tts]
   ```

3. **Browser-specific issues:**
   - **Chrome:** May require HTTPS for TTS
   - **Safari:** Limited voice selection
   - **Firefox:** May need manual voice installation

4. **System voices:**
   - Install additional system voices
   - Check system speech settings

#### Problem: Wrong language/accent
**Symptoms:**
- Text spoken in wrong language
- Incorrect pronunciation
- Fallback to default voice

**Solutions:**
1. **Use correct language codes:**
   ```
   en-US (American English)
   en-GB (British English)
   es-ES (Spanish - Spain)
   es-MX (Spanish - Mexico)
   fr-FR (French - France)
   de-DE (German)
   it-IT (Italian)
   pt-PT (Portuguese - Portugal)
   pt-BR (Portuguese - Brazil)
   pl-PL (Polish)
   ja-JP (Japanese)
   ko-KR (Korean)
   zh-CN (Chinese - Simplified)
   ```

2. **Check voice availability:**
   - Not all languages available on all systems
   - Install additional language packs

3. **Test voice selection:**
   ```javascript
   // List available voices
   speechSynthesis.getVoices().forEach(voice => {
     console.log(voice.name, voice.lang);
   });
   ```

### 3. Chart Rendering Issues

#### Problem: Charts not displaying
**Symptoms:**
- Empty chart containers
- "Invalid data" errors
- Loading indicators stuck

**Solutions:**
1. **Validate JSON format:**
   ```json
   ✅ Correct:
   {
     "labels": ["A", "B", "C"],
     "datasets": [{
       "data": [1, 2, 3]
     }]
   }
   
   ❌ Incorrect:
   {
     labels: [A, B, C],  // Missing quotes
     datasets: [{
       data: [1, 2, 3]
     }]
   }
   ```

2. **Check CSV format:**
   ```csv
   ✅ Correct:
   Label,Value
   A,1
   B,2
   C,3
   
   ❌ Incorrect:
   Label Value  // Missing comma
   A 1
   B 2
   ```

3. **Verify data URLs:**
   - Ensure CSV/JSON URLs are accessible
   - Check CORS headers
   - Test URL in browser

4. **Data type validation:**
   - Numeric data should be numbers, not strings
   - Labels should be strings
   - Check for null/undefined values

#### Problem: Chart displays incorrectly
**Symptoms:**
- Wrong chart type rendered
- Missing data points
- Incorrect scaling

**Solutions:**
1. **Use correct chart types:**
   ```
   bar - for categorical comparisons
   line - for trends over time
   pie - for proportions (percentages)
   scatter - for correlation analysis
   ```

2. **Check data structure:**
   - Bar/Line: Need labels and datasets
   - Pie: Need labels and single dataset
   - Scatter: Need x,y coordinate pairs

3. **Validate data ranges:**
   - Ensure numeric values are reasonable
   - Check for negative values in pie charts
   - Verify date formats for time series

### 4. Widget Execution Issues

#### Problem: Widgets not loading
**Symptoms:**
- Empty widget containers
- "Sandpack error" messages
- Infinite loading states

**Solutions:**
1. **Check code syntax:**
   ```javascript
   ✅ Correct React:
   function MyWidget() {
     return <div>Hello</div>;
   }
   
   ❌ Incorrect:
   function MyWidget() {
     return <div>Hello</div>  // Missing semicolon
   }
   ```

2. **Verify widget type:**
   ```
   [widget:react] - for React components
   [widget:html] - for HTML/CSS/JS
   ```

3. **Check dependencies:**
   - Only basic React hooks available
   - No external libraries by default
   - Use vanilla JavaScript for complex logic

4. **Memory limitations:**
   - Keep widgets simple
   - Avoid infinite loops
   - Clean up event listeners

#### Problem: Widget functionality broken
**Symptoms:**
- Widgets display but don't respond
- JavaScript errors in console
- State not updating

**Solutions:**
1. **React-specific issues:**
   ```javascript
   // Use React hooks properly
   const [state, setState] = React.useState(0);
   
   // Handle events correctly
   const handleClick = () => {
     setState(prev => prev + 1);
   };
   ```

2. **HTML widget issues:**
   ```html
   <!-- Ensure proper event binding -->
   <button onclick="myFunction()">Click</button>
   <script>
   function myFunction() {
     // Function implementation
   }
   </script>
   ```

3. **Scope issues:**
   - Variables must be properly scoped
   - Avoid global variable conflicts
   - Use proper closure patterns

### 5. Code Execution Issues

#### Problem: Code not executing
**Symptoms:**
- Execute button doesn't work
- "Execution failed" errors
- Timeout messages

**Solutions:**
1. **Check language support:**
   ```
   Supported: python, javascript, bash, go, rust
   Check LibreChat configuration for available languages
   ```

2. **Verify code syntax:**
   ```python
   ✅ Correct:
   print("Hello World")
   
   ❌ Incorrect:
   print "Hello World"  # Python 2 syntax
   ```

3. **Check execution environment:**
   - Limited execution time (usually 10 seconds)
   - No network access in some configurations
   - Limited memory and CPU

4. **Handle dependencies:**
   ```python
   # Check if modules are available
   try:
     import numpy as np
   except ImportError:
     print("NumPy not available")
   ```

#### Problem: Unexpected execution results
**Symptoms:**
- Wrong output displayed
- Missing output
- Error messages unclear

**Solutions:**
1. **Add debugging output:**
   ```python
   print("Debug: Starting calculation")
   result = complex_calculation()
   print(f"Debug: Result is {result}")
   ```

2. **Handle errors gracefully:**
   ```python
   try:
     risky_operation()
   except Exception as e:
     print(f"Error occurred: {e}")
   ```

3. **Check data types:**
   ```python
   # Ensure proper type conversion
   user_input = "123"
   number = int(user_input)  # Convert to integer
   ```

### 6. Performance Issues

#### Problem: Slow loading or rendering
**Symptoms:**
- Long loading times
- Browser becomes unresponsive
- Memory usage increases

**Solutions:**
1. **Optimize multimedia:**
   - Use compressed images
   - Choose appropriate video quality
   - Implement lazy loading

2. **Limit widget complexity:**
   - Avoid heavy computations
   - Use efficient algorithms
   - Implement proper cleanup

3. **Manage chart data:**
   - Limit data points (< 1000 for performance)
   - Use data sampling for large datasets
   - Implement pagination

4. **Browser resource management:**
   - Close unused tabs
   - Clear browser cache
   - Restart browser if needed

### 7. Mobile-Specific Issues

#### Problem: Content not mobile-friendly
**Symptoms:**
- Horizontal scrolling required
- Touch targets too small
- Content cut off

**Solutions:**
1. **Responsive design:**
   - Use relative units (%, em, rem)
   - Implement proper viewport settings
   - Test on actual mobile devices

2. **Touch interactions:**
   - Ensure minimum 44px touch targets
   - Add proper touch feedback
   - Avoid hover-only interactions

3. **Performance on mobile:**
   - Reduce image sizes
   - Limit widget complexity
   - Use mobile-optimized formats

### 8. Browser Compatibility Issues

#### Problem: Features not working in specific browsers
**Symptoms:**
- Different behavior across browsers
- Missing functionality
- Console errors

**Solutions:**
1. **Check feature support:**
   ```javascript
   // Test for specific features
   if ('speechSynthesis' in window) {
     // TTS supported
   }
   
   if (typeof IntersectionObserver !== 'undefined') {
     // Lazy loading supported
   }
   ```

2. **Browser-specific workarounds:**
   - **Safari:** May need webkit prefixes
   - **Firefox:** Different TTS implementation
   - **Edge:** Legacy compatibility issues

3. **Provide fallbacks:**
   - Show compatibility warnings
   - Offer alternative interactions
   - Graceful degradation

## Debugging Tools

### Browser Developer Tools
1. **Console:** Check for JavaScript errors
2. **Network:** Monitor resource loading
3. **Elements:** Inspect DOM structure
4. **Performance:** Analyze rendering performance

### Enhanced Content Debugging
```javascript
// Enable debug mode (if available)
window.enhancedContentDebug = true;

// Check component states
console.log('TTS Engine State:', window.ttsEngine?.getState());
console.log('Chart Instances:', window.chartInstances);
console.log('Widget Sandboxes:', window.widgetSandboxes);
```

### Testing Checklist
- [ ] Test in multiple browsers
- [ ] Verify mobile responsiveness
- [ ] Check accessibility features
- [ ] Test with slow network
- [ ] Validate with screen readers
- [ ] Test keyboard navigation
- [ ] Verify error handling
- [ ] Check memory usage
- [ ] Test with disabled JavaScript
- [ ] Validate HTTPS requirements

## Getting Help

### Community Resources
- LibreChat GitHub Issues
- Community Discord/Forums
- Documentation Wiki

### Reporting Bugs
When reporting issues, include:
1. Browser and version
2. Operating system
3. Enhanced content markup used
4. Console error messages
5. Steps to reproduce
6. Expected vs actual behavior

### Feature Requests
For new enhanced content features:
1. Describe the use case
2. Provide example markup
3. Consider security implications
4. Suggest implementation approach