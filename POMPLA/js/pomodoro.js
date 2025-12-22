import { state, ICONS } from './state.js';
import { formatTime } from './utils.js';

// Variables locales para PiP y Título
let titleFlashInterval = null;
let originalTitle = document.title;
let pipVideo = document.createElement('video');
let pipCanvas = document.createElement('canvas');
let pipCtx = pipCanvas.getContext('2d');
let pipStream = null;
let isPipActive = false;

// Inicialización PiP (Elementos ocultos)
pipCanvas.width = 300;
pipCanvas.height = 300;
pipVideo.muted = true;
pipVideo.style.position = 'fixed';
pipVideo.style.opacity = '0';
pipVideo.style.pointerEvents = 'none';
pipVideo.style.height = '0';
pipVideo.style.width = '0';
document.body.appendChild(pipVideo); // Requerido para Firefox

export function updateTimerDisplay() {
    const timeStr = formatTime(state.timeLeft);
    const mainTimer = document.getElementById('main-timer');
    if (mainTimer) mainTimer.textContent = timeStr;

    const miniTimerTime = document.getElementById('mini-timer-time');
    if (miniTimerTime) miniTimerTime.textContent = timeStr;

    const miniTimerDesk = document.getElementById('mini-timer');
    if (miniTimerDesk) miniTimerDesk.textContent = timeStr;

    const miniBtn = document.getElementById('mini-timer-toggle');
    if (miniBtn) {
        miniBtn.innerHTML = state.isTimerRunning ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    }

    checkMiniTimerVisibility();
    document.title = `${timeStr} - Ceibo`;

    const circle = document.querySelector('.progress-ring__circle');
    if (circle) {
        const totalTime = state.pomodoro.isBreak ? state.pomodoro.breakTime * 60 : state.pomodoro.workTime * 60;
        const radius = circle.r.baseVal.value;
        const circumference = radius * 2 * Math.PI;
        const offset = circumference - (state.timeLeft / totalTime) * circumference;
        circle.style.strokeDashoffset = offset;
    }

    const cycleDisplay = document.getElementById('cycle-display');
    if (cycleDisplay && state.pomodoro) {
        cycleDisplay.textContent = `${state.pomodoro.cycle}/${state.pomodoro.totalCycles} - ${state.pomodoro.isBreak ? 'Descanso' : 'Trabajo'}`;
    }

    if (isPipActive) drawPiP();
}

function checkMiniTimerVisibility() {
    const miniTimerEl = document.getElementById('mobile-mini-timer');
    const panel = document.getElementById('pomodoro-panel');
    const isPanelVisible = panel && panel.style.display !== 'none';
    const isMobile = window.innerWidth <= 768;

    if (!miniTimerEl) return;

    if (isMobile) {
        if (state.isTimerRunning && !isPanelVisible) miniTimerEl.classList.remove('hidden');
        else miniTimerEl.classList.add('hidden');
    } else {
        miniTimerEl.classList.add('hidden');
    }
}

export function toggleTimer() {
    if (Notification.permission === 'default') Notification.requestPermission();

    if (state.isTimerRunning) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        state.isTimerRunning = false;
        updatePlayPauseButtons(false);
    } else {
        state.isTimerRunning = true;
        updatePlayPauseButtons(true);
        state.timerInterval = setInterval(() => {
            if (state.timeLeft > 0) {
                state.timeLeft--;
                updateTimerDisplay();
            } else {
                completeCycle();
            }
        }, 1000);
    }
}

function updatePlayPauseButtons(isPlaying) {
    const icon = isPlaying ? '<i class="fa-solid fa-pause"></i>' : ICONS.play;
    const ids = ['pomodoro-start', 'mini-play-btn', 'mini-timer-toggle'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = icon;
    });
}

export function resetTimer() {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    state.isTimerRunning = false;
    state.timeLeft = (state.pomodoro.isBreak ? state.pomodoro.breakTime : state.pomodoro.workTime) * 60;
    updateTimerDisplay();
    updatePlayPauseButtons(false);
}

export function adjustTimer(minutes) {
    state.timeLeft += minutes * 60;
    if (state.timeLeft < 0) state.timeLeft = 0;
    updateTimerDisplay();
}

export function startPomodoroForTask(id) {
    state.activeTaskId = id;
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    // Log Session
    if (!task.sessions) task.sessions = [];
    const lastSession = task.sessions.length > 0 ? task.sessions[task.sessions.length - 1] : null;
    if (!lastSession || lastSession.end) {
        task.sessions.push({ start: new Date().toISOString(), end: null });
        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(id, { sessions: task.sessions });
        }
    }

    // UI Updates
    const nameEls = ['active-task-name', 'mini-task-name-desktop', 'mini-task-name-mobile'];
    nameEls.forEach(elId => {
        const el = document.getElementById(elId);
        if (el) {
            el.textContent = task.title;
            el.style.display = elId === 'active-task-name' ? 'block' : (elId.includes('desktop') ? 'inline-block' : 'block');
        }
    });

    document.getElementById('pomodoro-panel').style.display = 'flex';

    const settings = task.pomodoroSettings || { cycles: 1, work: 25, break: 5 };
    state.pomodoro = {
        cycle: 1,
        isBreak: false,
        totalCycles: settings.cycles,
        workTime: settings.work,
        breakTime: settings.break
    };
    state.timeLeft = state.pomodoro.workTime * 60;

    updateTimerDisplay();
    toggleTimer();
}

export function changeCycle(direction) {
    if (!state.pomodoro) return;
    let totalPhases = state.pomodoro.totalCycles * 2;
    let currentPhaseIndex = (state.pomodoro.cycle - 1) * 2 + (state.pomodoro.isBreak ? 1 : 0);
    let nextPhaseIndex = currentPhaseIndex + direction;

    if (nextPhaseIndex < 0) { nextPhaseIndex = 0; }
    else if (nextPhaseIndex >= totalPhases) { return; }

    if (state.isTimerRunning) {
        clearInterval(state.timerInterval);
        state.isTimerRunning = false;
        updatePlayPauseButtons(false);
    }

    state.pomodoro.cycle = Math.floor(nextPhaseIndex / 2) + 1;
    state.pomodoro.isBreak = (nextPhaseIndex % 2) === 1;
    state.timeLeft = (state.pomodoro.isBreak ? state.pomodoro.breakTime : state.pomodoro.workTime) * 60;
    updateTimerDisplay();
}

function completeCycle() {
    const timerSound = document.getElementById('timer-sound');
    if (timerSound) timerSound.play().catch(e => console.log('Audio error', e));

    if (state.pomodoro.isBreak) {
        state.pomodoro.isBreak = false;
        state.pomodoro.cycle++;

        if (state.pomodoro.cycle > state.pomodoro.totalCycles) {
            // STOP
            clearInterval(state.timerInterval);
            state.timerInterval = null;
            state.isTimerRunning = false;
            updatePlayPauseButtons(false);

            if (state.activeTaskId && window.updateTaskInFirebase) {
                const task = state.tasks.find(t => t.id === state.activeTaskId);
                if (task) window.updateTaskInFirebase(task.id, { pomodoros: (task.pomodoros || 0) + state.pomodoro.totalCycles });
            }
            resetTimer();
            notifyCompletion("¡Todos los ciclos completados!");
            return;
        } else {
            // Auto-Start Work
            state.timeLeft = state.pomodoro.workTime * 60;
            const timeStr = formatTime(state.timeLeft);
            notifyCompletion(`¡Descanso terminado! A continuación ${timeStr} de Trabajo`);
        }
    } else {
        // Auto-Start Break
        state.pomodoro.isBreak = true;
        state.timeLeft = state.pomodoro.breakTime * 60;
        const timeStr = formatTime(state.timeLeft);
        notifyCompletion(`¡Trabajo terminado! A continuación ${timeStr} de Descanso`);
    }
    updateTimerDisplay();
}

// --- NOTIFICACIONES & TITLE FLASH ---

function notifyCompletion(message) {
    if (Notification.permission === 'granted') {
        new Notification('Pomodoro Planner', { body: message, icon: 'favicon.ico' });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    if (document.hidden) startTitleFlash(message);

    setTimeout(() => { alert(message); }, 50);
}

function startTitleFlash(message) {
    if (titleFlashInterval) clearInterval(titleFlashInterval);
    let flash = false;
    titleFlashInterval = setInterval(() => {
        document.title = flash ? message : "¡TIEMPO!";
        flash = !flash;
    }, 1000);
}

export function stopTitleFlash() {
    if (titleFlashInterval) {
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
        document.title = originalTitle;
    }
}

// --- PICTURE IN PICTURE (PiP) ---

export function togglePiP() {
    if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
    } else {
        enterPiP();
    }
}

async function enterPiP() {
    // 1. Ensure Canvas & Stream are ready
    drawPiP();
    if (!pipStream) {
        pipStream = pipCanvas.captureStream(30);
        pipVideo.srcObject = pipStream;
    }

    if (pipVideo.readyState === 0) {
        await new Promise(resolve => { pipVideo.onloadedmetadata = () => resolve(); });
    }

    // Attempt play (needed for stream to be active)
    try {
        await pipVideo.play();
    } catch (e) {
        console.warn("Video play failed (autoplay policy?)", e);
    }

    // 2. Firefox/Safari force manual
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isFirefox || isSafari) {
        enableManualPiP();
        return;
    }

    try {
        // 3. Native PiP Request
        if (document.pictureInPictureEnabled && typeof pipVideo.requestPictureInPicture === 'function') {
            await pipVideo.requestPictureInPicture();
            isPipActive = true;
        } else {
            throw new Error("PiP API not available");
        }
    } catch (error) {
        console.error("PiP failed, trying fallback:", error);
        enableManualPiP();
    }
}

function enableManualPiP() {
    alert("Tu navegador (Firefox/Safari) requiere activación manual.");
    const container = document.querySelector('#pomodoro-panel');
    if (!container) return;

    pipVideo.style.position = 'static';
    pipVideo.style.opacity = '1';
    pipVideo.style.pointerEvents = 'all';
    pipVideo.style.height = '150px';
    pipVideo.style.width = '100%';
    pipVideo.style.marginTop = '10px';
    pipVideo.style.border = '1px solid var(--glass-border)';
    pipVideo.style.borderRadius = '8px';
    pipVideo.controls = true;

    const controls = container.querySelector('.timer-controls');
    if (controls) controls.parentNode.insertBefore(pipVideo, controls.nextSibling);
    else container.appendChild(pipVideo);

    let hideBtn = document.getElementById('manual-pip-hide');
    if (!hideBtn) {
        hideBtn = document.createElement('button');
        hideBtn.id = 'manual-pip-hide';
        hideBtn.className = 'btn-secondary';
        hideBtn.style.width = '100%';
        hideBtn.style.marginTop = '5px';
        hideBtn.innerText = 'Ocultar Vista Previa';
        hideBtn.onclick = () => {
            pipVideo.style.position = 'fixed';
            pipVideo.style.opacity = '0';
            pipVideo.style.pointerEvents = 'none';
            pipVideo.style.height = '0';
            hideBtn.remove();
        };
        pipVideo.parentNode.insertBefore(hideBtn, pipVideo.nextSibling);
    }
    isPipActive = true;
    drawPiP();
}

function drawPiP() {
    const styles = getComputedStyle(document.documentElement);
    const bgColor = styles.getPropertyValue('--card-bg').trim() || '#18181b';
    const textColor = styles.getPropertyValue('--text-primary').trim() || '#f4f4f5';
    const secondaryColor = styles.getPropertyValue('--text-secondary').trim() || '#a1a1aa';
    const successColor = styles.getPropertyValue('--success-color').trim() || '#22c55e';

    pipCtx.fillStyle = bgColor;
    pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);

    const minutes = Math.floor(state.timeLeft / 60);
    const seconds = state.timeLeft % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    pipCtx.fillStyle = textColor;
    pipCtx.font = 'bold 80px sans-serif';
    pipCtx.textAlign = 'center';
    pipCtx.textBaseline = 'middle';
    pipCtx.fillText(timeStr, 150, 120);

    pipCtx.font = '30px sans-serif';
    pipCtx.fillStyle = state.pomodoro.isBreak ? successColor : secondaryColor;
    const phaseText = state.pomodoro.isBreak ? "Descanso" : "Trabajo";
    pipCtx.fillText(phaseText, 150, 200);

    pipCtx.font = '20px sans-serif';
    pipCtx.fillStyle = secondaryColor;
    pipCtx.fillText(`Ciclo ${state.pomodoro.cycle}/${state.pomodoro.totalCycles}`, 150, 240);
}