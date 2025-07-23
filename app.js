class FakeACall {
    constructor() {
        this.apiKey = ''; // Will be set by user
        this.websocket = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.processorNode = null;
        this.outputBuffer = [];
        this.isMuted = false;
        this.isSpeaker = false;
        this.callActive = false;
        this.ringtoneAudio = null;
        this.setupEventListeners();
        this.initRingtone();
    }

    setupEventListeners() {
        document.getElementById('answerCall').addEventListener('click', () => this.answerCall());
        document.getElementById('declineCall').addEventListener('click', () => this.endCall());
        document.getElementById('endCall').addEventListener('click', () => this.endCall());
        document.getElementById('muteCall').addEventListener('click', () => this.toggleMute());
        document.getElementById('speakerCall').addEventListener('click', () => this.toggleSpeaker());
    }

    initRingtone() {
        // Create a simple ringtone using Web Audio API
        this.ringtoneAudio = new Audio();
        this.ringtoneAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
        
        // Create a more realistic ringtone if data URL doesn't work
        if (!this.ringtoneAudio.src) {
            this.createRingtone();
        }
    }

    createRingtone() {
        // Create a simple ringtone using Web Audio API
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime + 0.5);
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 1);
            oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime + 1.5);
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime + 2);
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + 2);
        } catch (e) {
            console.error('Error creating ringtone:', e);
        }
    }

    async requestMicrophoneAccess() {
        try {
            // Check if browser supports required APIs
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Your browser does not support microphone access');
            }

            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });

            // Initialize Web Audio API
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });

            // Create audio source from microphone
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Create script processor for audio processing
            this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            this.processorNode.onaudioprocess = (event) => {
                if (this.websocket?.readyState === WebSocket.OPEN && !this.isMuted) {
                    const inputData = event.inputBuffer.getChannelData(0);
                    // Convert to 16-bit PCM
                    const buffer = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        buffer[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
                    }
                    this.websocket.send(buffer.buffer);
                }
            };

            // Connect nodes
            this.sourceNode.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);

            return true;
        } catch (error) {
            console.error('Microphone access error:', error);
            let errorMessage = 'Microphone access denied. ';
            
            switch (error.name) {
                case 'NotAllowedError':
                    errorMessage += 'Please allow microphone access in your browser settings.';
                    break;
                case 'NotFoundError':
                    errorMessage += 'No microphone was found. Please check your audio devices.';
                    break;
                case 'NotReadableError':
                    errorMessage += 'Microphone is in use by another application.';
                    break;
                case 'SecurityError':
                    errorMessage += 'Microphone access is blocked. Please use HTTPS or localhost.';
                    break;
                default:
                    errorMessage += 'Please check your microphone permissions and try again.';
            }
            
            this.showErrorMessage(errorMessage);
            return false;
        }
    }

    async connectToGemini() {
        try {
            // Validate API key
            if (!this.apiKey) {
                this.showErrorMessage('Please enter a valid API key');
                return false;
            }

            // Connect to Gemini Live API via WebSocket
            const url = `wss://generativelanguage.googleapis.com/v1beta/live:streamGenerateContent?key=${this.apiKey}`;
            this.websocket = new WebSocket(url);

            this.websocket.onopen = async () => {
                console.log('Connected to Gemini Live API');
                
                // Send initial configuration
                const config = {
                    model: 'gemini-2.5-flash-preview-native-audio-dialog',
                    config: {
                        responseModalities: ['AUDIO'],
                        systemInstruction: 'You are a helpful assistant in a phone call simulation. Respond naturally and conversationally.'
                    }
                };
                
                this.websocket.send(JSON.stringify(config));
            };

            this.websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.error) {
                    this.showErrorMessage(`API Error: ${data.error.message}`);
                    return;
                }
                
                if (data.response?.audio) {
                    // Handle audio response
                    this.playAudioResponse(data.response.audio);
                }
            };

            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.showErrorMessage('Connection error. Please check your API key and internet connection.');
            };

            this.websocket.onclose = () => {
                console.log('WebSocket connection closed');
                if (this.callActive) {
                    this.endCall();
                }
            };

            return true;
        } catch (error) {
            console.error('Connection error:', error);
            this.showErrorMessage('Failed to connect to Gemini API. Please check your API key.');
            return false;
        }
    }

    playAudioResponse(audioData) {
        try {
            // Convert base64 to ArrayBuffer if needed
            let audioBuffer;
            if (typeof audioData === 'string') {
                const binaryString = atob(audioData);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                audioBuffer = bytes.buffer;
            } else {
                audioBuffer = audioData;
            }

            // Play audio
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 24000
                });
            }

            this.audioContext.decodeAudioData(audioBuffer, (buffer) => {
                const source = this.audioContext.createBufferSource();
                source.buffer = buffer;
                
                // Apply speaker mode if enabled
                const gainNode = this.audioContext.createGain();
                gainNode.gain.value = this.isSpeaker ? 2 : 1;
                
                source.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                source.start();
            });
        } catch (error) {
            console.error('Error playing audio:', error);
        }
    }

    async answerCall() {
        // Show active call screen
        document.getElementById('ringingScreen').classList.remove('active');
        document.getElementById('ringingScreen').classList.add('hidden');
        document.getElementById('activeCallScreen').classList.remove('hidden');
        document.getElementById('activeCallScreen').classList.add('active');

        // Stop ringtone
        if (this.ringtoneAudio) {
            this.ringtoneAudio.pause();
        }

        // Start call timer
        this.startCallTimer();

        // Request microphone access
        const micAccess = await this.requestMicrophoneAccess();
        if (!micAccess) {
            this.endCall();
            return;
        }

        // Connect to Gemini API
        const apiConnected = await this.connectToGemini();
        if (!apiConnected) {
            this.endCall();
            return;
        }

        // Start audio level visualization
        this.startAudioVisualization();

        this.callActive = true;
    }
    
    startAudioVisualization() {
        // Simple audio level visualization
        const bars = document.querySelectorAll('#audioLevel .bar');
        let level = 0;
        
        // Simulate audio levels (in a real app, this would be based on actual audio input)
        this.audioInterval = setInterval(() => {
            // Random fluctuation for demo purposes
            level = Math.random() * 100;
            
            // Update each bar with slightly different values for a more natural look
            bars.forEach((bar, index) => {
                const variation = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
                const barLevel = Math.min(100, level * variation);
                bar.style.height = `${Math.max(20, barLevel)}%`;
            });
        }, 100);
    }
    
    stopAudioVisualization() {
        if (this.audioInterval) {
            clearInterval(this.audioInterval);
            this.audioInterval = null;
        }
        
        // Reset bars to minimum height
        const bars = document.querySelectorAll('#audioLevel .bar');
        bars.forEach(bar => {
            bar.style.height = '20%';
        });
    }

    endCall() {
        // Reset to ringing screen
        document.getElementById('activeCallScreen').classList.remove('active');
        document.getElementById('activeCallScreen').classList.add('hidden');
        document.getElementById('ringingScreen').classList.remove('hidden');
        document.getElementById('ringingScreen').classList.add('active');

        // Reset timers
        this.stopCallTimer();
        this.resetRingTimer();

        // Stop audio visualization
        this.stopAudioVisualization();

        // Clean up resources
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }

        if (this.processorNode) {
            this.processorNode.disconnect();
            this.processorNode = null;
        }

        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.callActive = false;
        this.isMuted = false;
        document.getElementById('muteCall').innerHTML = '<div class="icon">🎤</div><span>Mute</span>';
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        const muteButton = document.getElementById('muteCall');
        if (this.isMuted) {
            muteButton.innerHTML = '<div class="icon">🔇</div><span>Unmute</span>';
            muteButton.classList.add('active');
        } else {
            muteButton.innerHTML = '<div class="icon">🎤</div><span>Mute</span>';
            muteButton.classList.remove('active');
        }
    }

    toggleSpeaker() {
        this.isSpeaker = !this.isSpeaker;
        const speakerButton = document.getElementById('speakerCall');
        if (this.isSpeaker) {
            speakerButton.innerHTML = '<div class="icon">📢</div><span>Normal</span>';
            speakerButton.classList.add('active');
        } else {
            speakerButton.innerHTML = '<div class="icon">🔊</div><span>Speaker</span>';
            speakerButton.classList.remove('active');
        }
    }

    startCallTimer() {
        let seconds = 0;
        this.callTimerInterval = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            document.getElementById('callTimer').textContent = `${mins}:${secs}`;
        }, 1000);
    }

    stopCallTimer() {
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
    }

    resetRingTimer() {
        if (this.ringTimerInterval) {
            clearInterval(this.ringTimerInterval);
            this.ringTimerInterval = null;
        }
        document.getElementById('ringTimer').textContent = '00:00';
    }

    showErrorMessage(message) {
        // Create error message element if it doesn't exist
        let errorElement = document.getElementById('errorMessage');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'errorMessage';
            errorElement.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #ff3b30;
                color: white;
                padding: 10px 20px;
                border-radius: 8px;
                z-index: 1000;
                font-size: 14px;
                text-align: center;
            `;
            document.body.appendChild(errorElement);
        }
        
        errorElement.textContent = message;
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorElement && errorElement.parentNode) {
                errorElement.parentNode.removeChild(errorElement);
            }
        }, 5000);
    }
}

// Initialize the app when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.fakeACall = new FakeACall();
    
    // Auto-answer after 3 rings (approximately 6 seconds)
    setTimeout(() => {
        if (document.getElementById('ringingScreen').classList.contains('active')) {
            window.fakeACall.answerCall();
        }
    }, 6000);
});
