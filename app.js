document.addEventListener('DOMContentLoaded', () => {
    const ringingScreen = document.getElementById('ringingScreen');
    const activeCallScreen = document.getElementById('activeCallScreen');
    
    const answerCallBtn = document.getElementById('answerCall');
    const declineCallBtn = document.getElementById('declineCall');
    const endCallBtn = document.getElementById('endCall');
    
    const callTimer = document.getElementById('callTimer');
    
    let timerInterval;
    let seconds = 0;

    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    function startTimer() {
        seconds = 0;
        callTimer.textContent = formatTime(seconds);
        timerInterval = setInterval(() => {
            seconds++;
            callTimer.textContent = formatTime(seconds);
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function showActiveCallScreen() {
        ringingScreen.classList.remove('active');
        ringingScreen.classList.add('hidden');
        activeCallScreen.classList.remove('hidden');
        activeCallScreen.classList.add('active');
        startTimer();
    }

    function showRingingScreen() {
        activeCallScreen.classList.remove('active');
        activeCallScreen.classList.add('hidden');
        ringingScreen.classList.remove('hidden');
        ringingScreen.classList.add('active');
        stopTimer();
    }

    answerCallBtn.addEventListener('click', () => {
        showActiveCallScreen();
    });

    declineCallBtn.addEventListener('click', () => {
        // For now, just goes back to a "blank" state.
        // In a real app, this would hang up the call.
        alert("Call declined");
    });

    endCallBtn.addEventListener('click', () => {
        showRingingScreen();
    });
});
