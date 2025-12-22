// js/utils.js

export function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getTodayDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function calculateNextOccurrence(currentDateStr, recurrence, recurrenceDays) {
    const date = new Date(currentDateStr + 'T00:00:00');
    let nextDate = new Date(date);
    if (recurrence === 'daily') nextDate.setDate(date.getDate() + 1);
    else if (recurrence === 'weekly') nextDate.setDate(date.getDate() + 7);
    else if (recurrence === 'monthly') nextDate.setMonth(date.getMonth() + 1);
    else if (recurrence === 'custom') {
        if (!recurrenceDays || recurrenceDays.length === 0) return null;
        const sortedDays = [...recurrenceDays].sort((a, b) => a - b);
        const currentDay = date.getDay();
        let nextDay = sortedDays.find(d => d > currentDay);
        if (nextDay !== undefined) {
            nextDate.setDate(date.getDate() + (nextDay - currentDay));
        } else {
            nextDay = sortedDays[0];
            const daysUntilNextWeek = 7 - currentDay + nextDay;
            nextDate.setDate(date.getDate() + daysUntilNextWeek);
        }
    }
    return nextDate.toISOString().split('T')[0];
}

export function isTaskOnDate(task, targetDateObj) {
    if (!task.date) return false;
    const taskStart = new Date(task.date + 'T00:00:00');

    // Fix: Use local date string construction instead of UTC ISO to prevent timezone shifts
    const y = targetDateObj.getFullYear();
    const m = String(targetDateObj.getMonth() + 1).padStart(2, '0');
    const d = String(targetDateObj.getDate()).padStart(2, '0');
    const targetStr = `${y}-${m}-${d}`;

    const taskEnd = task.endDate ? new Date(task.endDate + 'T00:00:00') : null;

    if (task.recurrence === 'none' || !task.recurrence) {
        if (taskEnd) return targetDateObj >= taskStart && targetDateObj <= taskEnd;
        else return task.date === targetStr;
    } else {
        if (targetDateObj < taskStart) return false;
        if (taskEnd && targetDateObj > taskEnd) return false;
        if (task.recurrence === 'daily') return true;
        if (task.recurrence === 'weekly') return targetDateObj.getDay() === taskStart.getDay();
        if (task.recurrence === 'monthly') return targetDateObj.getDate() === taskStart.getDate();
        if (task.recurrence === 'custom') return (task.recurrenceDays || []).includes(targetDateObj.getDay());
    }
    return false;
    return false;
}

// Confetti Animation
export function triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const numberOfPieces = 150;
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722', '#795548'];

    for (let i = 0; i < numberOfPieces; i++) {
        pieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            rotation: Math.random() * 360,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 10 + 5,
            speed: Math.random() * 5 + 2,
            opacity: 1
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach((p, i) => {
            p.y += p.speed;
            p.rotation += p.speed;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.opacity;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();

            if (p.y > canvas.height) {
                p.y = -20;
                p.x = Math.random() * canvas.width;
            }
        });
    }

    // Run animation for 3 seconds then stop
    let startTime = Date.now();
    function animate() {
        if (Date.now() - startTime < 3000) {
            draw();
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    animate();
}

/**
 * Handles Daily Goal Logic: Updates UI and Triggers Confetti.
 * @param {number} completedCount - Number of completed tasks today.
 * @param {number} dailyGoal - The target daily goal.
 * @param {boolean} isAlreadyTriggered - Current state of confetti trigger.
 * @returns {boolean} - The new state of confettiTriggeredToday.
 */
export function handleDailyGoalLogic(completedCount, dailyGoal, isAlreadyTriggered) {
    // 1. Update Text UI
    const progressText = document.getElementById('goal-progress-text');
    if (progressText) progressText.textContent = `${completedCount}/${dailyGoal} completadas`;

    const mobileProgress = document.getElementById('mobile-goal-progress');
    if (mobileProgress) mobileProgress.textContent = `${completedCount}/${dailyGoal}`;

    // 2. Confetti Logic
    if (completedCount >= dailyGoal && !isAlreadyTriggered && completedCount > 0) {
        triggerConfetti();
        return true; // Triggered
    } else if (completedCount < dailyGoal) {
        return false; // Reset
    }

    return isAlreadyTriggered; // No change
}