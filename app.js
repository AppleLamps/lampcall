class FakeACall {
    constructor() {
        this.apiKey = 'AIzaSyAjv7pwBkkypwNZatGfqs-QFsjEgb00b40';
        this.model = 'gemini-live-2.5-flash-preview';
        this.audioContext = null;
        this.mediaStream = null;
        this.session = null;
        this.isCalling = false;
        this.ringInterval = null;
        this.callStartTime = null;
        
        // iPhone UI elements
        this.ringingScreen = document.getElementById('ringingScreen');
        this.activeCallScreen = document.getElementById('activeCallScreen');
        this.ringTimer = document.getElementById('ringTimer');
        this.callTimer = document.getElementById('callTimer');
        this.declineCallBtn = document.getElementById('declineCall');
        this.answerCallBtn = document.getElementById('answerCall');
        this.endCallBtn = document.getElementById('endCall');
        this.muteCallBtn = document.getElementById('muteCall');
        this.speakerCallBtn = document.getElementById('speakerCall');
        
        this.init();
    }
    
    init() {
        // Set up event listeners for iPhone UI
        this.declineCallBtn.addEventListener('click', () => this.endCall());
        this.answerCallBtn.addEventListener('click', () => this.answerCall());
        this.endCallBtn.addEventListener('click', () => this.endCall());
        this.muteCallBtn.addEventListener('click', () => this.toggleMute());
        this.speakerCallBtn.addEventListener('click', () => this.toggleSpeaker());
        
        // Auto-answer after ringtone completes
        this.startCall();
    }
    
    async startCall() {
        if (this.isCalling) return;
        
        this.isCalling = true;
        this.showRingingUI();
        
        // Start timer
        this.updateRingTimer();
        this.ringInterval = setInterval(() => this.updateRingTimer(), 1000);
        
        // Play ringtone for 2-3 seconds
        await this.playRingtone();
        
        // Auto-answer after ringtone
        this.answerCall();
    }
    
    answerCall() {
        // Stop ringtone and timer
        if (this.ringInterval) {
            clearInterval(this.ringInterval);
            this.ringInterval = null;
        }
        
        // Show active call screen
        this.ringingScreen.classList.add('hidden');
        this.activeCallScreen.classList.remove('hidden');
        
        // Start call timer
        this.callStartTime = Date.now();
        this.updateCallTimer();
        setInterval(() => this.updateCallTimer(), 1000);
        
        // Initialize audio context and connect to Gemini
        this.setupAudioAndConnect();
    }
    
    showRingingUI() {
        this.ringingScreen.classList.remove('hidden');
        this.activeCallScreen.classList.add('hidden');
    }
    
    hideCallingUI() {
        this.ringingScreen.classList.add('hidden');
        this.activeCallScreen.classList.add('hidden');
    }
    
    updateRingTimer() {
        const now = new Date();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds() % 60).padStart(2, '0');
        this.ringTimer.textContent = `${minutes}:${seconds}`;
    }
    
    updateCallTimer() {
        if (!this.callStartTime) return;
        
        const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
        const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const seconds = String(elapsed % 60).padStart(2, '0');
        this.callTimer.textContent = `${minutes}:${seconds}`;
    }
    
    toggleMute() {
        if (!this.mediaStream) return;
        
        const audioTracks = this.mediaStream.getAudioTracks();
        audioTracks.forEach(track => {
            track.enabled = !track.enabled;
        });
        
        // Update button appearance
        this.muteCallBtn.classList.toggle('active');
    }
    
    toggleSpeaker() {
        // In a real implementation, this would toggle speaker mode
        // For web, we'll just simulate the action
        this.speakerCallBtn.classList.toggle('active');
    }
    
    async playRingtone() {
        // Create audio context for ringtone
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create oscillator for ringtone sound
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Configure ringtone (standard telephone ring)
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
        
        // Create ring pattern (ring for 0.5s, pause for 0.5s, repeat)
        const now = this.audioContext.currentTime;
        for (let i = 0; i < 3; i++) {
            const startTime = now + i * 1;
            const endTime = startTime + 0.5;
            
            gainNode.gain.setValueAtTime(0.3, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, endTime);
        }
        
        // Connect nodes
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Start and stop oscillator
        oscillator.start(now);
        oscillator.stop(now + 3); // Stop after 3 seconds
        
        // Wait for ringtone to complete
        return new Promise(resolve => {
            setTimeout(resolve, 3000);
        });
    }
    
    async setupAudioAndConnect() {
        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            // Initialize Google GenAI client
            const ai = new GoogleGenAI({
                apiKey: this.apiKey
            });
            
            // Configure session
            const config = {
                responseModalities: [GoogleGenAI.Modality.AUDIO],
                systemInstruction: "You are a slightly urgent friend or colleague calling to quickly state your point. Keep responses concise and natural, allowing the user to end the conversation naturally."
            };
            
            // Connect to Gemini Live API
            this.session = await ai.live.connect({
                model: this.model,
                callbacks: {
                    onopen: () => this.onConnectionOpen(),
                    onmessage: (message) => this.onMessageReceived(message),
                    onerror: (error) => this.onConnectionError(error),
                    onclose: (closeEvent) => this.onConnectionClose(closeEvent)
                },
                config: config
            });
            
            // Set up audio processing
            this.setupAudioProcessing();
            
        } catch (error) {
            console.error('Error setting up call:', error);
            this.endCall();
            alert('Failed to establish call. Please check microphone permissions and try again.');
        }
    }
    
    setupAudioProcessing() {
        // Create audio context for processing
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create media stream source from microphone
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        // Create a script processor to capture audio data
        const scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        source.connect(scriptProcessor);
        scriptProcessor.connect(this.audioContext.destination);
        
        // Process audio data
        scriptProcessor.onaudioprocess = (event) => {
            if (!this.session) return;
            
            // Get audio data from the input buffer
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            // Convert float32 to int16 (16-bit PCM)
            const int16Data = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                // Convert float to int16
                const sample = Math.max(-1, Math.min(1, inputData[i]));
                int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            }
            
            // Convert to base64
            const base64Data = btoa(String.fromCharCode(...new Uint8Array(int16Data.buffer)));
            
            // Send audio to Gemini
            this.session.sendRealtimeInput({
                audio: {
                    data: base64Data,
                    mimeType: "audio/pcm;rate=16000"
                }
            });
        };
    }
    
    onConnectionOpen() {
        console.log('Connected to Gemini Live API');
    }
    
    onMessageReceived(message) {
        if (message.data) {
            // Play audio response
            this.playAudioResponse(message.data);
        }
    }
    
    async playAudioResponse(base64Audio) {
        try {
            // Convert base64 to array buffer
            const binaryString = atob(base64Audio);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Decode audio data (24kHz as specified in documentation)
            const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);
            
            // Play audio
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();
        } catch (error) {
            console.error('Error playing audio response:', error);
        }
    }
    
    onConnectionError(error) {
        console.error('Connection error:', error);
        this.endCall();
    }
    
    onConnectionClose(closeEvent) {
        console.log('Connection closed:', closeEvent);
        this.endCall();
    }
    
    endCall() {
        // Clean up resources
        if (this.session) {
            this.session.close();
            this.session = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.isCalling = false;
        this.hideCallingUI();
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new FakeACall();
});
