import { state } from './state.js';
import { getSuggestedTags } from './utils.js';

export function closeNoteModal() {
    const modal = document.getElementById('note-modal');
    if (modal) modal.classList.remove('active');
}

export function closeSessionEditModal() {
    const modal = document.getElementById('session-edit-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = ''; // Reset inline styles if any
        modal.style.opacity = '';
        modal.style.pointerEvents = '';
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


export function snoozeReminder(minutes) {
    const modal = document.getElementById('reminder-modal');
    if (!modal) return;

    const taskId = modal.dataset.taskId;
    if (!taskId) {
        modal.classList.remove('active');
        return;
    }

    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);

    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const newTime = `${hours}:${mins}`;

    if (window.updateTaskInFirebase) {
        window.updateTaskInFirebase(taskId, { reminderTime: newTime });
    }

    modal.classList.remove('active');
}

// Setup Category Suggestions
export function setupCategorySuggestions() {
    const categoryInput = document.getElementById('task-category');
    if (!categoryInput) return;

    const handler = (e) => {
        if (e.target.value.includes('|||')) e.target.value = e.target.value.replace(/\|\|\|/g, '');
        updateTagSuggestions(e.target.value);
    };

    categoryInput.addEventListener('input', handler);
    categoryInput.addEventListener('focus', handler);
}

function updateTagSuggestions(inputValue) {
    const container = document.getElementById('category-suggestions');
    if (!container) return;
    container.innerHTML = '';

    const candidates = getSuggestedTags(state.tasks, inputValue);

    candidates.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'tag-chip';
        btn.style.fontSize = '0.75rem';
        btn.textContent = tag;
        btn.type = 'button';
        btn.onclick = () => {
            const tags = inputValue.split(',').map(t => t.trim());

            // FIX: Do NOT pop the last empty element if it exists.
            // If the last element is empty (e.g. "Work, "), we want to fill that empty slot with the new tag.
            // If we pop it, we remove the slot and overwrite the PREVIOUS tag ("Work").
            // So we simply assign to the last index.

            // Replace the last segment (which is the one being typed or the empty one) with the selected tag
            tags[tags.length - 1] = tag;

            // Replace the last segment (which is the one being typed) with the selected tag
            tags[tags.length - 1] = tag;

            const input = document.getElementById('task-category');
            // Reconstruct string: join with ", " and add a trailing ", " for next entry
            input.value = tags.join(', ') + ', ';
            input.focus();

            // Update suggestions for the new state (should be empty or based on empty string)
            updateTagSuggestions(input.value);
        };
        container.appendChild(btn);
    });
}

