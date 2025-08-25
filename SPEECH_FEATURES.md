# Speech-to-Text Improvements

This document describes the enhanced speech-to-text functionality implemented to address issues with text deletion during thinking pauses.

## Features

### 🎤 Configurable Silence Timeout
- **Range**: 1-15 seconds (default: 8 seconds)
- **Location**: Settings → Speech → Advanced → Silence timeout
- **Purpose**: Prevents premature recording termination during natural pauses while speaking
- **Previous Issue**: Fixed hardcoded 3-second timeout that was too short for thinking pauses

### 📝 Text Accumulation
- **Functionality**: Preserves previously spoken text across multiple speech recognition sessions
- **Benefit**: No more lost words when taking pauses to think while speaking
- **Implementation**: Works with both browser and external STT engines
- **Previous Issue**: Fixed text deletion after pauses in continuous speech

### 🎯 Manual Text Control
- **Double-click microphone**: Manually clear accumulated speech text
- **Toast notification**: Confirms when text is cleared
- **Use case**: Start fresh when you want to discard accumulated text

## Usage

### Basic Usage
1. Click microphone to start speech recognition
2. Speak naturally with pauses for thinking
3. Text accumulates across pauses (no deletion)
4. Click microphone again to stop
5. Double-click microphone to clear accumulated text

### Advanced Configuration
1. Go to **Settings** → **Speech** → **Advanced**
2. Enable **"Auto transcribe audio"**
3. Adjust **"Silence timeout"** slider (1-15 seconds)
4. Configure **"Decibel value"** for sensitivity
5. Set **"Auto send text"** delay if desired

## Technical Implementation

### Browser STT Engine
- Uses `react-speech-recognition` library
- Implements text accumulation with `accumulatedText` ref
- Clears text only after successful message submission
- Supports continuous speech recognition

### External STT Engine
- Uses MediaRecorder API with configurable silence detection
- Configurable timeout replaces hardcoded 3-second limit
- Accumulates text from multiple audio recordings
- Automatic silence detection with AudioContext analysis

### Settings Storage
- `silenceTimeoutMs`: New setting for configurable timeout (default: 8000)
- Persisted in localStorage via Recoil atoms
- Integrates with existing speech settings

## Compatibility

- **Browser STT**: Chrome, Edge, Safari (with Web Speech API support)
- **External STT**: All browsers with MediaRecorder API support
- **Engines**: OpenAI Whisper, Azure Speech, external speech services
- **Backwards Compatible**: Existing functionality preserved

## Accessibility

- ARIA labels for all controls
- Keyboard navigation support
- Screen reader compatibility
- Visual feedback for speech states (listening/loading/idle)

## Testing

Comprehensive test coverage includes:
- Component rendering and interactions
- Hook functionality and state management
- Settings persistence and validation
- Integration scenarios
- Accessibility compliance

## Migration Notes

This is a backwards-compatible enhancement. Existing users will:
- Keep current speech settings
- Get new 8-second default timeout (vs. previous 3-second hardcoded)
- Benefit from text accumulation automatically
- Can access new features in advanced settings

No breaking changes or migration steps required.