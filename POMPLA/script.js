// State
let tasks = [];
let currentDate = new Date();
let timerInterval = null;
let timeLeft = 25 * 60;
let isTimerRunning = false;
let activeTaskId = null;
let currentView = 'calendar'; // 'calendar' or 'list'
let pomodoroState = { cycle: 1, isBreak: false, totalCycles: 1, workTime: 25, breakTime: 5 };

// DOM Elements & Icons
const taskListEl = document.getElementById('task-list');
const calendarGridEl = document.getElementById('calendar-grid');
const listViewEl = document.getElementById('list-view');
const currentMonthYearEl = document.getElementById('current-month-year');
const modal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const taskParentSelect = document.getElementById('task-parent');
const timerSound = document.getElementById('timer-sound');

const ICONS = {
    edit: '<i class="fa-solid fa-pen"></i>',
    delete: '<i class="fa-solid fa-trash"></i>',
    play: '<i class="fa-solid fa-play"></i>',
    check: '<i class="fa-solid fa-check"></i>',
    add: '<i class="fa-solid fa-plus"></i>',
    chevronDown: '<i class="fa-solid fa-chevron-down"></i>'
};

const expandedTasks = new Set(); // Track expanded state of parent tasks

// --- MOBILE TABS LOGIC ---
window.switchMobileTab = function (tab) {
    // Update Nav UI
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update Body Classes for CSS
    document.body.classList.remove('tab-list', 'tab-calendar', 'tab-timer');
    document.body.classList.add(`tab-${tab}`);

    // Action per tab
    if (tab === 'list') {
        switchView('list');
        checkMiniTimerVisibility();
    } else if (tab === 'calendar') {
        switchView('calendar');
        checkMiniTimerVisibility();
    } else if (tab === 'timer') {
        checkMiniTimerVisibility();
    }
};

function checkMiniTimerVisibility() {
    // Show mini timer only if Timer Interval is active AND NOT on Timer Tab
    // ON MOBILE: User requested "Always Visible". CSS override handles this via media query.
    // This function manages the class 'hidden' and 'has-mini-timer' for desktop behavior or non-mobile.

    const isTimerTab = document.body.classList.contains('tab-timer');
    const miniTimerEl = document.getElementById('mobile-mini-timer');

    // Desktop/Default logic:
    if (timerInterval && !isTimerTab) {
        miniTimerEl.classList.remove('hidden');
        document.body.classList.add('has-mini-timer');
    } else {
        miniTimerEl.classList.add('hidden');
        document.body.classList.remove('has-mini-timer');
    }
}

// --- MOBILE TABS LOGIC ---
window.switchMobileTab = function (tab) {
    // Update Nav UI
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update Body Classes for CSS
    document.body.classList.remove('tab-list', 'tab-calendar', 'tab-timer');
    document.body.classList.add(`tab-${tab}`);

    // Action per tab
    if (tab === 'list') {
        switchView('list');
        checkMiniTimerVisibility();
    } else if (tab === 'calendar') {
        switchView('calendar');
        checkMiniTimerVisibility();
    } else if (tab === 'timer') {
        checkMiniTimerVisibility();
    }
};

// --- VISIBILITY & UI LOGIC ---

function checkMiniTimerVisibility() {
    const miniTimerEl = document.getElementById('mobile-mini-timer');
    const panel = document.getElementById('pomodoro-panel');
    const isPanelVisible = panel && panel.style.display !== 'none';
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        // Mobile: Always visible if user wants (handled by CSS .hidden override usually, 
        // but here we can support the logic too).
        // Actually, CSS says .hidden { display: flex !important } on mobile.
        // So this JS class toggle adds/removes 'hidden'.
        // If we remove 'hidden', it shows on Desktop.
        // If we add 'hidden', it HIDES on Desktop.

        // On Mobile, we rely on CSS to force it visible if needed? 
        // User asked: "Mobile minitimer appears on web version... Only should appear if float is closed".

        // So for Desktop:
        if (timerInterval && !isPanelVisible) {
            miniTimerEl.classList.remove('hidden');
        } else {
            miniTimerEl.classList.add('hidden');
        }
    } else {
        // Desktop Logic
        // NEVER show mobile mini timer on desktop
        miniTimerEl.classList.add('hidden');
    }
}

function togglePomodoroPanel(show) {
    const panel = document.getElementById('pomodoro-panel');
    if (show) {
        panel.style.display = 'flex';
        // Hide mini timer immediately (as panel is open)
        checkMiniTimerVisibility();
    } else {
        panel.style.display = 'none';
        // Show mini timer if running
        checkMiniTimerVisibility();
    }
}

window.addSubtask = (parentId) => {
    openModal();
    const parentSelect = document.getElementById('task-parent');
    if (parentSelect) {
        parentSelect.value = parentId;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    renderCalendar();
    setupEventListeners();
    updateTimerDisplay();
    setupCustomSelect();
    setupAuthListeners(); // Configurar botones de login/registro

    if (window.innerWidth <= 768) {
        window.switchMobileTab('list'); // Default mobile tab
    } else {
        document.body.classList.add('tab-list');
    }
});

// --- PUENTE CON FIREBASE ---
// Esta función es llamada desde firebase-logic.js cuando hay datos nuevos
window.recibirTareasDeFirebase = (tareasDescargadas) => {
    // Ordenar por campo 'order' si existe, si no por fecha
    tasks = tareasDescargadas.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : Infinity;
        const orderB = b.order !== undefined ? b.order : Infinity;
        return orderA - orderB;
    });

    // Renderizamos todo de nuevo con los datos frescos
    // Renderizamos todo de nuevo con los datos frescos
    renderTasks();
    if (currentView === 'calendar') renderCalendar();
    else renderListView();
    updateParentSelect();
    renderCategoryTags();
};

function renderCategoryTags() {
    const container = document.getElementById('category-tags-container');
    if (!container) return;
    container.innerHTML = '';

    // Extraer categorías únicas (excluyendo vacías) y separando por comas
    const categories = new Set();
    tasks.forEach(task => {
        if (task.category && task.category.trim() !== '') {
            const tags = task.category.split(',').map(tag => tag.trim());
            tags.forEach(tag => {
                if (tag !== '') categories.add(tag);
            });
        }
    });

    if (categories.size === 0) {
        container.innerHTML = '<span style="font-size:0.8rem;color:var(--text-secondary);">No hay etiquetas</span>';
        return;
    }

    categories.forEach(cat => {
        const chip = document.createElement('button');
        chip.className = 'tag-chip';
        chip.textContent = cat;
        chip.addEventListener('click', () => {
            // Toggle active state visual
            document.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderTasks(`category:${cat}`);
        });
        container.appendChild(chip);
    });
}

// --- NUEVA LÓGICA DE LOGIN/LOGOUT ---
function setupAuthListeners() {
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const errorMsg = document.getElementById('login-error');
    const btnRegister = document.getElementById('btn-register');
    const btnLogout = document.getElementById('logout-btn');

    // Manejar Login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorMsg.style.display = 'none';

            if (window.authLogin) {
                const result = await window.authLogin(emailInput.value, passInput.value);
                if (!result.success) {
                    errorMsg.textContent = result.message;
                    errorMsg.style.display = 'block';
                } else {
                    // Limpiar campos
                    emailInput.value = '';
                    passInput.value = '';
                }
            }
        });
    }

    // Manejar Registro
    if (btnRegister) {
        btnRegister.addEventListener('click', async () => {
            errorMsg.style.display = 'none';
            if (passInput.value.length < 6) {
                errorMsg.textContent = "La contraseña debe tener al menos 6 caracteres para registrarse.";
                errorMsg.style.display = 'block';
                return;
            }

            if (window.authRegister) {
                const result = await window.authRegister(emailInput.value, passInput.value);
                if (!result.success) {
                    errorMsg.textContent = result.message;
                    errorMsg.style.display = 'block';
                } else {
                    alert("Cuenta creada con éxito. Iniciando sesión...");
                    emailInput.value = '';
                    passInput.value = '';
                }
            }
        });
    }

    // Manejar Logout
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm("¿Cerrar sesión?")) {
                if (window.authLogout) window.authLogout();
            }
        });
    }
}

function setupCustomSelect() {
    const select = document.getElementById('task-icon-select');
    if (!select) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    select.style.display = 'none';
    const customSelect = document.createElement('div');
    customSelect.className = 'custom-select';
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    trigger.innerHTML = `<span>${select.options[select.selectedIndex].text}</span> <div class="custom-select-arrow"></div>`;
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'custom-options';

    Array.from(select.options).forEach(option => {
        const customOption = document.createElement('div');
        customOption.className = 'custom-option';
        customOption.dataset.value = option.value;
        if (option.value && option.value !== 'custom') {
            customOption.innerHTML = `<i class="${option.value}"></i> <span>${option.text}</span>`;
        } else {
            customOption.innerHTML = `<span>${option.text}</span>`;
        }
        if (option.selected) customOption.classList.add('selected');
        customOption.addEventListener('click', () => {
            customSelect.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
            customOption.classList.add('selected');
            trigger.querySelector('span').innerHTML = customOption.innerHTML;
            select.value = option.value;
            select.dispatchEvent(new Event('change'));
            customSelect.classList.remove('open');
        });
        optionsContainer.appendChild(customOption);
    });

    customSelect.appendChild(trigger);
    customSelect.appendChild(optionsContainer);
    wrapper.appendChild(customSelect);
    trigger.addEventListener('click', (e) => { e.stopPropagation(); customSelect.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!customSelect.contains(e.target)) customSelect.classList.remove('open'); });
    select.addEventListener('change', () => {
        const selectedOption = Array.from(select.options).find(opt => opt.value === select.value);
        if (selectedOption) {
            let content = `<span>${selectedOption.text}</span>`;
            if (selectedOption.value && selectedOption.value !== 'custom') {
                content = `<i class="${selectedOption.value}"></i> <span>${selectedOption.text}</span>`;
            }
            trigger.querySelector('span').innerHTML = content;
            customSelect.querySelectorAll('.custom-option').forEach(opt => {
                if (opt.dataset.value === select.value) opt.classList.add('selected');
                else opt.classList.remove('selected');
            });
        }
    });
}

function setupEventListeners() {
    document.getElementById('add-task-btn').addEventListener('click', () => openModal());
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-task').addEventListener('click', closeModal);
    taskForm.addEventListener('submit', handleTaskSubmit);

    document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

    document.getElementById('view-calendar').addEventListener('click', () => switchView('calendar'));
    document.getElementById('view-list').addEventListener('click', () => switchView('list'));

    document.getElementById('pomodoro-start').addEventListener('click', toggleTimer);
    document.getElementById('pomodoro-reset').addEventListener('click', resetTimer);
    document.getElementById('mini-play-btn').addEventListener('click', toggleTimer);
    document.getElementById('close-pomodoro').addEventListener('click', () => {
        document.getElementById('pomodoro-panel').style.display = 'none';
    });

    document.querySelectorAll('.btn-adjust').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const minutes = parseInt(e.target.dataset.time);
            adjustTimer(minutes);
        });
    });

    document.getElementById('prev-cycle').addEventListener('click', () => changeCycle(-1));
    document.getElementById('next-cycle').addEventListener('click', () => changeCycle(1));

    const iconSelect = document.getElementById('task-icon-select');
    const iconCustom = document.getElementById('task-icon-custom');
    if (iconSelect) {
        iconSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                iconCustom.style.display = 'block';
                iconCustom.focus();
            } else {
                iconCustom.style.display = 'none';
            }
        });
    }

    // Event Listeners for Mini Timer Cycle Controls
    const miniPrev = document.getElementById('mini-prev-cycle');
    if (miniPrev) miniPrev.addEventListener('click', () => changeCycle(-1));

    const miniNext = document.getElementById('mini-next-cycle');
    if (miniNext) miniNext.addEventListener('click', () => changeCycle(1));

    const deskMiniPrev = document.getElementById('desk-mini-prev-cycle');
    if (deskMiniPrev) deskMiniPrev.addEventListener('click', () => changeCycle(-1));

    const deskMiniNext = document.getElementById('desk-mini-next-cycle');
    if (deskMiniNext) deskMiniNext.addEventListener('click', () => changeCycle(1));

    const deskMiniExpand = document.getElementById('desk-mini-expand-btn');
    if (deskMiniExpand) {
        deskMiniExpand.addEventListener('click', () => {
            togglePomodoroPanel(true);
        });
    }


    // Confirm Close Pomodoro
    document.getElementById('close-pomodoro').addEventListener('click', () => {
        // Just hide the panel, do not stop timer (Desktop behavior preference)
        togglePomodoroPanel(false);
    });

    // Expand Button on Mini Timer
    const expandBtn = document.getElementById('mini-expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', () => {
            togglePomodoroPanel(true);
        });
    }

    // LISTENER MINI TIMER TOGGLE
    const miniTimerToggle = document.getElementById('mini-timer-toggle');
    if (miniTimerToggle) {
        miniTimerToggle.addEventListener('click', () => {
            if (timerInterval) pauseTimer();
            else startTimer();
        });
    }

    // LISTENER MINI TIMER ADJUST
    document.querySelectorAll('.btn-adjust-mini').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Ensure we get the button element (in case click hits the icon)
            const target = e.target.closest('.btn-adjust-mini');
            if (target && target.dataset.time) {
                const time = parseInt(target.dataset.time);
                if (!isNaN(time)) adjustTimer(time);
            }
        });
    });


    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderTasks(e.target.dataset.filter);
        });
    });

    taskListEl.addEventListener('dragover', handleDragOver);
    taskListEl.addEventListener('drop', handleDrop);

    const btnTags = document.getElementById('btn-tags-filter');
    if (btnTags) {
        btnTags.addEventListener('click', () => {
            const container = document.getElementById('category-tags-container');
            container.classList.toggle('hidden');
            btnTags.classList.toggle('active');
            renderCategoryTags();
        });
    }

    // Listener for Recurrence Select
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
}

function switchView(view) {
    currentView = view;
    document.getElementById('view-calendar').classList.toggle('active', view === 'calendar');
    document.getElementById('view-list').classList.toggle('active', view === 'list');
    if (view === 'calendar') {
        calendarGridEl.style.display = 'grid';
        listViewEl.style.display = 'none';
        renderCalendar();
    } else {
        calendarGridEl.style.display = 'none';
        listViewEl.style.display = 'flex';
        renderListView();
    }
}

function openModal(editId = null) {
    modal.classList.add('active');
    updateParentSelect();
    if (editId) {
        const task = tasks.find(t => t.id === editId);
        document.getElementById('modal-title').textContent = 'Editar Tarea';
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-desc').value = task.desc || '';
        document.getElementById('task-date').value = task.date || '';
        document.getElementById('task-end-date').value = task.endDate || '';
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-recurrence').value = task.recurrence || 'none';

        const recurrenceDaysContainer = document.getElementById('recurrence-days-container');
        if (task.recurrence === 'custom') {
            recurrenceDaysContainer.classList.remove('hidden');
            // Check boxes
            const checks = document.querySelectorAll('.days-checkbox-group input');
            checks.forEach(chk => {
                chk.checked = (task.recurrenceDays || []).includes(parseInt(chk.value));
            });
        } else {
            recurrenceDaysContainer.classList.add('hidden');
            document.querySelectorAll('.days-checkbox-group input').forEach(c => c.checked = false);
        }

        document.getElementById('task-parent').value = task.parentId || '';
        document.getElementById('task-category').value = task.category || '';

        const iconSelect = document.getElementById('task-icon-select');
        const iconCustom = document.getElementById('task-icon-custom');
        const taskIcon = task.icon || '';
        let iconFound = false;
        for (let i = 0; i < iconSelect.options.length; i++) {
            if (iconSelect.options[i].value === taskIcon) {
                iconSelect.value = taskIcon;
                iconFound = true;
                break;
            }
        }
        if (!iconFound && taskIcon) {
            iconSelect.value = 'custom';
            iconCustom.value = taskIcon;
            iconCustom.style.display = 'block';
        } else {
            if (!iconFound) iconSelect.value = '';
            iconCustom.value = '';
            iconCustom.style.display = 'none';
        }
        iconSelect.dispatchEvent(new Event('change'));

        const settings = task.pomodoroSettings || { cycles: 1, work: 25, break: 5 };
        document.getElementById('pomo-cycles').value = settings.cycles;
        document.getElementById('pomo-work').value = settings.work;
        document.getElementById('pomo-break').value = settings.break;

        taskForm.dataset.editId = editId;
    } else {
        document.getElementById('modal-title').textContent = 'Nueva Tarea';
        taskForm.reset();
        document.getElementById('task-date').valueAsDate = new Date();
        document.getElementById('task-recurrence').value = 'none';
        document.getElementById('recurrence-days-container').classList.add('hidden');
        document.querySelectorAll('.days-checkbox-group input').forEach(c => c.checked = false);
        document.getElementById('pomo-cycles').value = 1;
        document.getElementById('pomo-work').value = 25;
        document.getElementById('pomo-break').value = 5;
        const iconSelect = document.getElementById('task-icon-select');
        iconSelect.value = '';
        document.getElementById('task-icon-custom').style.display = 'none';
        iconSelect.dispatchEvent(new Event('change'));
        delete taskForm.dataset.editId;
    }
}

function closeModal() { modal.classList.remove('active'); }

function updateParentSelect() {
    taskParentSelect.innerHTML = '<option value="">Ninguna (Tarea Principal)</option>';
    tasks.forEach(task => {
        if (!task.parentId) {
            const option = document.createElement('option');
            option.value = task.id;
            option.textContent = task.title;
            taskParentSelect.appendChild(option);
        }
    });
}

function handleTaskSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('task-title').value;
    const desc = document.getElementById('task-desc').value;
    const date = document.getElementById('task-date').value;
    const endDate = document.getElementById('task-end-date').value;
    const priority = document.getElementById('task-priority').value;
    const recurrence = document.getElementById('task-recurrence').value;
    let recurrenceDays = [];
    if (recurrence === 'custom') {
        const checks = document.querySelectorAll('.days-checkbox-group input:checked');
        recurrenceDays = Array.from(checks).map(c => parseInt(c.value));
    }
    const parentId = document.getElementById('task-parent').value;
    const category = document.getElementById('task-category').value;
    const iconSelect = document.getElementById('task-icon-select');
    let icon = iconSelect.value;
    if (icon === 'custom') icon = document.getElementById('task-icon-custom').value;
    const pomodoroSettings = {
        cycles: parseInt(document.getElementById('pomo-cycles').value) || 1,
        work: parseInt(document.getElementById('pomo-work').value) || 25,
        break: parseInt(document.getElementById('pomo-break').value) || 5
    };
    const editId = taskForm.dataset.editId;
    const taskData = { title, desc, date, endDate, priority, recurrence, recurrenceDays, parentId, category, icon, pomodoroSettings };

    if (editId) { if (window.updateTaskInFirebase) window.updateTaskInFirebase(editId, taskData); }
    else { if (window.addTaskToFirebase) window.addTaskToFirebase(taskData); }
    closeModal();
}

function deleteTask(id) {
    if (confirm('¿Estás seguro de eliminar esta tarea?')) {
        if (window.deleteTaskFromFirebase) window.deleteTaskFromFirebase(id);
        const subtasks = tasks.filter(t => t.parentId === id);
        subtasks.forEach(sub => { if (window.deleteTaskFromFirebase) window.deleteTaskFromFirebase(sub.id); });
    }
}

function calculateNextOccurrence(currentDateStr, recurrence, recurrenceDays) {
    const date = new Date(currentDateStr + 'T00:00:00');
    let nextDate = new Date(date);

    if (recurrence === 'daily') {
        nextDate.setDate(date.getDate() + 1);
    } else if (recurrence === 'weekly') {
        nextDate.setDate(date.getDate() + 7);
    } else if (recurrence === 'monthly') {
        nextDate.setMonth(date.getMonth() + 1);
    } else if (recurrence === 'custom') {
        // days is array of 0-6 (Sun-Sat)
        // Find next day in array that is after today (specifically, after the current scheduled date)
        if (!recurrenceDays || recurrenceDays.length === 0) return null;

        // Sort days just in case
        const sortedDays = [...recurrenceDays].sort((a, b) => a - b);
        const currentDay = date.getDay();

        // Find first day > currentDay
        let nextDay = sortedDays.find(d => d > currentDay);

        if (nextDay !== undefined) {
            // Same week
            nextDate.setDate(date.getDate() + (nextDay - currentDay));
        } else {
            // Next week, first available day
            nextDay = sortedDays[0];
            const daysUntilNextWeek = 7 - currentDay + nextDay;
            nextDate.setDate(date.getDate() + daysUntilNextWeek);
        }
    }
    return nextDate.toISOString().split('T')[0];
}

function toggleTaskStatus(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Check if it's a recurring task being marked as Completed (pending -> completed)
    if (task.status !== 'completed' && task.recurrence && task.recurrence !== 'none') {
        // Smart Recurrence Logic
        // 1. Clone current task as "Completed History Item"
        // 2. Reschedule original task to next occurrence

        const historyTask = {
            ...task,
            id: null, // Create new ID
            status: 'completed',
            recurrence: 'none', // The history item doesn't repeat
            parentId: task.parentId, // Keep hierarchy? Usually OK.
            title: `${task.title} (Completado)`, // Optional visual cue or keep same
            completedAt: new Date().toISOString()
        };
        // Remove id from object to ensure Firebase creates new
        delete historyTask.id;

        // Calculate Next Date
        const nextDateStr = calculateNextOccurrence(task.date, task.recurrence, task.recurrenceDays);

        if (nextDateStr) {
            // Save History Item
            if (window.addTaskToFirebase) window.addTaskToFirebase(historyTask);

            // Update Original Task
            if (window.updateTaskInFirebase) {
                window.updateTaskInFirebase(id, {
                    date: nextDateStr,
                    status: 'pending' // Ensure it stays pending for the future
                });
            }
        } else {
            // Fallback if calcs fail (e.g. invalid custom days), just complete it
            if (window.updateTaskInFirebase) {
                window.updateTaskInFirebase(id, { status: 'completed' });
            }
        }

    } else {
        // Normal behavior (completed -> pending OR non-recurring pending -> completed)
        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(id, { status: task.status === 'completed' ? 'pending' : 'completed' });
        }
    }
}

function renderTasks(filter = 'all') {
    taskListEl.innerHTML = '';

    // Función auxiliar para chequear etiquetas
    const hasCategory = (task, catName) => {
        if (!task.category) return false;
        const tags = task.category.split(',').map(c => c.trim());
        return tags.includes(catName);
    };

    let itemsRendering = []; // Array de { type: 'wrapper' | 'orphan', task: obj, children: [] }

    if (filter.startsWith('category:')) {
        const catName = filter.split(':')[1];

        const allParents = tasks.filter(t => !t.parentId);

        allParents.forEach(parent => {
            const parentMatches = hasCategory(parent, catName);
            const allSubtasks = tasks.filter(t => t.parentId === parent.id);
            const matchingSubtasks = allSubtasks.filter(sub => hasCategory(sub, catName));

            if (parentMatches) {
                // Caso A: Padre coincide. Mostramos padre.
                // Mostramos todos los hijos para contexto si el padre es el seleccionado
                itemsRendering.push({
                    type: 'wrapper',
                    task: parent,
                    children: allSubtasks
                });
            } else {
                // Caso B: Padre NO coincide.
                if (matchingSubtasks.length > 0) {
                    // Hay hijos que coinciden. Mostrarlos como "Huérfanos" con indicador de padre.
                    matchingSubtasks.forEach(sub => {
                        itemsRendering.push({
                            type: 'orphan',
                            task: sub,
                            parent: parent
                        });
                    });
                }
            }
        });

    } else {
        // Filtros estandares
        let filteredParents = tasks.filter(t => !t.parentId);
        if (filter === 'today') {
            const todayStr = new Date().toISOString().split('T')[0];
            filteredParents = filteredParents.filter(t => t.date === todayStr);
        } else if (filter === 'high') {
            filteredParents = filteredParents.filter(t => t.priority === 'high');
        }

        filteredParents.forEach(parent => {
            const subtasks = tasks.filter(t => t.parentId === parent.id);
            itemsRendering.push({
                type: 'wrapper',
                task: parent,
                children: subtasks
            });
        });
    }

    if (itemsRendering.length === 0) {
        taskListEl.innerHTML = '<div class="empty-state" style="text-align:center; color:var(--text-secondary); padding:20px;">No hay tareas con este filtro</div>';
        return;
    }

    const allowDrag = filter === 'all';

    itemsRendering.forEach(item => {
        if (item.type === 'wrapper') {
            const parent = item.task;
            const subtasks = item.children;
            const hasSubtasks = subtasks.length > 0;

            const wrapper = document.createElement('div');
            wrapper.className = 'task-wrapper';
            wrapper.dataset.id = parent.id;

            if (allowDrag) {
                wrapper.draggable = true;
                wrapper.addEventListener('dragstart', (e) => {
                    if (e.target.closest('.task-item') && e.target.closest('.subtask-container')) {
                        e.preventDefault(); return;
                    }
                    wrapper.classList.add('dragging');
                    wrapper.dataset.dragType = 'parent';
                    e.dataTransfer.setData('text/plain', parent.id);
                    e.stopPropagation();
                });
                wrapper.addEventListener('dragend', () => {
                    wrapper.classList.remove('dragging');
                    delete wrapper.dataset.dragType;
                    saveTaskOrder();
                });
            }

            const taskEl = createTaskElement(parent, hasSubtasks);
            wrapper.appendChild(taskEl);

            if (hasSubtasks) {
                const subContainer = document.createElement('div');
                subContainer.className = 'subtask-container';
                if (!expandedTasks.has(parent.id)) {
                    subContainer.classList.add('hidden');
                    const btn = taskEl.querySelector('.btn-toggle-subtasks');
                    if (btn) btn.classList.add('rotate');
                }
                subtasks.forEach(sub => {
                    const subEl = createTaskElement(sub, false, true);
                    if (allowDrag) {
                        subEl.draggable = true;
                        subEl.addEventListener('dragstart', (e) => {
                            e.stopPropagation();
                            subEl.classList.add('dragging');
                            subEl.dataset.dragType = 'subtask';
                            e.dataTransfer.setData('text/plain', sub.id);
                        });
                        subEl.addEventListener('dragend', (e) => {
                            e.stopPropagation();
                            subEl.classList.remove('dragging');
                            delete subEl.dataset.dragType;
                            saveTaskOrder();
                        });
                    }
                    subContainer.appendChild(subEl);
                });
                wrapper.appendChild(subContainer);
            }
            taskListEl.appendChild(wrapper);

        } else if (item.type === 'orphan') {
            // Renderizar subtarea "huérfana" pero con indicador
            const sub = item.task;

            const container = document.createElement('div');
            container.style.marginBottom = '10px';

            const parentLabel = document.createElement('div');
            parentLabel.className = 'parent-indicator';
            parentLabel.innerHTML = `<i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right:5px;"></i> Subtarea de: <strong>${item.parent.title}</strong>`;
            container.appendChild(parentLabel);

            const subEl = createTaskElement(sub, false, true);
            subEl.classList.add('orphan-subtask');

            const fakeContainer = document.createElement('div');
            fakeContainer.className = 'subtask-container'; // Para estilo reducido
            fakeContainer.style.marginLeft = '0';
            fakeContainer.style.paddingLeft = '0';
            fakeContainer.style.borderLeft = 'none';
            fakeContainer.appendChild(subEl);

            container.appendChild(fakeContainer);
            taskListEl.appendChild(container);
        }
    });
}

function saveTaskOrder() {
    // Capturar hijos directos del container principal.
    const children = Array.from(taskListEl.children);

    // Mapa actual para referencia
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    // Array temporal para reconstruir el estado local ordenado
    const newTasks = [];

    // Variable para controlar el índice de orden global
    // Usamos espacios grandes (e.g. 1000) por si queremos insertar cosas en medio sin reordenar todo (aunque aquí reordenamos todo por simplicidad y robustez)
    let currentOrderIndex = 0;
    const ORDER_STEP = 1000;

    children.forEach(child => {
        const id = child.dataset.id;
        const task = taskMap.get(id);

        if (task) {
            let needsUpdate = false;
            let updates = {};

            // 1. Verificar si fue promovido a padre (era subtarea y ahora esta en root)
            if (child.classList.contains('task-item') && task.parentId) {
                task.parentId = null;
                updates.parentId = null;
                needsUpdate = true;
            }

            // 2. Actualizar Orden del Padre
            currentOrderIndex += ORDER_STEP;
            if (task.order !== currentOrderIndex) {
                task.order = currentOrderIndex;
                updates.order = currentOrderIndex;
                needsUpdate = true;
            }

            // Aplicar actualización a Firebase si hubo cambios
            if (needsUpdate && window.updateTaskInFirebase) {
                window.updateTaskInFirebase(task.id, updates);
            }

            newTasks.push(task);
            taskMap.delete(id);

            // 3. Procesar Subtareas (si es un wrapper)
            if (child.classList.contains('task-wrapper')) {
                // Buscamos las subtareas que pertenecen a este ID en el DOM
                // NOTA: Con la lógica actual de render, las subtareas están dentro del .subtask-container del wrapper

                const subContainer = child.querySelector('.subtask-container');
                if (subContainer) {
                    const subElements = Array.from(subContainer.querySelectorAll('.task-item'));
                    subElements.forEach(subEl => {
                        const subId = subEl.dataset.id;
                        const subTask = taskMap.get(subId); // OJO: Las subtareas siguen en el map global inicial

                        if (subTask) {
                            currentOrderIndex += ORDER_STEP;
                            let subNeedsUpdate = false;
                            let subUpdates = {};

                            if (subTask.order !== currentOrderIndex) {
                                subTask.order = currentOrderIndex;
                                subUpdates.order = currentOrderIndex;
                                subNeedsUpdate = true;
                            }

                            if (subNeedsUpdate && window.updateTaskInFirebase) {
                                window.updateTaskInFirebase(subTask.id, subUpdates);
                            }

                            newTasks.push(subTask);
                            taskMap.delete(subId);
                        }
                    });
                }
            }
        }
    });

    // Agregar remanentes (por si aca - e.g. tareas de otros filtros si no fuera 'all', pero drag solo es en all)
    taskMap.forEach(t => newTasks.push(t));

    tasks = newTasks;
    // No llamamos a renderTasks aquí para evitar parpadeos, el DOM ya está en su lugar.
}

function toggleSubtasks(taskId, btn) {
    if (expandedTasks.has(taskId)) {
        expandedTasks.delete(taskId);
        btn.classList.add('rotate');
    } else {
        expandedTasks.add(taskId);
        btn.classList.remove('rotate');
    }
    // Buscar el contenedor hermano y togglear
    const wrapper = btn.closest('.task-wrapper');
    const container = wrapper.querySelector('.subtask-container');
    if (container) container.classList.toggle('hidden');
}

function createTaskElement(task, hasSubtasks = false, isSubtask = false) {
    const div = document.createElement('div');
    div.className = `task-item priority-${task.priority}`;
    div.dataset.id = task.id;
    if (task.status === 'completed') div.style.opacity = '0.6';

    // Toggle Button Logic
    let toggleHtml = '';
    // Si tiene subtareas, mostrar el toggle.
    // Si NO tiene subtareas pero NO es una subtarea (es padre potencial), podríamos mostrarlo inactivo o nada.
    // Mostramos solo si hasSubtasks es true para no ensuciar UI.
    // Pero espera, si añado una subtarea, necesito refrescar para ver el botón. (renderTasks se llama tras crear)
    if (hasSubtasks) {
        toggleHtml = `<button class="btn-toggle-subtasks" onclick="toggleSubtasks('${task.id}', this)">${ICONS.chevronDown}</button>`;
        // Añadir al set inicial si no se habia interactuado (default: abierto)
        if (!expandedTasks.has(task.id) && !div.dataset.initialized) {
            expandedTasks.add(task.id);
        }
    } else {
        toggleHtml = `<span style="width:20px;display:inline-block;margin-right:5px;"></span>`; // Espaciador para alinear
    }

    const iconHtml = task.icon ? `<i class="${task.icon}" style="margin-right:5px;"></i>` : '';

    let categoryHtml = '';
    if (task.category) {
        const tags = task.category.split(',').map(t => t.trim()).filter(t => t);
        categoryHtml = tags.map(tag => `<span class="task-category-badge">${tag}</span>`).join('');
    }

    // Recurrence Text Logic
    let recurrenceText = '';
    if (task.recurrence && task.recurrence !== 'none') {
        let text = '';
        if (task.recurrence === 'daily') text = 'Se repite diariamente';
        else if (task.recurrence === 'weekly') text = 'Se repite semanalmente';
        else if (task.recurrence === 'monthly') text = 'Se repite mensualmente';
        else if (task.recurrence === 'custom') {
            const daysMap = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            const daysStr = (task.recurrenceDays || []).map(d => daysMap[d]).join(', ');
            text = `Se repite: ${daysStr}`;
        }
        recurrenceText = `<div class="task-recurrence-text"><i class="fa-solid fa-rotate-right"></i> ${text}</div>`;
    }

    div.innerHTML = `
        <div style="display:flex;align-items:center;">
             ${!isSubtask ? toggleHtml : ''}
            <div class="task-check" onclick="toggleTaskStatus('${task.id}')">
                ${task.status === 'completed' ? ICONS.check : '<div style="width:16px;height:16px;border:2px solid var(--text-secondary);border-radius:4px;"></div>'}
            </div>
        </div>
        <div class="task-content">
            <div class="task-title" style="${task.status === 'completed' ? 'text-decoration:line-through' : ''}">
                ${iconHtml}${task.title}${categoryHtml}
            </div>
            ${recurrenceText}
            <div class="task-meta">
                <span><i class="fa-regular fa-calendar"></i> ${task.date || 'Sin fecha'}</span>
                ${task.pomodoros > 0 ? `<span><i class="fa-solid fa-fire"></i> ${task.pomodoros}</span>` : ''}
            </div>
        </div>
        <div class="task-actions">
            <button class="action-btn" onclick="startPomodoroForTask('${task.id}')" title="Iniciar Pomodoro">${ICONS.play}</button>
            <button class="action-btn" onclick="openModal('${task.id}')">${ICONS.edit}</button>
            <button class="action-btn" onclick="window.addSubtask('${task.id}')" title="Agregar Subtarea">${ICONS.add}</button>
            <button class="action-btn" onclick="deleteTask('${task.id}')">${ICONS.delete}</button>
        </div>
    `;
    // Drag listeners removidos de aquí para evitar conflictos con el wrapper
    // div.addEventListener('dragstart', (e) => { ... });
    // div.addEventListener('dragend', () => ... );
    return div;
}

function handleDragOver(e) {
    e.preventDefault();
    const afterElement = getDragAfterElement(taskListEl, e.clientY);
    const draggable = document.querySelector('.dragging');
    if (!draggable) return;
    if (afterElement == null) taskListEl.appendChild(draggable);
    else taskListEl.insertBefore(draggable, afterElement);
}

function handleDrop(e) { e.preventDefault(); }

function getDragAfterElement(container, y) {
    // Aceptamos tanto wrappers (padres existentes) como task-items (subtareas migrantes) como objetivos de orden
    const draggableElements = [...container.querySelectorAll(':scope > .task-wrapper:not(.dragging), :scope > .task-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
        else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    currentMonthYearEl.textContent = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentDate);

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay(); // 0 (Sun) to 6 (Sat)

    calendarGridEl.innerHTML = '';

    // headers
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    days.forEach(d => {
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = d;
        header.style.fontWeight = 'bold';
        header.style.textAlign = 'center';
        header.style.padding = '10px 0';
        header.style.color = 'var(--text-secondary)';
        calendarGridEl.appendChild(header);
    });

    // Empty slots before first day
    for (let i = 0; i < startingDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        calendarGridEl.appendChild(empty);
    }

    // Days
    for (let i = 1; i <= daysInMonth; i++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';

        // Current rendered date
        const currentDayDate = new Date(year, month, i);
        const currentDayDateStr = currentDayDate.toISOString().split('T')[0];

        // Highlight today
        if (currentDayDateStr === new Date().toISOString().split('T')[0]) {
            dayEl.classList.add('today');
        }

        dayEl.innerHTML = `<div class="day-number">${i}</div>`;

        // Check for tasks
        tasks.forEach(task => {
            // Ignorar subtasks en calendario para no saturar? O mostrarlas?
            // El usuario no especificó, pero generalmente el calendario muestra items principales o todo.
            // Mostraremos todo.

            if (!task.date) return;

            let shouldRender = false;
            const taskStart = new Date(task.date + 'T00:00:00'); // Force local time interpretation mostly
            const taskEnd = task.endDate ? new Date(task.endDate + 'T00:00:00') : null;

            // 1. Single Date or Duration Range
            if (task.recurrence === 'none' || !task.recurrence) {
                if (taskEnd) {
                    // Range
                    if (currentDayDate >= taskStart && currentDayDate <= taskEnd) shouldRender = true;
                } else {
                    // Single Day
                    if (task.date === currentDayDateStr) shouldRender = true;
                }
            }
            // 2. Recurrence
            else {
                // Check if task started before or on this day
                if (currentDayDate >= taskStart) {
                    // Check if task ended (if endDate is set for recurrence termination)
                    if (taskEnd && currentDayDate > taskEnd) {
                        shouldRender = false;
                    } else {
                        // Check Logic
                        if (task.recurrence === 'daily') {
                            shouldRender = true;
                        } else if (task.recurrence === 'weekly') {
                            // Same day of week
                            if (currentDayDate.getDay() === taskStart.getDay()) shouldRender = true;
                        } else if (task.recurrence === 'monthly') {
                            // Same day of month
                            if (currentDayDate.getDate() === taskStart.getDate()) shouldRender = true;
                        } else if (task.recurrence === 'custom') {
                            // Check if current day of week is in recurrenceDays
                            const days = task.recurrenceDays || [];
                            if (days.includes(currentDayDate.getDay())) shouldRender = true;
                        }
                    }
                }
            }

            if (shouldRender) {
                const dot = document.createElement('div');
                dot.className = 'day-task-dot';
                dot.title = task.title;
                // Visual distinction for recurring?
                if (task.recurrence && task.recurrence !== 'none') {
                    dot.style.borderRadius = '2px'; // Square-ish for recurring maybe?
                }

                if (task.priority === 'high') dot.style.backgroundColor = 'var(--danger-color)';
                else if (task.priority === 'medium') dot.style.backgroundColor = 'var(--warning-color)';
                else dot.style.backgroundColor = 'var(--success-color)';
                dayEl.appendChild(dot);
            }
        });

        calendarGridEl.appendChild(dayEl);
    }
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    if (currentView === 'calendar') renderCalendar();
    else renderListView();
}

function renderListView() {
    listViewEl.innerHTML = '';
    const tasksByDate = {};

    // Agrupar por fecha solo los PADRES (o huérfanos sin padre en esta fecha???)
    // Estrategia: Agrupar TODO por fecha.
    // Luego al renderizar grupo:
    // Identificar padres. Renderizarlos + sus hijos (si los hijos están también en la lista general? O siempre mostrar hijos?)
    // Si mostramos hijos SIEMPRE bajo el padre, debemos evitar mostrarlos sueltos si caen en la misma fecha.
    // Si un hijo cae en FECHA distinta al padre... ¿Dónde se muestra?
    // Para simplificar y cumplir "vista de lista... reflejarse subtareas mas pequeñas":
    // 1. Agrupamos Padres por fecha.
    // 2. Renderizamos Padre.
    // 3. Renderizamos sus hijos (todos) dentro del padre.
    // 4. Si un hijo NO tiene padre (huérfano de datos, error) o su padre no matchea filtro?
    // En 'filteredTasks' de sidebar filtramos !parentId.
    // Aquí 'tasks' tiene todo.

    // Paso 1: Filtrar Padres
    const parents = tasks.filter(t => !t.parentId);
    parents.forEach(task => {
        const date = task.date || 'Sin fecha';
        if (!tasksByDate[date]) tasksByDate[date] = [];
        tasksByDate[date].push(task);
    });

    const sortedDates = Object.keys(tasksByDate).sort();
    sortedDates.forEach(date => {
        const group = document.createElement('div');
        group.className = 'list-date-group';
        const header = document.createElement('div');
        header.className = 'list-date-header';
        header.textContent = date === 'Sin fecha' ? 'Sin fecha' : new Date(date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        group.appendChild(header);

        tasksByDate[date].forEach(parent => {
            const subtasks = tasks.filter(t => t.parentId === parent.id);
            const hasSubtasks = subtasks.length > 0;

            // Reusamos lógica de toggle Wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'task-wrapper'; // Reusamos estilo wrapper (spacing)
            wrapper.dataset.id = parent.id;

            // Render Parent
            const taskEl = createTaskElement(parent, hasSubtasks);
            wrapper.appendChild(taskEl);

            // Render Subtasks
            if (hasSubtasks) {
                const subContainer = document.createElement('div');
                subContainer.className = 'subtask-container'; // Aplica estilo small

                // Chequear si está expandido
                if (!expandedTasks.has(parent.id)) {
                    subContainer.classList.add('hidden');
                    const btn = taskEl.querySelector('.btn-toggle-subtasks');
                    if (btn) btn.classList.add('rotate');
                }

                subtasks.forEach(sub => {
                    const subEl = createTaskElement(sub, false, true); // isSubtask=true
                    subContainer.appendChild(subEl);
                });
                wrapper.appendChild(subContainer);
            }
            group.appendChild(wrapper);
        });

        listViewEl.appendChild(group);
    });
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    document.getElementById('main-timer').textContent = timeStr;

    // Update Mini Timer
    const miniTimerTime = document.getElementById('mini-timer-time');
    if (miniTimerTime) miniTimerTime.textContent = timeStr;
    const miniTimerDesk = document.getElementById('mini-timer');
    if (miniTimerDesk) miniTimerDesk.textContent = timeStr;

    const miniBtn = document.getElementById('mini-timer-toggle');
    if (miniBtn) {
        miniBtn.innerHTML = timerInterval ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    }
    checkMiniTimerVisibility();

    document.title = `${timeStr} - Planner Pro`;
    const circle = document.querySelector('.progress-ring__circle');
    const totalTime = pomodoroState.isBreak ? pomodoroState.breakTime * 60 : pomodoroState.workTime * 60;
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (timeLeft / totalTime) * circumference;
    circle.style.strokeDashoffset = offset;

    // Cycle Display Update
    const cycleDisplay = document.getElementById('cycle-display');
    if (cycleDisplay && pomodoroState) {
        cycleDisplay.textContent = `Ciclo ${pomodoroState.cycle}/${pomodoroState.totalCycles} (${pomodoroState.isBreak ? 'Descanso' : 'Trabajo'})`;
    }
}

function toggleTimer() {
    if (Notification.permission === 'default') Notification.requestPermission();
    if (isTimerRunning) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        document.getElementById('pomodoro-start').innerHTML = ICONS.play;
        document.getElementById('mini-play-btn').innerHTML = ICONS.play;
    } else {
        isTimerRunning = true;
        document.getElementById('pomodoro-start').innerHTML = '<i class="fa-solid fa-pause"></i>';
        document.getElementById('mini-play-btn').innerHTML = '<i class="fa-solid fa-pause"></i>';
        timerInterval = setInterval(() => {
            if (timeLeft > 0) { timeLeft--; updateTimerDisplay(); }
            else completeCycle();
        }, 1000);
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    timeLeft = (pomodoroState.isBreak ? pomodoroState.breakTime : pomodoroState.workTime) * 60;
    updateTimerDisplay();
    document.getElementById('pomodoro-start').innerHTML = ICONS.play;
    document.getElementById('mini-play-btn').innerHTML = ICONS.play;
}

function adjustTimer(minutes) {
    timeLeft += minutes * 60;
    if (timeLeft < 0) timeLeft = 0;
    updateTimerDisplay();
}

function startPomodoroForTask(id) {
    activeTaskId = id;
    const task = tasks.find(t => t.id === id);
    document.getElementById('active-task-name').textContent = task.title;

    // Mini Timer Task Name
    const miniDesktop = document.getElementById('mini-task-name-desktop');
    if (miniDesktop) { miniDesktop.textContent = task.title; miniDesktop.style.display = 'inline-block'; }
    const miniMobile = document.getElementById('mini-task-name-mobile');
    if (miniMobile) { miniMobile.textContent = task.title; miniMobile.style.display = 'block'; }

    document.getElementById('pomodoro-panel').style.display = 'flex';
    const settings = task.pomodoroSettings || { cycles: 1, work: 25, break: 5 };
    pomodoroState = { cycle: 1, isBreak: false, totalCycles: settings.cycles, workTime: settings.work, breakTime: settings.break };
    timeLeft = pomodoroState.workTime * 60;
    updateTimerDisplay();
    toggleTimer();
}

function changeCycle(direction) {
    if (!pomodoroState) return;

    // Logic: Flatten cycle/phase to a linear index
    // 0: C1 Work, 1: C1 Break, 2: C2 Work, 3: C2 Break...
    let totalPhases = pomodoroState.totalCycles * 2;
    // Wait, last cycle usually ends after work? Or work+break? 
    // Standard Pomodoro: 4 pomodoros -> Long break. 
    // Here: User defines "Cycles". 
    // Assumption: Cycle = Work + Break.

    let currentPhaseIndex = (pomodoroState.cycle - 1) * 2 + (pomodoroState.isBreak ? 1 : 0);
    let nextPhaseIndex = currentPhaseIndex + direction;

    if (nextPhaseIndex < 0) {
        // Reset to start
        nextPhaseIndex = 0;
    } else if (nextPhaseIndex >= totalPhases) {
        // Already at end, do nothing or complete
        return;
    }

    // Convert back
    const wasRunning = isTimerRunning;
    if (isTimerRunning) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        document.getElementById('pomodoro-start').innerHTML = ICONS.play;
        document.getElementById('mini-play-btn').innerHTML = ICONS.play;
    }

    pomodoroState.cycle = Math.floor(nextPhaseIndex / 2) + 1;
    pomodoroState.isBreak = (nextPhaseIndex % 2) === 1;

    // Reset time for new phase
    timeLeft = (pomodoroState.isBreak ? pomodoroState.breakTime : pomodoroState.workTime) * 60;

    updateTimerDisplay();

    // Optionally auto-start if it was running? Or stop?
    // User asked for "adelantar", implying "skip this, go to next". 
    // Usually one wants to start the next one immediately? Or await?
    // Let's stop and let user press play to follow 'completeCycle' pattern of alerts (though here no alerts).
    // Better: Just reset to ready state.
}

function completeCycle() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    timerSound.play().catch(e => console.log('Audio play failed', e));
    if (Notification.permission === 'granted') {
        new Notification('Pomodoro Planner', {
            body: pomodoroState.isBreak ? '¡Descanso terminado!' : '¡Ciclo completado!',
            icon: 'favicon.ico'
        });
    }
    if (pomodoroState.isBreak) {
        pomodoroState.isBreak = false;
        pomodoroState.cycle++;
        if (pomodoroState.cycle > pomodoroState.totalCycles) {
            alert('¡Todos los ciclos completados!');
            if (activeTaskId && window.updateTaskInFirebase) {
                const task = tasks.find(t => t.id === activeTaskId);
                if (task) window.updateTaskInFirebase(task.id, { pomodoros: (task.pomodoros || 0) + pomodoroState.totalCycles });
            }
            resetTimer();
            return;
        } else {
            timeLeft = pomodoroState.workTime * 60;
            alert(`Ciclo ${pomodoroState.cycle} de ${pomodoroState.totalCycles}: ¡A trabajar!`);
        }
    } else {
        pomodoroState.isBreak = true;
        timeLeft = pomodoroState.breakTime * 60;
        alert('¡Tiempo de descanso!');
    }
    updateTimerDisplay();
    toggleTimer();
}