/**
 * SafeGlow Audio Synthesizer using Web Audio API
 * Generates emergency sirens, realistic phone rings, and calming chimes
 * without needing external MP3 files.
 */

class SoundEffects {
    constructor() {
        this.ctx = null;
        this.sirenInterval = null;
        this.ringtoneInterval = null;
        this.activeOscillators = [];
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Loud, alternating emergency siren
     */
    startSiren() {
        this.init();
        this.stopSiren();

        let state = 0;
        const playTone = () => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            const freq = state === 0 ? 880 : 660; // alternating A5 and E5
            state = 1 - state;

            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(state === 0 ? 880 : 660, this.ctx.currentTime + 0.35);

            gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.38);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.4);
        };

        playTone();
        this.sirenInterval = setInterval(playTone, 400);
    }

    stopSiren() {
        if (this.sirenInterval) {
            clearInterval(this.sirenInterval);
            this.sirenInterval = null;
        }
    }

    /**
     * Realistic phone ringing tone (European/US double ring)
     */
    startRingtone() {
        this.init();
        this.stopRingtone();

        const playRingBurst = () => {
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            
            // First beep
            this._beep(440, 480, now, 0.4);
            // Short gap, second beep
            this._beep(440, 480, now + 0.6, 0.4);
        };

        playRingBurst();
        // Ring cycle repeats every 3 seconds
        this.ringtoneInterval = setInterval(playRingBurst, 3000);
    }

    _beep(freq1, freq2, startTime, duration) {
        if (!this.ctx) return;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(freq1, startTime);
        osc2.frequency.setValueAtTime(freq2, startTime);

        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.setValueAtTime(0.2, startTime + duration - 0.05);
        gain.gain.linearRampToValueAtTime(0.001, startTime + duration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + duration);
        osc2.stop(startTime + duration);
    }

    stopRingtone() {
        if (this.ringtoneInterval) {
            clearInterval(this.ringtoneInterval);
            this.ringtoneInterval = null;
        }
    }

    /**
     * Soft, soothing chime for safe status / notifications
     */
    playChime() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (major chord)

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const startTime = now + (idx * 0.09);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0.25, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + 0.85);
        });
    }
}

window.soundEffects = new SoundEffects();
