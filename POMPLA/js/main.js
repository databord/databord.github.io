import { state, ICONS } from './state.js';
import { getTodayDate, isTaskOnDate, calculateNextOccurrence } from './utils.js';
import { receiveTasks, applyFilters, renderCategoryTags, updateFolderFilterOptions, updateMainTagFilterOptions, updateDailyGoalUI, refreshMainView } from './data.js';
import { renderCalendar, openDayDetails } from './views/calendar.js';
import { renderListView } from './views/list.js';
import {
    renderTimeline, toggleNotesSection, openNoteModal, saveNoteFromModal, editNote, deleteNote, toggleNoteCollapse,
    deleteSession, openSessionEditModal, saveSessionEdit,
    openCommentModal, openCommentEditModal, selectCommentType, saveComment
} from './views/timeline.js';
import {
    closeNoteModal, closeSessionEditModal, closeCommentModal, closeDayDetails, closeModal, setupTaskModalInteractions
} from './modal-handler.js';
import {
    openModal, toggleSubtasks, updateParentSelect,
    handleTouchStart, handleTouchMove, handleTouchEnd
} from './views/ui-helpers.js';
import {
    updateTimerDisplay, toggleTimer, resetTimer, adjustTimer, startPomodoroForTask, changeCycle, togglePiP
} from './pomodoro.js';
import { setupAuthListeners, setupSidebar, loadTheme, setupCustomSelect, setupSettings } from './settings.js';
import { setupTagFilters } from './tag-filters.js';

// --- GESTIÓN DE VISTAS ---

window.switchView = function (view) {
    state.currentView = view;
    document.getElementById('view-calendar').classList.toggle('active', view === 'calendar');
    document.getElementById('view-list').classList.toggle('active', view === 'list');
    document.getElementById('view-timeline').classList.toggle('active', view === 'timeline');

    const calendarGridEl = document.getElementById('calendar-grid');
    const listViewEl = document.getElementById('list-view');
    const timelineViewEl = document.getElementById('timeline-view');

    if (view === 'calendar') {
        calendarGridEl.style.display = 'grid';
        listViewEl.style.display = 'none';
        timelineViewEl.style.display = 'none';
        state.mainViewRange = 'month';
        renderCalendar();
    } else if (view === 'list') {
        calendarGridEl.style.display = 'none';
        listViewEl.style.display = 'flex';
        timelineViewEl.style.display = 'none';
        // Forzar vista semanal por defecto al cambiar a lista
        state.mainViewRange = 'week';
        refreshMainView();
    } else if (view === 'timeline') {
        calendarGridEl.style.display = 'none';
        listViewEl.style.display = 'none';
        timelineViewEl.style.display = 'block';
        state.mainViewRange = 'today';
        refreshMainView();
    }

    // Visibilidad de filtros
    const folderContainer = document.getElementById('filter-folder-container');
    const tagContainer = document.getElementById('filter-tag-container');
    if (folderContainer && tagContainer) {
        if (view === 'timeline') {
            folderContainer.style.display = 'none';
            tagContainer.style.display = 'block';
        } else {
            folderContainer.style.display = 'block';
            tagContainer.style.display = 'block';
        }
    }

    // Actualizar filtros de tags para la nueva vista
    updateMainTagFilterOptions();
};

window.switchMobileTab = function (tab) {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.body.classList.remove('tab-list', 'tab-calendar', 'tab-timer', 'tab-timeline');
    document.body.classList.add(`tab-${tab}`);

    if (tab === 'list') { window.switchView('list'); checkMiniTimerVisibility(); }
    else if (tab === 'calendar') { window.switchView('calendar'); checkMiniTimerVisibility(); }
    else if (tab === 'timeline') { window.switchView('timeline'); checkMiniTimerVisibility(); }
    else if (tab === 'timer') { checkMiniTimerVisibility(); }
};



function changeMonth(delta) {
    if (state.currentView === 'timeline') {
        state.currentDate.setDate(state.currentDate.getDate() + delta);
    } else if (state.currentView === 'list') {
        state.currentDate.setDate(state.currentDate.getDate() + (delta * 7));
        state.mainViewRange = 'week';
    } else {
        state.currentDate.setMonth(state.currentDate.getMonth() + delta);
        if (state.currentView !== 'calendar') state.mainViewRange = 'month';
    }
    refreshMainView();
}

// --- LÓGICA DE TAREAS (ACCIONES) ---

window.toggleTaskStatus = function (id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    // Timeline logic
    let updatedSessions = task.sessions ? [...task.sessions] : [];
    if (task.status !== 'completed') {
        const activeIdx = updatedSessions.findIndex(s => !s.end);
        if (activeIdx !== -1) {
            updatedSessions[activeIdx].end = new Date().toISOString();
        } else if (updatedSessions.length === 0) {
            const now = new Date().toISOString();
            updatedSessions.push({ start: now, end: now });
        }
    }

    if (task.status !== 'completed' && task.recurrence && task.recurrence !== 'none') {
        // Recurrence logic
        const historyTask = { ...task, id: null, status: 'completed', recurrence: 'none', completedAt: new Date().toISOString(), sessions: updatedSessions };
        delete historyTask.id;

        const nextDateStr = calculateNextOccurrence(task.date, task.recurrence, task.recurrenceDays);
        if (nextDateStr) {
            if (window.addTaskToFirebase) window.addTaskToFirebase(historyTask);
            if (window.updateTaskInFirebase) window.updateTaskInFirebase(id, { date: nextDateStr, status: 'pending', sessions: [] });
        } else {
            if (window.updateTaskInFirebase) window.updateTaskInFirebase(id, { status: 'completed', sessions: updatedSessions });
        }
    } else {
        // Standard logic
        if (window.updateTaskInFirebase) window.updateTaskInFirebase(id, {
            status: task.status === 'completed' ? 'pending' : 'completed',
            completedAt: task.status !== 'completed' ? new Date().toISOString() : null,
            sessions: updatedSessions
        });
    }
};

window.deleteTask = function (id) {
    if (confirm('¿Estás seguro de eliminar esta tarea?')) {
        if (window.deleteTaskFromFirebase) window.deleteTaskFromFirebase(id);
        const subtasks = state.tasks.filter(t => t.parentId === id);
        subtasks.forEach(sub => { if (window.deleteTaskFromFirebase) window.deleteTaskFromFirebase(sub.id); });
        setTimeout(updateDailyGoalUI, 500);
    }
};

window.addSubtask = function (parentId) {
    openModal();
    const parentSelect = document.getElementById('task-parent');
    if (parentSelect) parentSelect.value = parentId;
};

function handleTaskSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('task-title').value;
    const desc = document.getElementById('task-desc').value;
    const isFolder = document.getElementById('task-is-folder').checked;

    const date = isFolder ? null : document.getElementById('task-date').value;
    const endDate = isFolder ? null : document.getElementById('task-end-date').value;
    const priority = isFolder ? 'none' : document.getElementById('task-priority').value;
    const recurrence = isFolder ? 'none' : document.getElementById('task-recurrence').value;
    const color = document.getElementById('task-color').value;

    let recurrenceDays = [];
    if (recurrence === 'custom') {
        const checks = document.querySelectorAll('.days-checkbox-group input:checked');
        recurrenceDays = Array.from(checks).map(c => parseInt(c.value));
    }

    const parentId = document.getElementById('task-parent').value;
    const category = document.getElementById('task-category').value.replace(/\|\|\|/g, '');

    const iconSelect = document.getElementById('task-icon-select');
    let icon = iconSelect.value;
    if (icon === 'custom') icon = document.getElementById('task-icon-custom').value;

    const pomodoroSettings = {
        cycles: parseInt(document.getElementById('pomo-cycles').value) || 1,
        work: parseInt(document.getElementById('pomo-work').value) || 25,
        break: parseInt(document.getElementById('pomo-break').value) || 5
    };

    const editId = document.getElementById('task-form').dataset.editId;
    const reminderActive = document.getElementById('task-reminder-active').checked;
    const reminderTime = document.getElementById('task-reminder-time').value;

    const taskData = {
        title, desc, date, endDate, priority, recurrence, recurrenceDays,
        parentId: parentId || null,
        category, icon, pomodoroSettings,
        color: isFolder ? color : null,
        isFolder: isFolder,
        reminderActive: isFolder ? false : reminderActive,
        reminderTime: isFolder ? null : reminderTime
    };

    if (editId) { if (window.updateTaskInFirebase) window.updateTaskInFirebase(editId, taskData); }
    else { if (window.addTaskToFirebase) window.addTaskToFirebase(taskData); }

    setTimeout(updateDailyGoalUI, 500);
    closeModal();
}

// --- DENSIDAD DE LISTA ---

function toggleListDensity() {
    const modes = ['normal', 'compact', 'large'];
    let idx = modes.indexOf(state.listDensity || 'normal');
    idx = (idx + 1) % modes.length;
    state.listDensity = modes[idx];
    localStorage.setItem('planner_list_density', state.listDensity);

    const taskListEl = document.getElementById('task-list');
    const listViewEl = document.getElementById('list-view');

    [taskListEl, listViewEl].forEach(el => {
        if (el) {
            el.classList.remove('normal', 'compact', 'large');
            el.classList.add(state.listDensity);
        }
    });

    updateDensityButton();
}

function updateDensityButton() {
    const updateBtn = (btnId) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        let iconClass = 'fa-bars';
        if (state.listDensity === 'normal') iconClass = 'fa-bars';
        else if (state.listDensity === 'compact') iconClass = 'fa-compress';
        else if (state.listDensity === 'large') iconClass = 'fa-align-left';
        btn.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    };
    updateBtn('btn-view-density');
    updateBtn('mobile-btn-view-density');
}

// --- CONFIGURACIÓN DE EVENT LISTENERS ---

function setupEventListeners() {
    // Formularios y Modales
    document.getElementById('add-task-btn').addEventListener('click', () => openModal());
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-task').addEventListener('click', closeModal);
    document.getElementById('task-form').addEventListener('submit', handleTaskSubmit);

    // Init Modal Interactions (Recurrence, Reminders)
    setupTaskModalInteractions();

    // Modal Day Details
    const closeDayBtn = document.getElementById('close-day-details');
    if (closeDayBtn) closeDayBtn.addEventListener('click', closeDayDetails);

    const dayModal = document.getElementById('day-details-modal');
    if (dayModal) {
        dayModal.addEventListener('click', (e) => {
            if (e.target === dayModal) closeDayDetails();
        });
    }

    // Inputs Dinámicos
    document.getElementById('task-date').addEventListener('change', updateParentSelect);
    document.getElementById('task-end-date').addEventListener('change', updateParentSelect);

    // Filtro Categorías Input
    const categoryInput = document.getElementById('task-category');
    if (categoryInput) {
        categoryInput.addEventListener('input', (e) => {
            if (e.target.value.includes('|||')) e.target.value = e.target.value.replace(/\|\|\|/g, '');
            updateTagSuggestions(e.target.value);
        });
        categoryInput.addEventListener('focus', (e) => updateTagSuggestions(e.target.value));
    }

    // Navegación
    document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
    document.getElementById('view-calendar').addEventListener('click', () => window.switchView('calendar'));
    document.getElementById('view-list').addEventListener('click', () => window.switchView('list'));
    document.getElementById('view-timeline').addEventListener('click', () => window.switchView('timeline'));

    // Pomodoro
    document.getElementById('pomodoro-start').addEventListener('click', toggleTimer);
    document.getElementById('pomodoro-reset').addEventListener('click', resetTimer);
    document.getElementById('mini-play-btn').addEventListener('click', toggleTimer);
    document.getElementById('close-pomodoro').addEventListener('click', () => {
        document.getElementById('pomodoro-panel').style.display = 'none';
        checkMiniTimerVisibility();
    });

    // PiP Button
    const pipBtn = document.getElementById('pip-pomodoro');
    if (pipBtn) pipBtn.addEventListener('click', togglePiP);

    document.querySelectorAll('.btn-adjust').forEach(btn => {
        btn.addEventListener('click', (e) => adjustTimer(parseInt(e.target.dataset.time)));
    });

    document.getElementById('prev-cycle').addEventListener('click', () => changeCycle(-1));
    document.getElementById('next-cycle').addEventListener('click', () => changeCycle(1));

    // Mobile/Mini Pomodoro
    const deskMiniExpand = document.getElementById('desk-mini-expand-btn');
    if (deskMiniExpand) deskMiniExpand.addEventListener('click', () => { document.getElementById('pomodoro-panel').style.display = 'flex'; checkMiniTimerVisibility(); });
    const miniTimerToggle = document.getElementById('mini-timer-toggle');
    if (miniTimerToggle) miniTimerToggle.addEventListener('click', toggleTimer);

    // Sidebar Filtros
    setupSidebarFilters();

    // Folder Checkbox
    const folderCheckbox = document.getElementById('task-is-folder');
    if (folderCheckbox) {
        folderCheckbox.addEventListener('change', (e) => {
            const isFolder = e.target.checked;
            const dateRow = document.getElementById('task-date').closest('.form-row');
            const parentGroup = document.getElementById('task-parent').closest('.form-group');
            const priorityGroup = document.getElementById('task-priority').closest('.form-group');
            const recurrenceGroup = document.getElementById('task-recurrence').closest('.form-group');
            const colorInput = document.getElementById('task-color');

            if (isFolder) {
                if (dateRow) dateRow.style.display = 'none';
                if (parentGroup) parentGroup.style.display = 'none';
                if (priorityGroup) priorityGroup.style.display = 'none';
                if (recurrenceGroup) recurrenceGroup.style.display = 'none';
                colorInput.style.display = 'block';
                document.getElementById('recurrence-days-container').classList.add('hidden');
            } else {
                if (dateRow) dateRow.style.display = 'flex';
                if (parentGroup) parentGroup.style.display = 'block';
                if (priorityGroup) priorityGroup.style.display = 'block';
                if (recurrenceGroup) recurrenceGroup.style.display = 'block';
                colorInput.style.display = 'none';
            }
        });
    }

    // Densidad
    const densityBtn = document.getElementById('btn-view-density');
    if (densityBtn) densityBtn.addEventListener('click', toggleListDensity);
    const mobileDensityBtn = document.getElementById('mobile-btn-view-density');
    if (mobileDensityBtn) mobileDensityBtn.addEventListener('click', toggleListDensity);

    // Inicializar Select Custom
    setupCustomSelect();
}

function setupSidebarFilters() {
    // Reset
    const resetBtn = document.getElementById('filter-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        state.activeFilters = { dateRange: 'today', tags: new Set(), status: 'all', folderId: null, mainTags: new Set(), customStart: null, customEnd: null };
        updateFolderFilterOptions();
        updateMainTagFilterOptions();
        applyFilters();
    });

    // Completed Toggle
    const handleStatusToggle = () => {
        if (state.activeFilters.status === 'all') state.activeFilters.status = 'pending';
        else if (state.activeFilters.status === 'pending') state.activeFilters.status = 'completed';
        else state.activeFilters.status = 'all';
        applyFilters();
    };

    const completedBtn = document.getElementById('filter-completed');
    if (completedBtn) completedBtn.addEventListener('click', handleStatusToggle);
    const mobCompletedBtn = document.getElementById('mobile-filter-completed');
    if (mobCompletedBtn) mobCompletedBtn.addEventListener('click', handleStatusToggle);

    // Date Range Logic
    const dateRangeSelect = document.getElementById('filter-date-range');
    const customPicker = document.getElementById('custom-date-picker');
    if (dateRangeSelect) {
        dateRangeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                if (customPicker) {
                    customPicker.style.display = 'flex';
                    if (state.activeFilters.customStart) document.getElementById('custom-date-start').value = state.activeFilters.customStart;
                    if (state.activeFilters.customEnd) document.getElementById('custom-date-end').value = state.activeFilters.customEnd;
                }
            } else {
                if (customPicker) customPicker.style.display = 'none';
                state.activeFilters.dateRange = e.target.value;
                applyFilters();
            }
        });
    }

    // Botones Custom Date
    const btnApplyCustom = document.getElementById('btn-apply-custom-date');
    if (btnApplyCustom) {
        btnApplyCustom.addEventListener('click', () => {
            const s = document.getElementById('custom-date-start').value;
            const e = document.getElementById('custom-date-end').value;
            if (s && e) {
                state.activeFilters.dateRange = 'custom';
                state.activeFilters.customStart = s;
                state.activeFilters.customEnd = e;
                if (customPicker) customPicker.style.display = 'none';
                applyFilters();
            }
        });
    }
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

// --- RECORDATORIOS ---
function checkReminders() {
    const canNotify = "Notification" in window && Notification.permission === "granted";
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    state.tasks.forEach(task => {
        if (!task.reminderActive || !task.reminderTime || task.status === 'completed') return;
        if (isTaskOnDate(task, now)) {
            if (task.reminderTime === currentTime) {
                const uniqueKey = `${task.id}_${now.toDateString()}_${currentTime}`;
                if (!state.notifiedTasks.has(uniqueKey)) {
                    const reminderModal = document.getElementById('reminder-modal');
                    const reminderText = document.getElementById('reminder-text');
                    const btnStartPomo = document.getElementById('btn-reminder-start-pomo');

                    if (reminderModal && reminderText) {
                        reminderText.textContent = `Recordatorio: ${task.title}`;
                        reminderModal.dataset.taskId = task.id;
                        if (btnStartPomo) {
                            btnStartPomo.onclick = () => {
                                startPomodoroForTask(task.id);
                                reminderModal.classList.remove('active');
                            };
                        }
                        reminderModal.classList.add('active');
                    }
                    if (canNotify) new Notification("Recordatorio: " + task.title, { body: "Es hora de tu tarea." });
                    state.notifiedTasks.add(uniqueKey);
                }
            }
        }
    });
}
setInterval(checkReminders, 30000);

// --- SUGERENCIAS DE TAGS ---
window.updateTagSuggestions = function (inputValue) {
    const container = document.getElementById('category-suggestions');
    if (!container) return;
    container.innerHTML = '';

    const tagCounts = {};
    state.tasks.forEach(task => {
        if (!task.category || task.category.includes('|||')) return;
        task.category.split(',').forEach(t => {
            const tag = t.trim();
            if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });

    const tags = inputValue.split(',');
    const currentSegment = tags[tags.length - 1].trim();

    let candidates = Object.keys(tagCounts);
    if (currentSegment) {
        const lowerSeg = currentSegment.toLowerCase();
        candidates = candidates.filter(tag => tag.toLowerCase().includes(lowerSeg));
    }
    candidates = candidates.sort((a, b) => tagCounts[b] - tagCounts[a]).slice(0, 5);

    candidates.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'tag-chip';
        btn.style.fontSize = '0.75rem';
        btn.textContent = tag;
        btn.type = 'button';
        btn.onclick = () => {
            tags[tags.length - 1] = ' ' + tag;
            const input = document.getElementById('task-category');
            input.value = tags.join(',') + ', ';
            input.focus();
        };
        container.appendChild(btn);
    });
};

// --- EXPOSICIÓN GLOBAL (CRÍTICO) ---
window.recibirTareasDeFirebase = receiveTasks;
window.toggleSubtasks = toggleSubtasks;
window.startPomodoroForTask = startPomodoroForTask;
window.openModal = openModal;
window.openDayDetails = openDayDetails;
window.closeDayDetails = closeDayDetails;
window.toggleNotesSection = toggleNotesSection;
window.openNoteModal = openNoteModal;
window.saveNoteFromModal = saveNoteFromModal;
window.editNote = editNote;
window.deleteNote = deleteNote;
window.toggleNoteCollapse = toggleNoteCollapse;
window.deleteSession = deleteSession;
window.openSessionEditModal = openSessionEditModal;
window.closeSessionEditModal = closeSessionEditModal;
window.saveSessionEdit = saveSessionEdit;
window.openCommentModal = openCommentModal;
window.openCommentEditModal = openCommentEditModal;
window.closeCommentModal = closeCommentModal;
window.selectCommentType = selectCommentType;
window.saveComment = saveComment;
window.togglePiP = togglePiP;

// Wrappers legacy
window.toggleDailyGoalWidget = () => {
    const c = document.getElementById('daily-goal-content');
    if (c) c.style.display = c.style.display === 'none' ? 'block' : 'none';
};
window.toggleMobileDailyGoalWidget = () => {
    const c = document.getElementById('mobile-daily-goal-content');
    if (c) c.style.display = c.style.display === 'none' ? 'block' : 'none';
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    renderCalendar();
    setupEventListeners();
    updateTimerDisplay();
    setupAuthListeners();
    setupSidebar();
    setupSettings();
    setupTagFilters();

    // Check permisos
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    // Mobile init
    if (window.innerWidth <= 768) window.switchMobileTab('list');
    else document.body.classList.add('tab-list');

    // Filtros iniciales
    applyFilters();
    updateDensityButton();
});