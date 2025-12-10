// State
let tasks = [];
let currentDate = new Date();
let timerInterval = null;
let timeLeft = 25 * 60;
let isTimerRunning = false;
let activeTaskId = null;
let currentView = 'calendar'; // 'calendar' or 'list'
let pomodoroState = {
    cycle: 1,
    isBreak: false,
    totalCycles: 1,
    workTime: 25,
    breakTime: 5
};

// DOM Elements
const taskListEl = document.getElementById('task-list');
const calendarGridEl = document.getElementById('calendar-grid');
const listViewEl = document.getElementById('list-view');
const currentMonthYearEl = document.getElementById('current-month-year');
const modal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const taskParentSelect = document.getElementById('task-parent');
const timerSound = document.getElementById('timer-sound');

// Icons
const ICONS = {
    edit: '<i class="fa-solid fa-pen"></i>',
    delete: '<i class="fa-solid fa-trash"></i>',
    play: '<i class="fa-solid fa-play"></i>',
    check: '<i class="fa-solid fa-check"></i>'
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // loadTasks();  <-- ELIMINADO: Ya no cargamos del local storage
    // En su lugar, esperamos a que Firebase nos llame

    renderCalendar();
    // renderTasks(); <-- Esperamos a tener datos
    setupEventListeners();
    updateTimerDisplay();
    setupCustomSelect();

    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
});

// --- PUENTE CON FIREBASE ---
// Esta función es llamada desde firebase-logic.js cuando hay datos nuevos
window.recibirTareasDeFirebase = (tareasDescargadas) => {
    tasks = tareasDescargadas; // Actualizamos la memoria local

    // Renderizamos todo de nuevo
    renderTasks();
    if (currentView === 'calendar') renderCalendar();
    else renderListView();
    updateParentSelect();
};


function setupCustomSelect() {
    const select = document.getElementById('task-icon-select');
    if (!select) return;

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    // Hide original select
    select.style.display = 'none';

    // Create custom UI
    const customSelect = document.createElement('div');
    customSelect.className = 'custom-select';

    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    trigger.innerHTML = `<span>${select.options[select.selectedIndex].text}</span> <div class="custom-select-arrow"></div>`;

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'custom-options';

    // Populate options
    Array.from(select.options).forEach(option => {
        const customOption = document.createElement('div');
        customOption.className = 'custom-option';
        customOption.dataset.value = option.value;

        if (option.value && option.value !== 'custom') {
            customOption.innerHTML = `<i class="${option.value}"></i> <span>${option.text}</span>`;
        } else {
            customOption.innerHTML = `<span>${option.text}</span>`;
        }

        if (option.selected) {
            customOption.classList.add('selected');
        }

        customOption.addEventListener('click', () => {
            // Update selected class
            customSelect.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
            customOption.classList.add('selected');

            // Update trigger text
            trigger.querySelector('span').innerHTML = customOption.innerHTML;

            // Update original select
            select.value = option.value;

            // Trigger change event manually
            const event = new Event('change');
            select.dispatchEvent(event);

            // Close dropdown
            customSelect.classList.remove('open');
        });

        optionsContainer.appendChild(customOption);
    });

    customSelect.appendChild(trigger);
    customSelect.appendChild(optionsContainer);
    wrapper.appendChild(customSelect);

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent closing immediately
        customSelect.classList.toggle('open');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!customSelect.contains(e.target)) {
            customSelect.classList.remove('open');
        }
    });

    // Listen for external changes to the original select (e.g. from openModal)
    select.addEventListener('change', () => {
        // Find the option that matches the new value
        const selectedOption = Array.from(select.options).find(opt => opt.value === select.value);
        if (selectedOption) {
            // Update trigger
            let content = `<span>${selectedOption.text}</span>`;
            if (selectedOption.value && selectedOption.value !== 'custom') {
                content = `<i class="${selectedOption.value}"></i> <span>${selectedOption.text}</span>`;
            }
            trigger.querySelector('span').innerHTML = content;

            // Update selected class in custom options
            customSelect.querySelectorAll('.custom-option').forEach(opt => {
                if (opt.dataset.value === select.value) {
                    opt.classList.add('selected');
                } else {
                    opt.classList.remove('selected');
                }
            });
        }
    });
}

// Event Listeners
function setupEventListeners() {
    // Modal Controls
    document.getElementById('add-task-btn').addEventListener('click', () => openModal());
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-task').addEventListener('click', closeModal);
    taskForm.addEventListener('submit', handleTaskSubmit);

    // Calendar Navigation
    document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

    // View Toggles
    document.getElementById('view-calendar').addEventListener('click', () => switchView('calendar'));
    document.getElementById('view-list').addEventListener('click', () => switchView('list'));

    // Timer Controls
    document.getElementById('pomodoro-start').addEventListener('click', toggleTimer);
    document.getElementById('pomodoro-reset').addEventListener('click', resetTimer);
    document.getElementById('mini-play-btn').addEventListener('click', toggleTimer);
    document.getElementById('close-pomodoro').addEventListener('click', () => {
        document.getElementById('pomodoro-panel').style.display = 'none';
    });

    // Timer Adjustments
    document.querySelectorAll('.btn-adjust').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const minutes = parseInt(e.target.dataset.time);
            adjustTimer(minutes);
        });
    });

    // Icon Selector
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

    // Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderTasks(e.target.dataset.filter);
        });
    });

    // Drag and Drop
    taskListEl.addEventListener('dragover', handleDragOver);
    taskListEl.addEventListener('drop', handleDrop);
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

// --- Task Management ---

// ELIMINADO: function loadTasks() ...
// ELIMINADO: function saveTasks() ...
// Ahora delegamos en Firebase

function openModal(editId = null) {
    modal.classList.add('active');
    updateParentSelect();

    if (editId) {
        const task = tasks.find(t => t.id === editId);
        document.getElementById('modal-title').textContent = 'Editar Tarea';
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-desc').value = task.desc || '';
        document.getElementById('task-date').value = task.date || '';
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-parent').value = task.parentId || '';
        document.getElementById('task-category').value = task.category || '';

        // Icon handling
        const iconSelect = document.getElementById('task-icon-select');
        const iconCustom = document.getElementById('task-icon-custom');
        const taskIcon = task.icon || '';

        // Check if icon exists in select options
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

        // Trigger change to update custom select UI
        iconSelect.dispatchEvent(new Event('change'));

        // Pomodoro Settings
        const settings = task.pomodoroSettings || { cycles: 1, work: 25, break: 5 };
        document.getElementById('pomo-cycles').value = settings.cycles;
        document.getElementById('pomo-work').value = settings.work;
        document.getElementById('pomo-break').value = settings.break;

        taskForm.dataset.editId = editId;
    } else {
        document.getElementById('modal-title').textContent = 'Nueva Tarea';
        taskForm.reset();
        document.getElementById('task-date').valueAsDate = new Date();
        // Defaults
        document.getElementById('pomo-cycles').value = 1;
        document.getElementById('pomo-work').value = 25;
        document.getElementById('pomo-break').value = 5;

        // Reset custom select
        const iconSelect = document.getElementById('task-icon-select');
        iconSelect.value = '';
        document.getElementById('task-icon-custom').style.display = 'none';
        iconSelect.dispatchEvent(new Event('change'));

        delete taskForm.dataset.editId;
    }
}

function closeModal() {
    modal.classList.remove('active');
}

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
    const priority = document.getElementById('task-priority').value;
    const parentId = document.getElementById('task-parent').value;
    const category = document.getElementById('task-category').value;

    const iconSelect = document.getElementById('task-icon-select');
    let icon = iconSelect.value;
    if (icon === 'custom') {
        icon = document.getElementById('task-icon-custom').value;
    }

    const pomodoroSettings = {
        cycles: parseInt(document.getElementById('pomo-cycles').value) || 1,
        work: parseInt(document.getElementById('pomo-work').value) || 25,
        break: parseInt(document.getElementById('pomo-break').value) || 5
    };

    const editId = taskForm.dataset.editId;

    // Objeto con los datos
    const taskData = {
        title, desc, date, priority, parentId, category, icon, pomodoroSettings
    };

    if (editId) {
        // EDITAR EN FIREBASE
        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(editId, taskData);
        }
    } else {
        // CREAR EN FIREBASE
        if (window.addTaskToFirebase) {
            window.addTaskToFirebase(taskData);
        }
    }

    closeModal();
    // No llamamos a renderTasks ni saveTasks, esperamos el callback de Firebase
}

function deleteTask(id) {
    if (confirm('¿Estás seguro de eliminar esta tarea?')) {
        // BORRAR EN FIREBASE
        if (window.deleteTaskFromFirebase) {
            window.deleteTaskFromFirebase(id);
        }
        // También borramos las subtareas en local para limpieza visual rapida,
        // aunque lo ideal seria borrar sus documentos en Firebase tambien
        const subtasks = tasks.filter(t => t.parentId === id);
        subtasks.forEach(sub => {
            if (window.deleteTaskFromFirebase) window.deleteTaskFromFirebase(sub.id);
        });
    }
}

function toggleTaskStatus(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        const newStatus = task.status === 'completed' ? 'pending' : 'completed';
        // ACTUALIZAR EN FIREBASE
        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(id, { status: newStatus });
        }
    }
}

function renderTasks(filter = 'all') {
    taskListEl.innerHTML = '';

    let filteredTasks = tasks.filter(t => !t.parentId);

    if (filter === 'today') {
        const todayStr = new Date().toISOString().split('T')[0];
        filteredTasks = filteredTasks.filter(t => t.date === todayStr);
    } else if (filter === 'high') {
        filteredTasks = filteredTasks.filter(t => t.priority === 'high');
    }

    if (filteredTasks.length === 0) {
        taskListEl.innerHTML = '<div class="empty-state" style="text-align:center; color:var(--text-secondary); padding:20px;">No hay tareas</div>';
        return;
    }

    filteredTasks.forEach(task => {
        const taskEl = createTaskElement(task);
        taskListEl.appendChild(taskEl);

        const subtasks = tasks.filter(t => t.parentId === task.id);
        if (subtasks.length > 0) {
            const subContainer = document.createElement('div');
            subContainer.className = 'subtask-container';
            subtasks.forEach(sub => {
                subContainer.appendChild(createTaskElement(sub));
            });
            taskListEl.appendChild(subContainer);
        }
    });
}

function createTaskElement(task) {
    const div = document.createElement('div');
    div.className = `task-item priority-${task.priority}`;
    div.dataset.id = task.id;
    div.draggable = true;
    if (task.status === 'completed') div.style.opacity = '0.6';

    const iconHtml = task.icon ? `<i class="${task.icon}" style="margin-right:5px;"></i>` : '';
    const categoryHtml = task.category ? `<span class="task-category-badge">${task.category}</span>` : '';

    div.innerHTML = `
        <div class="task-check" onclick="toggleTaskStatus('${task.id}')">
            ${task.status === 'completed' ? ICONS.check : '<div style="width:16px;height:16px;border:2px solid var(--text-secondary);border-radius:4px;"></div>'}
        </div>
        <div class="task-content">
            <div class="task-title" style="${task.status === 'completed' ? 'text-decoration:line-through' : ''}">
                ${iconHtml}${task.title}${categoryHtml}
            </div>
            <div class="task-meta">
                <span><i class="fa-regular fa-calendar"></i> ${task.date || 'Sin fecha'}</span>
                ${task.pomodoros > 0 ? `<span><i class="fa-solid fa-fire"></i> ${task.pomodoros}</span>` : ''}
            </div>
        </div>
        <div class="task-actions">
            <button class="action-btn" onclick="startPomodoroForTask('${task.id}')" title="Iniciar Pomodoro">${ICONS.play}</button>
            <button class="action-btn" onclick="openModal('${task.id}')">${ICONS.edit}</button>
            <button class="action-btn" onclick="deleteTask('${task.id}')">${ICONS.delete}</button>
        </div>
    `;

    div.addEventListener('dragstart', (e) => {
        div.classList.add('dragging');
        e.dataTransfer.setData('text/plain', task.id);
    });
    div.addEventListener('dragend', () => div.classList.remove('dragging'));

    return div;
}

// --- Drag and Drop ---
function handleDragOver(e) {
    e.preventDefault();
    const afterElement = getDragAfterElement(taskListEl, e.clientY);
    const draggable = document.querySelector('.dragging');
    if (afterElement == null) {
        taskListEl.appendChild(draggable);
    } else {
        taskListEl.insertBefore(draggable, afterElement);
    }
}

function handleDrop(e) {
    e.preventDefault();
    // Logic to persist order would go here
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// --- Calendar Logic ---

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    currentMonthYearEl.textContent = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentDate);

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    calendarGridEl.innerHTML = '';

    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    days.forEach(d => {
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = d;
        calendarGridEl.appendChild(header);
    });

    for (let i = 0; i < startingDay; i++) {
        calendarGridEl.appendChild(document.createElement('div'));
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        if (dateStr === new Date().toISOString().split('T')[0]) {
            dayEl.classList.add('today');
        }

        dayEl.innerHTML = `<div class="day-number">${i}</div>`;

        const dayTasks = tasks.filter(t => t.date === dateStr);
        dayTasks.forEach(t => {
            const dot = document.createElement('div');
            dot.className = 'day-task-dot';
            dot.title = t.title;
            if (t.priority === 'high') dot.style.backgroundColor = 'var(--danger-color)';
            else if (t.priority === 'medium') dot.style.backgroundColor = 'var(--warning-color)';
            else dot.style.backgroundColor = 'var(--success-color)';
            dayEl.appendChild(dot);
        });

        calendarGridEl.appendChild(dayEl);
    }
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    if (currentView === 'calendar') renderCalendar();
    else renderListView(); // Update list view if it depends on month (optional, here we show all)
}

// --- List View Logic ---

function renderListView() {
    listViewEl.innerHTML = '';

    // Group tasks by date
    const tasksByDate = {};
    tasks.forEach(task => {
        const date = task.date || 'Sin fecha';
        if (!tasksByDate[date]) tasksByDate[date] = [];
        tasksByDate[date].push(task);
    });

    // Sort dates
    const sortedDates = Object.keys(tasksByDate).sort();

    sortedDates.forEach(date => {
        const group = document.createElement('div');
        group.className = 'list-date-group';

        const header = document.createElement('div');
        header.className = 'list-date-header';
        header.textContent = date === 'Sin fecha' ? 'Sin fecha' : new Date(date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        group.appendChild(header);

        tasksByDate[date].forEach(task => {
            group.appendChild(createTaskElement(task));
        });

        listViewEl.appendChild(group);
    });
}

// --- Pomodoro Logic ---

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    document.getElementById('main-timer').textContent = timeStr;
    document.getElementById('mini-timer').textContent = timeStr;
    document.title = `${timeStr} - Planner Pro`;

    const circle = document.querySelector('.progress-ring__circle');
    const totalTime = pomodoroState.isBreak ? pomodoroState.breakTime * 60 : pomodoroState.workTime * 60;

    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (timeLeft / totalTime) * circumference;
    circle.style.strokeDashoffset = offset;
}

function toggleTimer() {
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
            if (timeLeft > 0) {
                timeLeft--;
                updateTimerDisplay();
            } else {
                completeCycle();
            }
        }, 1000);
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;

    // Reset to start of current state
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
    document.getElementById('pomodoro-panel').style.display = 'flex';

    // Load settings
    const settings = task.pomodoroSettings || { cycles: 1, work: 25, break: 5 };
    pomodoroState = {
        cycle: 1,
        isBreak: false,
        totalCycles: settings.cycles,
        workTime: settings.work,
        breakTime: settings.break
    };

    timeLeft = pomodoroState.workTime * 60;
    updateTimerDisplay();
    toggleTimer();
}

function completeCycle() {
    clearInterval(timerInterval);
    isTimerRunning = false;

    // Play sound
    timerSound.play().catch(e => console.log('Audio play failed', e));

    // Notification
    if (Notification.permission === 'granted') {
        new Notification('Pomodoro Planner', {
            body: pomodoroState.isBreak ? '¡Descanso terminado! A trabajar.' : '¡Ciclo completado! Toma un descanso.',
            icon: 'favicon.ico'
        });
    }

    if (pomodoroState.isBreak) {
        // End of break, start next work cycle or finish
        pomodoroState.isBreak = false;
        pomodoroState.cycle++;

        if (pomodoroState.cycle > pomodoroState.totalCycles) {
            alert('¡Todos los ciclos completados!');
            if (activeTaskId) {
                const task = tasks.find(t => t.id === activeTaskId);
                if (task) {
                    // ACTUALIZAR EN FIREBASE
                    if (window.updateTaskInFirebase) {
                        const newPomodoroCount = (task.pomodoros || 0) + pomodoroState.totalCycles;
                        window.updateTaskInFirebase(task.id, { pomodoros: newPomodoroCount });
                    }
                }
            }
            resetTimer(); // Reset to default
            return;
        } else {
            timeLeft = pomodoroState.workTime * 60;
            alert(`Ciclo ${pomodoroState.cycle} de ${pomodoroState.totalCycles}: ¡A trabajar!`);
        }
    } else {
        // End of work, start break
        pomodoroState.isBreak = true;
        timeLeft = pomodoroState.breakTime * 60;
        alert('¡Tiempo de descanso!');
    }

    updateTimerDisplay();
    toggleTimer(); // Auto-start next phase
}