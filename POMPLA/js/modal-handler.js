export function closeNoteModal() {
    const modal = document.getElementById('note-modal');
    if (modal) modal.classList.remove('active');
}

export function closeSessionEditModal() {
    const modal = document.getElementById('session-edit-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = ''; // Reset inline styles if any
    }
}

export function closeCommentModal() {
    const modal = document.getElementById('comment-modal');
    if (modal) modal.classList.remove('active');
}

export function closeDayDetails() {
    const modal = document.getElementById('day-details-modal');
    if (modal) {
        modal.classList.remove('active');
        // Reset all inline styles to let CSS handle it (matching script.js)
        modal.style.display = '';
        modal.style.opacity = '';
        modal.style.pointerEvents = '';
    }
}

// Generic Task Modal
export function closeModal() {
    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.remove('active');
}


// Setup dynamic interactions for the Task Modal
export function setupTaskModalInteractions() {
    // 1. Recurrence: Show/Hide Custom Days
    const recurrenceSelect = document.getElementById('task-recurrence');
    const recurrenceDaysContainer = document.getElementById('recurrence-days-container');

    if (recurrenceSelect && recurrenceDaysContainer) {
        recurrenceSelect.addEventListener('change', () => {
            if (recurrenceSelect.value === 'custom') {
                recurrenceDaysContainer.classList.remove('hidden');
            } else {
                recurrenceDaysContainer.classList.add('hidden');
            }
        });
    }

    // 2. Reminder: Show/Hide Time Input
    const reminderActive = document.getElementById('task-reminder-active');
    const reminderTime = document.getElementById('task-reminder-time');

    if (reminderActive && reminderTime) {
        reminderActive.addEventListener('change', () => { // Use 'change' for checkbox
            if (reminderActive.checked) {
                reminderTime.style.display = 'block';
                reminderTime.disabled = false;
            } else {
                reminderTime.style.display = 'none';
            }
        });
    }
}
