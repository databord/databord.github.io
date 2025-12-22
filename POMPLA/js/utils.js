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
}