// State
let tasks = [];
let currentDate = new Date();
let timerInterval = null;
let timeLeft = 25 * 60;
let isTimerRunning = false;
let activeTaskId = null;
let currentView = 'calendar'; // 'calendar' or 'list'
let pomodoroState = { cycle: 1, isBreak: false, totalCycles: 1, workTime: 25, breakTime: 5 };
let dailyGoal = parseInt(localStorage.getItem('planner_daily_goal')) || 5;
let confettiTriggeredToday = false;

// Filtering State
let activeFilters = { dateRange: 'today', tags: new Set(), status: 'all' }; // status: 'all' | 'completed'

// DOM Elements & Icons
const taskListEl = document.getElementById('task-list');
const calendarGridEl = document.getElementById('calendar-grid');
const listViewEl = document.getElementById('list-view');
const currentMonthYearEl = document.getElementById('current-month-year');
const modal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const taskParentSelect = document.getElementById('task-parent');
const timerSound = document.getElementById('timer-sound');
const confettiCanvas = document.getElementById('confetti-canvas');

const ICONS = {
    edit: '<i class="fa-solid fa-pen"></i>',
    delete: '<i class="fa-solid fa-trash"></i>',
    play: '<i class="fa-solid fa-play"></i>',
    check: '<i class="fa-solid fa-check"></i>',
    add: '<i class="fa-solid fa-plus"></i>',
    chevronDown: '<i class="fa-solid fa-chevron-down"></i>'
};

const expandedTasks = new Set();

// --- FILTERING LOGIC ---
function applyFilters() {
    // 1. Update UI Elements State (Desktop & Mobile Sync)
    const dateSelect = document.getElementById('filter-date-range');
    if (dateSelect) dateSelect.value = activeFilters.dateRange;

    const mobileDateSelect = document.getElementById('mobile-filter-date-range');
    if (mobileDateSelect) mobileDateSelect.value = activeFilters.dateRange;

    // Tags (Updates class for chips in both containers)
    document.querySelectorAll('.filter-chip').forEach(chip => {
        if (activeFilters.tags.has(chip.textContent)) chip.classList.add('active');
        else chip.classList.remove('active');
    });

    // Status Button Sync
    updateFilterButtonIcon();

    // 2. Determine Date Range
    let start = null, end = null;
    // Use currentDate as the reference anchor (allows navigation)
    // Strip time to ensure clean date comparison
    const now = new Date(currentDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (activeFilters.dateRange === 'today') {
        start = new Date(today); end = new Date(today);
    } else if (activeFilters.dateRange === 'yesterday') {
        start = new Date(today); start.setDate(today.getDate() - 1);
        end = new Date(start);
    } else if (activeFilters.dateRange === 'tomorrow') {
        start = new Date(today); start.setDate(today.getDate() + 1);
        end = new Date(start);
    } else if (activeFilters.dateRange === 'week') {
        // Current week (Sunday to Saturday)
        const day = today.getDay();
        start = new Date(today); start.setDate(today.getDate() - day);
        end = new Date(start); end.setDate(end.getDate() + 6);
    } else if (activeFilters.dateRange === 'month') {
        // "Este Mes": From TODAY to End of Month (User Request)
        start = new Date(today);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (activeFilters.dateRange === 'last-month') {
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
    }
    // 'all' leaves start/end as null

    // 3. Filter Tasks
    const filteredTasks = tasks.filter(task => {
        // Exclude Timeline Comments from Main List
        if (task.isTimelineComment || task.category === 'comment') return false;

        // Tag Filter (OR logic)
        if (activeFilters.tags.size > 0) {
            if (!task.category) return false;
            const taskTags = task.category.split(',').map(t => t.trim());
            if (![...activeFilters.tags].some(tag => taskTags.includes(tag))) return false;
        }

        // Folder Check: Always show folders (unless filtered by tags above)
        const isFolder = !!task.isFolder || (!task.date && !!task.color);
        if (isFolder) return true;

        // Status Filter
        if (activeFilters.status === 'completed') {
            if (task.status !== 'completed') return false;
        } else if (activeFilters.status === 'pending') {
            if (task.status === 'completed') return false;
        }

        // Date Filter
        if (activeFilters.status === 'completed') {
            if (task.status !== 'completed') return false;
        } else if (activeFilters.status === 'pending') {
            if (task.status === 'completed') return false;
        }

        // Date Filter
        if (activeFilters.dateRange === 'all') return true;

        // Optimizations
        if (start.getTime() === end.getTime()) {
            return isTaskOnDate(task, start);
        } else {
            // Range check
            let d = new Date(start);
            while (d <= end) {
                if (isTaskOnDate(task, d)) return true;
                d.setDate(d.getDate() + 1);
            }
            return false;
        }
    });

    renderTasks(filteredTasks);
    renderListView(activeFilters.dateRange, start, end);
    if (currentView === 'timeline') renderTimeline(activeFilters.dateRange, start, end);
}

// Helper: Update Status Button Icon & State
function updateFilterButtonIcon() {
    const btns = [
        document.getElementById('filter-completed'),
        document.getElementById('mobile-filter-completed')
    ];

    btns.forEach(btn => {
        if (!btn) return;

        // Remove active class initially
        btn.classList.remove('active');

        if (activeFilters.status === 'all') {
            // Icon: Double Check (Gray/Inactive state) - implying "Click to filter"
            // User requested retaining the fa-check-double class concept, but we need to show states.
            // Let's use a clear "All" state or "Layer Group"
            btn.innerHTML = '<i class="fa-solid fa-layer-group"></i>';
            btn.title = "Viendo: Todos";
        } else if (activeFilters.status === 'pending') {
            // Icon: Square (Pending)
            btn.innerHTML = '<i class="fa-regular fa-square"></i>';
            btn.title = "Viendo: Pendientes";
            btn.classList.add('active');
        } else if (activeFilters.status === 'completed') {
            // Icon: Check Double (Completed)
            btn.innerHTML = '<i class="fa-solid fa-check-double"></i>';
            btn.title = "Viendo: Completadas";
            btn.classList.add('active');
        }
    });
}

// --- MOBILE TABS LOGIC ---
window.switchMobileTab = function (tab) {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.body.classList.remove('tab-list', 'tab-calendar', 'tab-timer', 'tab-timeline');
    document.body.classList.add(`tab-${tab}`);

    if (tab === 'list') { switchView('list'); checkMiniTimerVisibility(); }
    else if (tab === 'calendar') { switchView('calendar'); checkMiniTimerVisibility(); }
    else if (tab === 'timeline') { switchView('timeline'); checkMiniTimerVisibility(); }
    else if (tab === 'timer') { checkMiniTimerVisibility(); }
};

// --- DAILY GOAL LOGIC ---
function updateDailyGoalUI() {
    // MATCH FILTER LOGIC EXACTLY
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Helper: Check if task is valid for 'Today' (scheduled or recurring on today)
    // Matches behavior of: activeFilters.dateRange === 'today'
    const isToday = (t) => isTaskOnDate(t, today);

    // Completed Today (Filter: Status=Completed AND Date=Today)
    const completedTodayCount = tasks.filter(t =>
        t.status === 'completed' && isToday(t)
    ).length;

    // Pending Today (Filter: Status!=Completed AND Date=Today)
    const pendingTodayCount = tasks.filter(t =>
        t.status !== 'completed' && isToday(t)
    ).length;

    // Total for Goal (Completed + Pending)
    // Note: This means overdue tasks completed today will NOT count if their date wasn't moved.
    // This matches the user request to follow the filter logic.
    const totalToday = completedTodayCount + pendingTodayCount;

    // Update Desktop Widget
    const goalInput = document.getElementById('daily-goal-input');
    if (goalInput) goalInput.value = dailyGoal;

    const progressBar = document.getElementById('goal-progress-bar');
    const percentage = dailyGoal > 0 ? Math.min(100, (completedTodayCount / dailyGoal) * 100) : 0;
    if (progressBar) progressBar.style.width = `${percentage}%`;

    const progressText = document.getElementById('goal-progress-text');
    if (progressText) progressText.textContent = `${completedTodayCount}/${dailyGoal} completadas`;

    const totalText = document.getElementById('today-total-text');
    if (totalText) totalText.textContent = `${totalToday} total hoy`;

    // Update Mobile Widget
    const mobileProgress = document.getElementById('mobile-goal-progress');
    if (mobileProgress) mobileProgress.textContent = `${completedTodayCount}/${dailyGoal}`;

    const mobileBar = document.getElementById('mobile-goal-bar');
    if (mobileBar) mobileBar.style.width = `${percentage}%`;

    // Confetti Check
    if (completedTodayCount >= dailyGoal && !confettiTriggeredToday && completedTodayCount > 0) {
        triggerConfetti();
        confettiTriggeredToday = true;
    } else if (completedTodayCount < dailyGoal) {
        confettiTriggeredToday = false; // Reset if user unchecks
    }

    // Pass the TODAY object to stats to ensure same reference
    updateDailyStatsUI(totalToday, pendingTodayCount, today);
}

function updateDailyStatsUI(totalToday, pendingTodayCount, todayRef) {
    // Use passed reference or fallback for robustness
    const today = todayRef || new Date(new Date().setHours(0, 0, 0, 0));

    // Pending Tasks Today breakdown
    const pendingTasks = tasks.filter(t =>
        t.status !== 'completed' && isTaskOnDate(t, today)
    );

    const highCount = pendingTasks.filter(t => t.priority === 'high').length;
    const mediumCount = pendingTasks.filter(t => t.priority === 'medium').length;
    const lowCount = pendingTasks.filter(t => t.priority === 'low').length;

    // Avoid division by zero for pending percentages
    const totalPending = pendingTasks.length;
    const highPct = totalPending > 0 ? Math.round((highCount / totalPending) * 100) : 0;
    const mediumPct = totalPending > 0 ? Math.round((mediumCount / totalPending) * 100) : 0;
    const lowPct = totalPending > 0 ? Math.round((lowCount / totalPending) * 100) : 0;

    // Completion Percentage
    // completedCount is derived
    const completedCount = totalToday - pendingTodayCount;
    const completedPct = totalToday > 0 ? Math.round((completedCount / totalToday) * 100) : 0;

    // Update Elements
    const elTotal = document.getElementById('stats-total-today');
    if (elTotal) elTotal.textContent = totalPending;

    const elHigh = document.getElementById('stats-high');
    if (elHigh) elHigh.textContent = `${highPct}%`;

    const elMedium = document.getElementById('stats-medium');
    if (elMedium) elMedium.textContent = `${mediumPct}%`;

    const elLow = document.getElementById('stats-low');
    if (elLow) elLow.textContent = `${lowPct}%`;

    const elCompleted = document.getElementById('stats-completed-percent');
    if (elCompleted) elCompleted.textContent = `${completedPct}%`;

    // Only set quote if empty/loading
    const elQuote = document.getElementById('stats-quote');
    if (elQuote && elQuote.textContent.includes("Cargando")) {
        if (typeof FRASES_MOTIVACIONALES !== 'undefined' && FRASES_MOTIVACIONALES.length > 0) {
            const randomQuote = FRASES_MOTIVACIONALES[Math.floor(Math.random() * FRASES_MOTIVACIONALES.length)];
            elQuote.textContent = `"${randomQuote}"`;
        } else {
            elQuote.textContent = "Haz que hoy cuente.";
        }
    }
}

function triggerConfetti() {
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

function checkMiniTimerVisibility() {
    const miniTimerEl = document.getElementById('mobile-mini-timer');
    const panel = document.getElementById('pomodoro-panel');
    const isPanelVisible = panel && panel.style.display !== 'none';
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        if (timerInterval && !isPanelVisible) miniTimerEl.classList.remove('hidden');
        else miniTimerEl.classList.add('hidden');
    } else {
        miniTimerEl.classList.add('hidden');
    }
}

function togglePomodoroPanel(show) {
    const panel = document.getElementById('pomodoro-panel');
    if (show) {
        panel.style.display = 'flex';
        checkMiniTimerVisibility();
    } else {
        panel.style.display = 'none';
        checkMiniTimerVisibility();
    }
}

window.addSubtask = (parentId) => {
    openModal();
    const parentSelect = document.getElementById('task-parent');
    if (parentSelect) parentSelect.value = parentId;
};

document.addEventListener('DOMContentLoaded', () => {
    renderCalendar();
    setupEventListeners();
    updateTimerDisplay();
    setupCustomSelect();
    setupAuthListeners();

    if (window.innerWidth <= 768) {
        window.switchMobileTab('list');
    } else {
        document.body.classList.add('tab-list');
    }

    // Initial Filter Apply
    applyFilters();

    // Daily Goals Setup
    const goalInput = document.getElementById('daily-goal-input');
    if (goalInput) {
        goalInput.addEventListener('change', (e) => {
            dailyGoal = parseInt(e.target.value) || 5;
            localStorage.setItem('planner_daily_goal', dailyGoal);
            updateDailyGoalUI();
        });
    }
});

window.recibirTareasDeFirebase = (tareasDescargadas) => {
    tasks = tareasDescargadas.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : Infinity;
        const orderB = b.order !== undefined ? b.order : Infinity;
        return orderA - orderB;
    });

    // Re-apply filters instead of raw render
    if (currentView === 'calendar') renderCalendar();
    applyFilters();

    updateParentSelect();
    renderCategoryTags();
    updateParentSelect();
    renderCategoryTags();
    updateDailyGoalUI();
};

function renderCategoryTags() {
    // Desktop Container
    const desktopContainer = document.getElementById('category-tags-container');
    // Mobile Container
    const mobileContainer = document.getElementById('mobile-category-tags-container');

    const categories = new Set();
    tasks.forEach(task => {
        if (task.category && task.category.trim() !== '') {
            task.category.split(',').forEach(tag => {
                if (tag.trim() !== '') categories.add(tag.trim());
            });
        }
    });

    // Helper to fill container
    const fillContainer = (container, isMobile) => {
        if (!container) return;
        container.innerHTML = '';

        // Add "Volver" Button
        const backBtn = document.createElement('button');
        backBtn.className = 'tag-chip';
        // Style manually to distinguish or just rely on tag-chip
        backBtn.style.border = '1px solid var(--accent-color)';
        backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Volver';
        backBtn.onclick = () => {
            container.classList.add('hidden');
            if (isMobile) {
                const mobFilters = document.querySelector('.mobile-filters-section');
                if (mobFilters) mobFilters.classList.remove('hidden');
                document.getElementById('mobile-btn-tags-filter').classList.remove('active');
            } else {
                const filters = document.querySelector('.task-filters');
                if (filters) filters.classList.remove('hidden');
                document.getElementById('btn-tags-filter').classList.remove('active');
            }
        };
        container.appendChild(backBtn);

        if (categories.size === 0) {
            const msg = document.createElement('span');
            msg.style.fontSize = '0.8rem';
            msg.style.color = 'var(--text-secondary)';
            msg.style.marginLeft = '8px';
            msg.textContent = 'No hay etiquetas';
            container.appendChild(msg);
            return;
        }
        categories.forEach(cat => {
            const chip = document.createElement('button');
            chip.className = 'tag-chip filter-chip';
            if (activeFilters.tags.has(cat)) chip.classList.add('active');
            chip.textContent = cat;
            chip.addEventListener('click', () => {
                if (activeFilters.tags.has(cat)) activeFilters.tags.delete(cat);
                else activeFilters.tags.add(cat);
                applyFilters(); // Trigger update
            });
            container.appendChild(chip);
        });
    };

    fillContainer(desktopContainer, false);
    fillContainer(mobileContainer, true);
}

function setupAuthListeners() {
    const loginForm = document.getElementById('login-form');
    // ... same as before
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const errorMsg = document.getElementById('login-error');
    const btnRegister = document.getElementById('btn-register');
    const btnLogout = document.getElementById('logout-btn');

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
                    emailInput.value = ''; passInput.value = '';
                }
            }
        });
    }
    if (btnRegister) {
        btnRegister.addEventListener('click', async () => {
            errorMsg.style.display = 'none';
            if (passInput.value.length < 6) {
                errorMsg.textContent = "La contraseña debe tener al menos 6 caracteres.";
                errorMsg.style.display = 'block'; return;
            }
            if (window.authRegister) {
                const result = await window.authRegister(emailInput.value, passInput.value);
                if (!result.success) {
                    errorMsg.textContent = result.message;
                    errorMsg.style.display = 'block';
                } else {
                    alert("Cuenta creada. Iniciando sesión...");
                    emailInput.value = ''; passInput.value = '';
                }
            }
        });
    }
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm("¿Cerrar sesión?")) {
                if (window.authLogout) window.authLogout();
            }
        });
    }
}

function setupCustomSelect() {
    // ... exact copy of existing custom select logic ...
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

    // Dynamic Parent Filtering
    document.getElementById('task-date').addEventListener('change', updateParentSelect);
    document.getElementById('task-end-date').addEventListener('change', updateParentSelect);

    // Mobile Widgets Toggle
    const mobileToggle = document.getElementById('mobile-widgets-toggle');
    const mobileContainer = document.getElementById('mobile-widgets-container');
    if (mobileToggle && mobileContainer) {
        mobileToggle.addEventListener('click', () => {
            const isCollapsed = mobileContainer.classList.contains('collapsed');
            if (isCollapsed) {
                mobileContainer.classList.remove('collapsed');
                mobileToggle.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
            } else {
                mobileContainer.classList.add('collapsed');
                mobileToggle.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
            }
        });
    }

    // Folder Checkbox Logic
    const folderCheckbox = document.getElementById('task-is-folder');
    if (folderCheckbox) {
        folderCheckbox.addEventListener('change', (e) => {
            const isFolder = e.target.checked;
            const dateInput = document.getElementById('task-date');
            const colorInput = document.getElementById('task-color');
            const parentSelect = document.getElementById('task-parent'); // User requested to hide this

            // Find wrappers to hide
            const dateRow = dateInput.closest('.form-row'); // Contains date and end-date usually
            const parentGroup = parentSelect.closest('.form-group');
            const priorityGroup = document.getElementById('task-priority').closest('.form-group');
            const recurrenceGroup = document.getElementById('task-recurrence').closest('.form-group');

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
                // Recurrence container remains hidden unless custom is selected (handled by its own listener)
            }
        });
    }



    document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

    document.getElementById('view-calendar').addEventListener('click', () => switchView('calendar'));
    document.getElementById('view-list').addEventListener('click', () => switchView('list'));
    document.getElementById('view-timeline').addEventListener('click', () => switchView('timeline'));

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

    // Mini Cycle Controls
    const miniPrev = document.getElementById('mini-prev-cycle');
    if (miniPrev) miniPrev.addEventListener('click', () => changeCycle(-1));
    const miniNext = document.getElementById('mini-next-cycle');
    if (miniNext) miniNext.addEventListener('click', () => changeCycle(1));
    const deskMiniPrev = document.getElementById('desk-mini-prev-cycle');
    if (deskMiniPrev) deskMiniPrev.addEventListener('click', () => changeCycle(-1));
    const deskMiniNext = document.getElementById('desk-mini-next-cycle');
    if (deskMiniNext) deskMiniNext.addEventListener('click', () => changeCycle(1));

    const deskMiniExpand = document.getElementById('desk-mini-expand-btn');
    if (deskMiniExpand) deskMiniExpand.addEventListener('click', () => togglePomodoroPanel(true));

    document.getElementById('close-pomodoro').addEventListener('click', () => togglePomodoroPanel(false));
    const expandBtn = document.getElementById('mini-expand-btn');
    if (expandBtn) expandBtn.addEventListener('click', () => togglePomodoroPanel(true));

    const miniTimerToggle = document.getElementById('mini-timer-toggle');
    if (miniTimerToggle) {
        miniTimerToggle.addEventListener('click', () => {
            if (timerInterval) pauseTimer();
            else startTimer();
        });
    }

    document.querySelectorAll('.btn-adjust-mini').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.target.closest('.btn-adjust-mini');
            if (target && target.dataset.time) {
                const time = parseInt(target.dataset.time);
                if (!isNaN(time)) adjustTimer(time);
            }
        });
    });

    // --- REPLACED FILTER BUTTONS LOGIC ---

    // 1. Date Range Dropdown
    const dateRangeSelect = document.getElementById('filter-date-range');
    if (dateRangeSelect) {
        dateRangeSelect.addEventListener('change', (e) => {
            activeFilters.dateRange = e.target.value;
            applyFilters();
        });
    }

    // Mobile Date Range
    const mobileDateRangeSelect = document.getElementById('mobile-filter-date-range');
    if (mobileDateRangeSelect) {
        mobileDateRangeSelect.addEventListener('change', (e) => {
            activeFilters.dateRange = e.target.value;
            applyFilters();
        });
    }

    // 2. Todos / Reset Button
    const resetBtn = document.getElementById('filter-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            activeFilters = { dateRange: 'today', tags: new Set(), status: 'all' };
            applyFilters();
        });
    }

    // Mobile Reset
    const mobileResetBtn = document.getElementById('mobile-filter-reset');
    if (mobileResetBtn) {
        mobileResetBtn.addEventListener('click', () => {
            activeFilters = { dateRange: 'today', tags: new Set(), status: 'all' };
            applyFilters();
        });
    }

    // 3. Completed Button (Tri-state: All -> Pending -> Completed -> All)
    const handleStatusToggle = () => {
        if (activeFilters.status === 'all') {
            activeFilters.status = 'pending';
        } else if (activeFilters.status === 'pending') {
            activeFilters.status = 'completed';
        } else {
            activeFilters.status = 'all';
        }
        applyFilters();
    };

    const completedBtn = document.getElementById('filter-completed');
    if (completedBtn) {
        completedBtn.addEventListener('click', handleStatusToggle);
    }

    // Mobile Completed
    const mobileCompletedBtn = document.getElementById('mobile-filter-completed');
    if (mobileCompletedBtn) {
        mobileCompletedBtn.addEventListener('click', handleStatusToggle);
    }

    // Tags Toggle Button (Show/Hide Container)
    const btnTags = document.getElementById('btn-tags-filter');
    if (btnTags) {
        btnTags.addEventListener('click', () => {
            const container = document.getElementById('category-tags-container');
            const filters = document.querySelector('.task-filters');

            container.classList.remove('hidden');
            filters.classList.add('hidden');
            btnTags.classList.add('active');
        });
    }

    // Mobile Tags Toggle
    const mobileBtnTags = document.getElementById('mobile-btn-tags-filter');
    if (mobileBtnTags) {
        mobileBtnTags.addEventListener('click', () => {
            const container = document.getElementById('mobile-category-tags-container');
            const filters = document.querySelector('.mobile-filters-section');

            container.classList.remove('hidden');
            if (filters) filters.classList.add('hidden');
            mobileBtnTags.classList.add('active');
        });
    }

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

    // Modal & Drag
    document.getElementById('close-day-details').addEventListener('click', closeDayDetails);
    document.getElementById('day-details-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('day-details-modal')) closeDayDetails();
    });
    taskListEl.addEventListener('dragover', handleDragOver);
    taskListEl.addEventListener('drop', handleDrop);

    // Touch Drag & Drop
    taskListEl.addEventListener('touchstart', handleTouchStart, { passive: false });
    taskListEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    taskListEl.addEventListener('touchend', handleTouchEnd);


    // View Density Toggles
    const densityBtn = document.getElementById('btn-view-density');
    if (densityBtn) densityBtn.addEventListener('click', toggleListDensity);

    const mobileDensityBtn = document.getElementById('mobile-btn-view-density');
    if (mobileDensityBtn) mobileDensityBtn.addEventListener('click', toggleListDensity);

    // Initial Apply
    applyListDensity();

    // Daily Stats Toggle
    const statsHeader = document.getElementById('stats-header');
    const statsBody = document.getElementById('stats-body');
    const statsChevron = document.getElementById('stats-chevron');
    if (statsHeader && statsBody) {
        statsHeader.addEventListener('click', () => {
            if (statsBody.style.display === 'none') {
                statsBody.style.display = 'block';
                statsChevron.style.transform = 'rotate(180deg)';
                localStorage.setItem('planner_stats_expanded', 'true');
            } else {
                statsBody.style.display = 'none';
                statsChevron.style.transform = 'rotate(0deg)';
                localStorage.setItem('planner_stats_expanded', 'false');
            }
        });

        // Restore State
        const isExpanded = localStorage.getItem('planner_stats_expanded') === 'true';
        if (isExpanded) {
            statsBody.style.display = 'block';
            statsChevron.style.transform = 'rotate(180deg)';
        }
    }
}

function switchView(view) {
    currentView = view;
    document.getElementById('view-calendar').classList.toggle('active', view === 'calendar');
    document.getElementById('view-list').classList.toggle('active', view === 'list');
    document.getElementById('view-timeline').classList.toggle('active', view === 'timeline');
    if (view === 'calendar') {
        calendarGridEl.style.display = 'grid';
        listViewEl.style.display = 'none';
        document.getElementById('timeline-view').style.display = 'none';
        renderCalendar();
    } else if (view === 'list') {
        calendarGridEl.style.display = 'none';
        listViewEl.style.display = 'flex';
        document.getElementById('timeline-view').style.display = 'none';
        applyFilters();
    } else if (view === 'timeline') {
        calendarGridEl.style.display = 'none';
        listViewEl.style.display = 'none';
        document.getElementById('timeline-view').style.display = 'block';
        applyFilters(); // Apply filters calls renderTimeline via activeFilters check or manual call
    }
}

function openModal(editId = null) {
    // ... Copy existing implementation ...
    modal.classList.add('active');
    // moved updateParentSelect to end
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

        const isFolder = !!task.isFolder || (!task.date && !!task.color); // Derived or explicit
        document.getElementById('task-is-folder').checked = isFolder;
        document.getElementById('task-color').value = task.color || '#3b82f6';

        // Trigger UI update
        document.getElementById('task-is-folder').dispatchEvent(new Event('change'));

        // If not folder, restore values (listener might have cleared them)
        if (!isFolder) {
            document.getElementById('task-date').value = task.date || '';
            document.getElementById('task-priority').value = task.priority;
            document.getElementById('task-recurrence').value = task.recurrence || 'none';
        }

        taskForm.dataset.editId = editId;
    } else {
        document.getElementById('modal-title').textContent = 'Nueva Tarea';
        taskForm.reset();

        // Reset Folder UI
        document.getElementById('task-is-folder').checked = false;
        document.getElementById('task-is-folder').dispatchEvent(new Event('change'));

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
    updateParentSelect();
}

function closeModal() { modal.classList.remove('active'); }

function updateParentSelect() {
    const editId = taskForm.dataset.editId;
    const dateVal = document.getElementById('task-date').value;
    const endDateVal = document.getElementById('task-end-date').value;
    const currentParentId = document.getElementById('task-parent').value;

    taskParentSelect.innerHTML = '<option value="">Ninguna (Tarea Principal)</option>';

    // Helper to check validity
    const isValidParent = (t) => {
        if (editId && t.id === editId) return false; // Prevent self-parenting

        const isFolder = !!t.isFolder || (!t.date && !!t.color);
        if (isFolder) return true; // Folders always available

        if (!dateVal && !endDateVal) return true; // Show all if no dates set

        let onStart = false;
        if (dateVal) onStart = isTaskOnDate(t, new Date(dateVal + 'T00:00:00'));

        let onEnd = false;
        if (endDateVal) onEnd = isTaskOnDate(t, new Date(endDateVal + 'T00:00:00'));

        return onStart || onEnd;
    };

    // Render options with indentation for hierarchy
    const renderOption = (t, depth) => {
        if (depth > 2) return;

        // If valid, show it
        if (isValidParent(t)) {
            const option = document.createElement('option');
            option.value = t.id;
            option.textContent = '\u00A0\u00A0'.repeat(depth) + (depth > 0 ? '↳ ' : '') + t.title;
            taskParentSelect.appendChild(option);
        }

        // Recurse to children regardless (they might be valid even if parent isn't)
        tasks.filter(child => child.parentId === t.id).forEach(c => renderOption(c, depth + 1));
    };

    // Start with roots
    tasks.filter(t => !t.parentId).forEach(t => renderOption(t, 0));

    // Restore value if possible
    if (currentParentId) taskParentSelect.value = currentParentId;
}

function handleTaskSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('task-title').value;
    const desc = document.getElementById('task-desc').value;
    const isFolder = document.getElementById('task-is-folder').checked; // Capture explicitly

    // Logic for Folders: Clear Date/Time/Priority
    const date = isFolder ? null : document.getElementById('task-date').value;
    const endDate = isFolder ? null : document.getElementById('task-end-date').value;
    const priority = isFolder ? 'none' : document.getElementById('task-priority').value;
    const recurrence = isFolder ? 'none' : document.getElementById('task-recurrence').value;
    const color = document.getElementById('task-color').value; // Capture color

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

    // Include color and isFolder in the payload
    const taskData = {
        title,
        desc,
        date,
        endDate,
        priority,
        recurrence,
        recurrenceDays,
        parentId: parentId || null,
        category,
        icon,
        pomodoroSettings,
        color: isFolder ? color : null,
        isFolder: isFolder
    };

    if (editId) { if (window.updateTaskInFirebase) window.updateTaskInFirebase(editId, taskData); }
    else { if (window.addTaskToFirebase) window.addTaskToFirebase(taskData); }

    // Optimistic Update for immediate UI feedback (optional, but good)
    // Actually receiving Firebase update will trigger UI refresh, but let's ensure goal checks happen
    setTimeout(updateDailyGoalUI, 500); // Small delay to allow Firebase callback
    closeModal();
}

function deleteTask(id) {
    if (confirm('¿Estás seguro de eliminar esta tarea?')) {
        if (window.deleteTaskFromFirebase) window.deleteTaskFromFirebase(id);
        const subtasks = tasks.filter(t => t.parentId === id);
        subtasks.forEach(sub => { if (window.deleteTaskFromFirebase) window.deleteTaskFromFirebase(sub.id); });
        setTimeout(updateDailyGoalUI, 500);
    }
}

function calculateNextOccurrence(currentDateStr, recurrence, recurrenceDays) {
    // ... default calc logic ...
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
        if (nextDay !== undefined) { nextDate.setDate(date.getDate() + (nextDay - currentDay)); }
        else { nextDay = sortedDays[0]; const daysUntilNextWeek = 7 - currentDay + nextDay; nextDate.setDate(date.getDate() + daysUntilNextWeek); }
    }
    return nextDate.toISOString().split('T')[0];
}

function isTaskOnDate(task, targetDateObj) {
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
        // ... Recurrence logic continues ...
        if (targetDateObj < taskStart) return false;
        if (taskEnd && targetDateObj > taskEnd) return false;
        if (task.recurrence === 'daily') return true;
        if (task.recurrence === 'weekly') return targetDateObj.getDay() === taskStart.getDay();
        if (task.recurrence === 'monthly') return targetDateObj.getDate() === taskStart.getDate();
        if (task.recurrence === 'custom') return (task.recurrenceDays || []).includes(targetDateObj.getDay());
    }
    return false;
}

function openDayDetails(date) {
    const modal = document.getElementById('day-details-modal');
    const title = document.getElementById('day-details-title');
    const body = document.getElementById('day-details-body');
    const btnAdd = document.getElementById('btn-add-task-on-day');

    const dateObj = new Date(date + 'T00:00:00');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    title.textContent = dateObj.toLocaleDateString('es-ES', options);
    body.innerHTML = '';
    const dayTasks = tasks.filter(t => isTaskOnDate(t, dateObj));

    if (dayTasks.length === 0) {
        body.innerHTML = '<p style="text-align:center; color:var(--text-secondary); margin-top:20px;">No hay tareas para este día.</p>';
    } else {
        dayTasks.forEach(task => {
            const item = document.createElement('div');
            item.className = 'task-item';
            const taskEl = createTaskElement(task, false);
            const toggle = taskEl.querySelector('.btn-toggle-subtasks');
            if (toggle) toggle.style.visibility = 'hidden';
            item.appendChild(taskEl);
            body.appendChild(taskEl);
        });
    }

    btnAdd.onclick = () => { closeDayDetails(); openModal(); document.getElementById('task-date').value = date; };
    modal.classList.add('active');
}

function closeDayDetails() { document.getElementById('day-details-modal').classList.remove('active'); }

function toggleTaskStatus(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Timeline: Close active session if completing
    let updatedSessions = task.sessions ? [...task.sessions] : [];
    if (task.status !== 'completed') { // Marking as complete
        const activeIdx = updatedSessions.findIndex(s => !s.end);
        if (activeIdx !== -1) {
            updatedSessions[activeIdx].end = new Date().toISOString();
        } else if (updatedSessions.length === 0) {
            // Manual completion without timer: Add metadata entry
            const now = new Date().toISOString();
            updatedSessions.push({ start: now, end: now });
        }
    }

    if (task.status !== 'completed' && task.recurrence && task.recurrence !== 'none') {
        // Recurrence Case: Copy sessions to history, then reset for next occurrence
        const historyTask = { ...task, id: null, status: 'completed', recurrence: 'none', completedAt: new Date().toISOString(), sessions: updatedSessions };
        delete historyTask.id;
        const nextDateStr = calculateNextOccurrence(task.date, task.recurrence, task.recurrenceDays);
        if (nextDateStr) {
            if (window.addTaskToFirebase) window.addTaskToFirebase(historyTask);
            // Reset sessions for the new instance of the recurring task
            if (window.updateTaskInFirebase) window.updateTaskInFirebase(id, { date: nextDateStr, status: 'pending', sessions: [] });
        } else {
            if (window.updateTaskInFirebase) window.updateTaskInFirebase(id, { status: 'completed', sessions: updatedSessions });
        }
    } else {
        // Standard Case
        if (window.updateTaskInFirebase) window.updateTaskInFirebase(id, {
            status: task.status === 'completed' ? 'pending' : 'completed',
            completedAt: task.status !== 'completed' ? new Date().toISOString() : null,
            sessions: updatedSessions
        });
    }
    // Note: We rely on the firebase callback to update global state and UI, but if we want instant feedback logic should be here.
    // For now assuming firebase callback 'recibirTareasDeFirebase' handles the re-render.
}

// UPDATED RENDER TASKS (Accepts pre-filtered list)
function renderTasks(tasksToRender) {
    taskListEl.innerHTML = '';
    const processedIds = new Set();
    const renderSet = new Set(tasksToRender.map(t => t.id));

    // Recursive Helper function for N-level nesting
    function renderRecursive(parentId, container, depth) {
        if (depth > 2) return; // Limit depth (Root=0, Child=1, Grand=2 -> 3 levels total)

        const children = tasksToRender.filter(t => t.parentId === parentId);
        if (children.length === 0) return;

        children.forEach(child => {
            if (processedIds.has(child.id)) return;
            processedIds.add(child.id);

            // Check if this child has its own children to show toggle
            const hasGrandChildren = tasksToRender.some(t => t.parentId === child.id);

            const taskEl = createTaskElement(child, hasGrandChildren, true);

            // Helper Drag Logic for Subtask
            taskEl.draggable = true;
            taskEl.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                taskEl.classList.add('dragging');
                taskEl.dataset.dragType = 'subtask';
                e.dataTransfer.setData('text/plain', child.id);
                e.dataTransfer.effectAllowed = 'move';
            });
            taskEl.addEventListener('dragend', (e) => {
                e.stopPropagation();
                taskEl.classList.remove('dragging');
                delete taskEl.dataset.dragType;
                saveTaskOrder();
            });

            container.appendChild(taskEl);

            if (hasGrandChildren) {
                const subContainer = document.createElement('div');
                subContainer.className = 'subtask-container';
                if (!expandedTasks.has(child.id)) {
                    subContainer.classList.add('hidden');
                    const btn = taskEl.querySelector('.btn-toggle-subtasks');
                    if (btn) btn.classList.add('rotate');
                }
                renderRecursive(child.id, subContainer, depth + 1);
                container.appendChild(subContainer);
            }
        });
    }

    // 1. Identify Roots and Render
    // A root is either a top-level task (no parent) OR a task whose parent is NOT in the current filtered list (phanotm orphan)
    tasksToRender.forEach(task => {
        const isRoot = !task.parentId || !renderSet.has(task.parentId);

        if (isRoot && !processedIds.has(task.id)) {
            processedIds.add(task.id);
            const hasChildren = tasksToRender.some(t => t.parentId === task.id);

            const wrapper = document.createElement('div');
            wrapper.className = 'task-wrapper';
            wrapper.dataset.id = task.id;

            // Orphan Context Logic
            if (task.parentId) {
                const realParent = tasks.find(p => p.id === task.parentId);
                const pName = realParent ? realParent.title : '...';
                const context = document.createElement('div');
                context.className = 'parent-indicator';
                context.innerHTML = `<i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right:5px;"></i> Subtarea de: <strong>${pName}</strong>`;
                wrapper.appendChild(context);
            }

            // Wrapper Drag Logic
            wrapper.draggable = true;
            wrapper.addEventListener('dragstart', (e) => {
                wrapper.classList.add('dragging');
                wrapper.dataset.dragType = 'parent';
                e.dataTransfer.setData('text/plain', task.id);
                e.dataTransfer.effectAllowed = 'move';
            });
            wrapper.addEventListener('dragend', () => {
                wrapper.classList.remove('dragging');
                delete wrapper.dataset.dragType;
                saveTaskOrder();
            });

            const taskEl = createTaskElement(task, hasChildren, false);
            wrapper.appendChild(taskEl);

            if (hasChildren) {
                const subContainer = document.createElement('div');
                subContainer.className = 'subtask-container';
                if (!expandedTasks.has(task.id)) {
                    subContainer.classList.add('hidden');
                    const btn = taskEl.querySelector('.btn-toggle-subtasks');
                    if (btn) btn.classList.add('rotate');
                }
                renderRecursive(task.id, subContainer, 1);
                wrapper.appendChild(subContainer);
            }

            taskListEl.appendChild(wrapper);
        }
    });

    if (tasksToRender.length === 0) {
        taskListEl.innerHTML = '<div class="empty-state" style="text-align:center; color:var(--text-secondary); padding:20px;">No hay tareas con este filtro</div>';
    }
}

// UPDATED Save Task Order (Slot Swapping for Filters)
function saveTaskOrder() {
    // 1. Get the current visual order from the DOM
    const visualWrappers = Array.from(taskListEl.children);
    const visibleTaskIds = [];

    // Helper to extract IDs recursively (Wrapper -> Parent + Subtasks)
    visualWrappers.forEach(child => {
        // Wrapper cases
        if (child.classList.contains('task-wrapper')) {
            const parentId = child.dataset.id;
            if (parentId) visibleTaskIds.push(parentId);

            const subContainer = child.querySelector('.subtask-container');
            if (subContainer) {
                const subs = subContainer.querySelectorAll('.task-item');
                subs.forEach(s => visibleTaskIds.push(s.dataset.id));
            }
        }
        // Orphan container cases
        else if (child.children.length > 0) {
            // Likely orphan container
            // The orphan itself is usually inside a .subtask-container inside this div
            // structure: div > div.parent-indicator + div.subtask-container > div.task-item.orphan-subtask
            const orphans = child.querySelectorAll('.task-item');
            orphans.forEach(o => visibleTaskIds.push(o.dataset.id));
        }
        // Direct item (shouldn't happen with current render, but safety)
        else if (child.classList.contains('task-item')) {
            visibleTaskIds.push(child.dataset.id);
        }
    });

    if (visibleTaskIds.length === 0) return;

    // 2. Separate global tasks into "Visible" and "Hidden" buckets
    // We want to preserve the relative "slots" of the visible tasks in the global list
    // so that when we re-insert the shuffled visible tasks, they take the original positions(indexes) 
    // of the visible tasks, leaving hidden tasks untouched in between.

    // Sort global tasks by current order first to ensure reliable index mapping
    // (Though they should be sorted, let's be safe)
    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));

    const visibleIdSet = new Set(visibleTaskIds);
    const visibleTasksIndices = []; // Indices in the global `tasks` array
    const hiddenTasks = []; // The objects of hidden tasks

    tasks.forEach((t, index) => {
        if (visibleIdSet.has(t.id)) {
            visibleTasksIndices.push(index);
        } else {
            // It's a hidden task, we don't touch it, but we need to know it exists
        }
    });

    // 3. Create the new global order list
    const newTasks = [...tasks]; // Copy

    // 4. Place the VISIBLE tasks back into the VISIBLE slots in their NEW visual order
    // visibleTaskIds has the ID sequence [C, A]
    // visibleTasksIndices has the indices [0, 5] (example) where visible tasks USED to be
    // We put C at index 0, A at index 5.

    if (visibleTasksIndices.length !== visibleTaskIds.length) {
        console.warn("Mismatch in visible task tracking during reorder", visibleTasksIndices.length, visibleTaskIds.length);
        // Fallback: just append? No, dangerous. Abort reorder to save data.
        return;
    }

    visibleTasksIndices.forEach((globalIndex, i) => {
        const taskId = visibleTaskIds[i];
        const taskObj = tasks.find(t => t.id === taskId);
        if (taskObj) {
            newTasks[globalIndex] = taskObj;
        }
    });

    // 5. Reassign 'order' property to ALL tasks based on this new array sequence
    // This preserves the gap logic essentially.
    const updatesBatch = {};
    const ORDER_STEP = 1000;

    newTasks.forEach((t, i) => {
        const newOrder = (i + 1) * ORDER_STEP;
        if (t.order !== newOrder) {
            t.order = newOrder;
            if (window.updateTaskInFirebase) {
                window.updateTaskInFirebase(t.id, { order: newOrder });
            }
        }
    });

    // 6. Update global state
    tasks = newTasks;
}

function toggleSubtasks(taskId, btn) {
    if (expandedTasks.has(taskId)) { expandedTasks.delete(taskId); btn.classList.add('rotate'); } else { expandedTasks.add(taskId); btn.classList.remove('rotate'); }
    const wrapper = btn.closest('.task-wrapper'); const container = wrapper.querySelector('.subtask-container');
    if (container) container.classList.toggle('hidden');
}

// View Density State
let listDensity = localStorage.getItem('planner_list_density') || 'normal'; // normal, compact, large

function applyListDensity() {
    taskListEl.classList.remove('normal', 'compact', 'large');
    taskListEl.classList.add(listDensity);

    // Also apply to list view container if it exists
    if (listViewEl) {
        listViewEl.classList.remove('normal', 'compact', 'large');
        listViewEl.classList.add(listDensity);
    }

    // Update Button Icon based on next state
    const updateBtn = (btnId) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        // Cycle: Normal -> Compact -> Large -> Normal
        let iconClass = 'fa-bars'; // Default Normal
        let title = "Vista Normal";

        if (listDensity === 'normal') {
            // Next is Compact
            iconClass = 'fa-bars';
            title = "Vista Normal (Click para Compacta)";
        } else if (listDensity === 'compact') {
            iconClass = 'fa-compress';
            title = "Vista Compacta (Click para Amplia)";
        } else if (listDensity === 'large') {
            iconClass = 'fa-align-left';
            title = "Vista Amplia (Click para Normal)";
        }

        btn.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
        btn.title = title;
    };

    updateBtn('btn-view-density');
    updateBtn('mobile-btn-view-density');
}

function toggleListDensity() {
    console.log("toggleListDensity called. Current:", listDensity);
    if (listDensity === 'normal') listDensity = 'compact';
    else if (listDensity === 'compact') listDensity = 'large';
    else listDensity = 'large';
    // Logic error in previous snippet check: normal -> compact -> large -> normal
    if (listDensity === 'large' && localStorage.getItem('planner_list_density') === 'large') listDensity = 'normal'; // Fix cycle

    // Better cycle logic:
    const modes = ['normal', 'compact', 'large'];
    let idx = modes.indexOf(localStorage.getItem('planner_list_density') || 'normal');
    idx = (idx + 1) % modes.length;
    listDensity = modes[idx];

    localStorage.setItem('planner_list_density', listDensity);
    applyListDensity();
}

function createTaskElement(task, hasSubtasks = false, isSubtask = false) {
    const isFolder = !!task.isFolder || (!task.date && !!task.color);
    const div = document.createElement('div');
    // Use 'priority-none' for folders to avoid priority colors, add 'is-folder' class
    div.className = `task-item ${isFolder ? 'priority-none is-folder' : 'priority-' + task.priority}`;
    div.dataset.id = task.id;
    if (task.status === 'completed' && !isFolder) div.style.opacity = '0.6';

    if (isFolder && task.color) {
        div.style.borderLeft = `5px solid ${task.color}`;
        // Stronger gradient for visibility
        div.style.background = `linear-gradient(90deg, ${task.color}20, var(--card-bg))`;
    }

    let toggleHtml = '';
    if (hasSubtasks) {
        toggleHtml = `<button class="btn-toggle-subtasks" onclick="toggleSubtasks('${task.id}', this)">${ICONS.chevronDown}</button>`;
        if (!expandedTasks.has(task.id) && !div.dataset.initialized) { expandedTasks.add(task.id); }
    } else {
        toggleHtml = `<span style="width:20px;display:inline-block;margin-right:5px;"></span>`;
    }

    const iconHtml = task.icon ? `<i class="${task.icon}" style="margin-right:5px;"></i>` : (isFolder ? '<i class="fa-solid fa-folder" style="margin-right:5px;"></i>' : '');
    let categoryHtml = '';
    if (task.category) {
        const tags = task.category.split(',').map(t => t.trim()).filter(t => t);
        categoryHtml = tags.map(tag => `<span class="task-category-badge">${tag}</span>`).join('');
    }

    let recurrenceText = '';
    if (!isFolder && task.recurrence && task.recurrence !== 'none') {
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

    // Description (Hidden unless .large mode)
    const descriptionHtml = task.desc ? `<div class="task-description">${task.desc}</div>` : '';

    div.innerHTML = `
        <div style="display:flex;align-items:center;">
             ${!isSubtask || hasSubtasks ? toggleHtml : '<span style="width:20px;display:inline-block;margin-right:5px;"></span>'}
            <div class="task-check" onclick="${isFolder ? '' : `toggleTaskStatus('${task.id}')`}" style="${isFolder ? 'cursor:default; visibility:hidden;' : ''}">
                ${!isFolder && task.status === 'completed' ? ICONS.check : '<div style="width:16px;height:16px;border:2px solid var(--text-secondary);border-radius:4px;"></div>'}
            </div>
        </div>
        <div class="task-content">
            <div class="task-title" style="${!isFolder && task.status === 'completed' ? 'text-decoration:line-through' : ''}">
                ${iconHtml}${task.title}${categoryHtml}
            </div>
            ${descriptionHtml}
            ${recurrenceText}
            <div class="task-meta">
                ${isFolder ? '' : `<span><i class="fa-regular fa-calendar"></i> ${task.date || 'Sin fecha'}</span>`}
                ${task.pomodoros > 0 ? `<span><i class="fa-solid fa-fire"></i> ${task.pomodoros}</span>` : ''}
            </div>
        </div>
        <div class="task-actions">
            ${isFolder ? '' : `<button class="action-btn" onclick="startPomodoroForTask('${task.id}')" title="Iniciar Pomodoro">${ICONS.play}</button>`}
            <button class="action-btn" onclick="openModal('${task.id}')" title="Editar">${ICONS.edit}</button>
            <button class="action-btn" onclick="deleteTask('${task.id}')" title="Eliminar">${ICONS.delete}</button>
            <button class="action-btn" onclick="addSubtask('${task.id}')" title="Añadir Subtarea">${ICONS.add}</button>
        </div>
    `;

    // Allow dragging
    div.draggable = true;
    div.addEventListener('dragstart', () => {
        div.classList.add('dragging');
        // If it's a subtask, we might store dragType on it here, or rely on wrapper logic in startTouchDrag
        div.dataset.dragType = isSubtask ? 'subtask' : 'parent';
    });
    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
    });

    return div;
}

// --- TOUCH SUPPORT FOR DRAG & DROP ---
let touchTimer = null;
let touchDragItem = null;
let touchClone = null;
let touchStartX = 0;
let touchStartY = 0;
let touchOffsetX = 0;
let touchOffsetY = 0;

function handleTouchStart(e) {
    if (e.target.closest('.btn-toggle-subtasks') || e.target.closest('.action-btn') || e.target.closest('.task-check')) return;

    const taskItem = e.target.closest('.task-item');
    if (!taskItem) return;

    // Find wrapper if it's a parent, or allow dragging subtask
    // Logic: We want to drag the "Draggable Unit".
    // If it's a parent task, we drag the wrapper. If it's a subtask, we drag the item.
    let draggable = taskItem.closest('.draggable-unit');
    // Wait, we didn't add 'draggable-unit' class. 
    // Existing logic: .task-wrapper (parent) or .task-item (subtask, if draggable=true).

    // Let's deduce what we should drag.
    let target = taskItem.closest('.task-wrapper');
    if (!target) {
        // Maybe it's a subtask in a sub list?
        target = taskItem;
    } else {
        // It is a wrapper, but are we touching a subtask inside it?
        const subtaskItem = e.target.closest('.subtask-container .task-item');
        if (subtaskItem) {
            target = subtaskItem;
        }
    }

    // Check if dragging is allowed
    if (!target) return;

    touchDragItem = target;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;

    // Long Press Timer (500ms)
    touchTimer = setTimeout(() => {
        startTouchDrag(touch);
    }, 500);
}

function handleTouchMove(e) {
    if (!touchDragItem) return;

    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartX);
    const dy = Math.abs(touch.clientY - touchStartY);

    // If moved significantly before timer fires, cancel timer (it's a scroll)
    if (touchTimer && (dx > 10 || dy > 10)) {
        clearTimeout(touchTimer);
        touchTimer = null;
        touchDragItem = null;
    }

    if (touchClone) {
        e.preventDefault(); // Prevent scrolling while dragging
        touchClone.style.transform = `translate(${touch.clientX - touchOffsetX}px, ${touch.clientY - touchOffsetY}px)`;

        // Synthesize DragOver
        // We need to find element under cursor
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        if (elementBelow) {
            // Emulate event for handleDragOver
            const mockEvent = {
                preventDefault: () => { },
                target: elementBelow,
                clientX: touch.clientX,
                clientY: touch.clientY,
                dataTransfer: { dropEffect: 'move' }
            };
            handleDragOver(mockEvent);
        }
    }
}

function handleTouchEnd(e) {
    if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
    }

    if (touchClone) {
        touchClone.remove();
        touchClone = null;
        touchDragItem.classList.remove('dragging');

        // Execute Drop
        const touch = e.changedTouches[0];
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);

        const mockEvent = {
            preventDefault: () => { },
            target: elementBelow || document.body,
            clientX: touch.clientX,
            clientY: touch.clientY
        };
        handleDrop(mockEvent);

        touchDragItem = null;
    }
    else {
        touchDragItem = null;
    }
}

function startTouchDrag(touch) {
    touchTimer = null;
    if (!touchDragItem) return;

    // Feedback
    if (navigator.vibrate) navigator.vibrate(50);

    // Set Dragging Class to real item (for logic)
    touchDragItem.classList.add('dragging');

    // Determine Type
    if (touchDragItem.classList.contains('task-wrapper')) {
        touchDragItem.dataset.dragType = 'parent';
    } else {
        touchDragItem.dataset.dragType = 'subtask';
    }

    // Create Clone
    const rect = touchDragItem.getBoundingClientRect();
    touchOffsetX = touch.clientX - rect.left;
    touchOffsetY = touch.clientY - rect.top;

    touchClone = touchDragItem.cloneNode(true);
    touchClone.style.position = 'fixed';
    touchClone.style.left = `${rect.left}px`;
    touchClone.style.top = `${rect.top}px`;
    touchClone.style.width = `${rect.width}px`;
    touchClone.style.zIndex = '9999';
    touchClone.style.opacity = '0.9';
    touchClone.style.boxShadow = '0 10px 20px rgba(0,0,0,0.3)';
    touchClone.style.pointerEvents = 'none'; // Click through to detect underlying elements

    document.body.appendChild(touchClone);
}

// ... (Existing Handle Drag Functions) ...

// [INSERT handleDragOver and handleDrop here - Keeping them as they were in the previous step]
// I will just return the full block including the new touch listeners hookup.

// Hook up listeners in createTaskElement or setupEventListeners? 
// Better in setupEventListeners for the container, but we need delegation.
// Or attach to taskListEl.

// Let's modify handleDragOver/Drop to be compatible if called manually (already compatible mostly).
// But we need to ensure they don't crash on mocked events.

const DRAG_THRESHOLD_Y = 10;

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault(); // Safety check
    const draggable = document.querySelector('.dragging');
    if (!draggable) return;

    const dragType = draggable.dataset.dragType;

    // Support touch target (elementFromPoint might return child)
    let target = e.target;

    const closestSubContainer = target.closest('.subtask-container');
    const closestTaskWrapper = target.closest('.task-wrapper');

    document.querySelectorAll('.drop-target-nest').forEach(el => el.classList.remove('drop-target-nest'));

    if (dragType === 'subtask' && closestSubContainer) {
        const afterElement = getDragAfterElement(closestSubContainer, e.clientY);
        if (afterElement == null) {
            closestSubContainer.appendChild(draggable);
        } else {
            closestSubContainer.insertBefore(draggable, afterElement);
        }
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        return;
    }

    const elements = [...taskListEl.querySelectorAll('.task-wrapper:not(.dragging)')];
    let nestingTarget = null;
    const mouseY = e.clientY;

    for (const wrapper of elements) {
        const rect = wrapper.getBoundingClientRect();
        const threshold = rect.height * 0.25;
        if (mouseY > rect.top + threshold && mouseY < rect.bottom - threshold) {
            nestingTarget = wrapper;
            break;
        }
    }

    if (nestingTarget) {
        if (nestingTarget.dataset.id === draggable.dataset.id) return;
        nestingTarget.classList.add('drop-target-nest');
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        return;
    }

    const afterElement = getDragAfterElement(taskListEl, e.clientY);

    if (afterElement == null) {
        taskListEl.appendChild(draggable);
    } else {
        taskListEl.insertBefore(draggable, afterElement);
    }
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    if (e.preventDefault) e.preventDefault();
    document.querySelectorAll('.drop-target-nest').forEach(el => el.classList.remove('drop-target-nest'));

    const draggable = document.querySelector('.dragging');
    if (!draggable) return;

    const draggedId = draggable.dataset.id || (draggable.querySelector('.task-item') ? draggable.querySelector('.task-item').dataset.id : null);
    if (!draggedId) return; // Safety

    const dragType = draggable.dataset.dragType;

    const task = tasks.find(t => t.id === draggedId);
    if (!task) return;

    let target = e.target;
    // Nesting
    const nestingTarget = target.closest('.task-wrapper.drop-target-nest') ||
        (target.classList.contains('drop-target-nest') ? target : null);

    if (nestingTarget) {
        const newParentId = nestingTarget.dataset.id;
        if (newParentId === draggedId) return;

        if (task.parentId !== newParentId) {
            task.parentId = newParentId;
            if (window.updateTaskInFirebase) {
                window.updateTaskInFirebase(draggedId, { parentId: newParentId });
            }
            applyFilters();
        }
        return;
    }

    // Position
    const parentOfDraggable = draggable.parentElement;
    const isNowInMainList = parentOfDraggable === taskListEl;
    const isNowInSubContainer = parentOfDraggable.classList.contains('subtask-container');

    if (dragType === 'subtask' && isNowInMainList) {
        if (task.parentId) {
            task.parentId = "";
            if (window.updateTaskInFirebase) {
                window.updateTaskInFirebase(draggedId, { parentId: "" });
            }
            saveTaskOrder();
            applyFilters();
            return;
        }
    }

    if (isNowInSubContainer) {
        const newWrapper = parentOfDraggable.closest('.task-wrapper');
        if (newWrapper) {
            const newParentId = newWrapper.dataset.id;
            if (task.parentId !== newParentId) {
                task.parentId = newParentId;
                if (window.updateTaskInFirebase) {
                    window.updateTaskInFirebase(draggedId, { parentId: newParentId });
                }
            }
        }
    }
    saveTaskOrder();
}

// Logic unchanged for simple sort determination
function getDragAfterElement(container, y) {
    // Only consider Wrappers and Top-Level Items for main list sorting 
    // or we need to respect the list we are in.
    // But since we are dragging in main list...
    // The querySelectorAll includes :scope > .task-wrapper:not(.dragging)
    // Nesting logic handled in dragOver loop.

    // We need to exclude the currently interacting "nest target" if we want to be clean, 
    // but the nesting visual feedback is separate.

    // Robust selector: Direct children that are draggable-candidates (wrappers or items)
    // We ignore :scope to ensure compatibility
    const draggableElements = [...container.children].filter(child => {
        return (child.classList.contains('task-wrapper') || child.classList.contains('task-item')) && !child.classList.contains('dragging');
    });

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
        header.style.fontWeight = 'bold';
        header.style.textAlign = 'center';
        header.style.padding = '10px 0';
        header.style.color = 'var(--text-secondary)';
        calendarGridEl.appendChild(header);
    });

    for (let i = 0; i < startingDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        calendarGridEl.appendChild(empty);
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        const currentDayDate = new Date(year, month, i);
        const currentDayDateStr = currentDayDate.toISOString().split('T')[0];
        if (currentDayDateStr === new Date().toISOString().split('T')[0]) { dayEl.classList.add('today'); }
        dayEl.innerHTML = `<div class="day-number">${i}</div>`;
        dayEl.addEventListener('click', () => { openDayDetails(currentDayDateStr); });

        // Aggregation for Priority Bar & Count
        const dayTasks = tasks.filter(t => isTaskOnDate(t, currentDayDate));

        if (dayTasks.length > 0) {
            let high = 0, medium = 0, low = 0;
            dayTasks.forEach(t => {
                if (t.priority === 'high') high++;
                else if (t.priority === 'medium') medium++;
                else low++;
            });
            const total = dayTasks.length;

            // Calculate Risk Score (0 to 1) for Color Interpolation
            // High contributes 1.0, Medium 0.5, Low 0.0
            const riskPoints = (high * 1.0) + (medium * 0.5);
            const riskScore = total > 0 ? (riskPoints / total) : 0;

            // Map Score 0->1 to Hue 120(Green)->0(Red)
            const hue = Math.max(0, Math.min(120, 120 * (1 - riskScore)));

            // Wrapper for Count & Categories
            const wrapper = document.createElement('div');
            wrapper.className = 'day-content-wrapper';

            // Task Count Element
            const countEl = document.createElement('div');
            countEl.className = 'day-task-count';
            countEl.textContent = total;
            countEl.style.color = `hsl(${hue}, 85%, 45%)`;

            wrapper.appendChild(countEl);

            // Categories
            const categories = new Set();
            dayTasks.forEach(t => {
                if (t.category) {
                    t.category.split(',').forEach(c => categories.add(c.trim()));
                }
            });

            if (categories.size > 0) {
                const catContainer = document.createElement('div');
                catContainer.className = 'day-categories';

                const catArray = Array.from(categories);
                const displayLimit = 5;
                const visibleCats = catArray.slice(0, displayLimit);
                const remainingCount = catArray.length - displayLimit;

                visibleCats.forEach(cat => {
                    const tag = document.createElement('span');
                    tag.className = 'calendar-category-tag';
                    tag.textContent = cat;
                    catContainer.appendChild(tag);
                });

                if (remainingCount > 0) {
                    const moreTag = document.createElement('span');
                    moreTag.className = 'calendar-category-tag';
                    moreTag.style.opacity = '0.7';
                    moreTag.textContent = `y ${remainingCount} más`;
                    catContainer.appendChild(moreTag);
                }

                wrapper.appendChild(catContainer);
            }

            dayEl.appendChild(wrapper);
        }
        calendarGridEl.appendChild(dayEl);
    }
}

function changeMonth(delta) {
    if (currentView === 'timeline') {
        // Timeline: Navigate by Day
        currentDate.setDate(currentDate.getDate() + delta);
        applyFilters();
    } else {
        currentDate.setMonth(currentDate.getMonth() + delta);
        if (currentView === 'calendar') renderCalendar();
        else {
            // Switch to Month view likely if navigating months?
            // Or if in list view and range is 'today', does nav change TODAY? No.
            // It should probably just render based on 'month' logic if the user navigates.
            activeFilters.dateRange = 'month'; // Snap to month view logic
            applyFilters();
        }
    }
}

function renderListView(rangeType = 'month', startDate = null, endDate = null) {
    listViewEl.innerHTML = '';

    // Determine loop range
    let loopStart, loopEnd;

    if (rangeType === 'month' && !startDate) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        currentMonthYearEl.textContent = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentDate);
        loopStart = new Date(year, month, 1);
        loopEnd = new Date(year, month + 1, 0);
    } else if (startDate && endDate) {
        loopStart = startDate;
        loopEnd = endDate;

        const systemToday = new Date();
        const isSystemToday = loopStart.toDateString() === systemToday.toDateString();

        // Only show "Hoy" if it is actually today
        if (rangeType === 'today' && isSystemToday) currentMonthYearEl.textContent = "Hoy";
        else currentMonthYearEl.textContent = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', day: 'numeric' }).format(loopStart);
    } else {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        currentMonthYearEl.textContent = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentDate);
        loopStart = new Date(year, month, 1);
        loopEnd = new Date(year, month + 1, 0);
    }

    const sortedDates = [];
    let d = new Date(loopStart);
    while (d <= loopEnd) { sortedDates.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }

    sortedDates.forEach(dateStr => {
        const dateObj = new Date(dateStr + 'T00:00:00');
        const tasksOnDay = tasks.filter(t => {
            if (t.isTimelineComment || t.category === 'comment') return false; // Exclude comments
            const isFolder = !!t.isFolder;

            // Check Tag Filter for everything
            if (activeFilters.tags.size > 0) {
                if (!t.category) return false;
                const taskTags = t.category.split(',').map(tag => tag.trim());
                if (![...activeFilters.tags].some(tag => taskTags.includes(tag))) return false;
            }

            if (isFolder) return true; // Show folders on ALL days

            // Standard Task Date Check
            if (!isTaskOnDate(t, dateObj)) return false;

            // Status Check (Folders have no status, ignored above)
            if (activeFilters.status === 'completed' && t.status !== 'completed') return false;

            return true;
        });

        const groupsToRender = [];
        const processedParents = new Set();
        const visibleParents = tasksOnDay.filter(t => !t.parentId);

        visibleParents.forEach(p => {
            const subs = tasks.filter(t => t.parentId === p.id);
            groupsToRender.push({ type: 'wrapper', parent: p, children: subs });
            processedParents.add(p.id);
        });

        const visibleSubtasks = tasksOnDay.filter(t => t.parentId);
        visibleSubtasks.forEach(sub => {
            if (!processedParents.has(sub.parentId)) {
                const parent = tasks.find(t => t.id === sub.parentId);
                if (parent) { groupsToRender.push({ type: 'orphan-context', parent: parent, subtask: sub }); }
            }
        });

        const group = document.createElement('div');
        group.className = 'list-date-group';

        const header = document.createElement('div');
        header.className = 'list-date-header';
        header.style.cursor = 'pointer'; header.style.userSelect = 'none'; header.style.display = 'flex'; header.style.alignItems = 'center';

        const todayStr = new Date().toISOString().split('T')[0];
        let dateLabel = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        if (dateStr === todayStr) dateLabel = "Hoy - " + dateLabel;

        const chevron = document.createElement('i');
        chevron.className = 'fa-solid fa-chevron-down';
        chevron.style.marginRight = '10px';
        chevron.style.transition = 'transform 0.2s';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = dateLabel;
        const countBadge = document.createElement('span');
        countBadge.style.marginLeft = 'auto'; countBadge.style.fontSize = '0.8rem'; countBadge.style.color = 'var(--text-secondary)';
        countBadge.textContent = groupsToRender.length > 0 ? `${tasksOnDay.length} tareas` : '';

        header.appendChild(chevron); header.appendChild(labelSpan); header.appendChild(countBadge);
        group.appendChild(header);

        const content = document.createElement('div');
        content.className = 'list-date-content';

        header.onclick = () => {
            if (content.style.display === 'none') {
                content.style.display = 'block'; chevron.style.transform = 'rotate(0deg)'; group.dataset.collapsed = 'false';
            } else {
                content.style.display = 'none'; chevron.style.transform = 'rotate(-90deg)'; group.dataset.collapsed = 'true';
            }
        };

        if (groupsToRender.length === 0) {
            content.innerHTML = '<div style="padding:10px; color:var(--glass-border); font-style:italic; font-size:0.9rem;">Sin tareas</div>';
            content.style.display = 'none'; chevron.style.transform = 'rotate(-90deg)';
        } else {
            groupsToRender.forEach(g => {
                if (g.type === 'wrapper') {
                    const parent = g.parent;
                    const subtasksAll = g.children;
                    const hasSubtasks = subtasksAll.length > 0;
                    const wrapper = document.createElement('div');
                    wrapper.className = 'task-wrapper';

                    const taskEl = createTaskElement(parent, hasSubtasks);
                    wrapper.appendChild(taskEl);

                    if (hasSubtasks) {
                        const subContainer = document.createElement('div');
                        subContainer.className = 'subtask-container';
                        if (!expandedTasks.has(parent.id)) { subContainer.classList.add('hidden'); const btn = taskEl.querySelector('.btn-toggle-subtasks'); if (btn) btn.classList.add('rotate'); }
                        subtasksAll.forEach(sub => { subContainer.appendChild(createTaskElement(sub, false, true)); });
                        wrapper.appendChild(subContainer);
                    }
                    content.appendChild(wrapper);

                } else if (g.type === 'orphan-context') {
                    const parent = g.parent; const sub = g.subtask;
                    const container = document.createElement('div'); container.style.marginBottom = '10px';
                    const parentLabel = document.createElement('div'); parentLabel.className = 'parent-indicator';
                    parentLabel.innerHTML = `<i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right:5px;"></i> Subtarea de: <strong>${parent.title}</strong>`;
                    container.appendChild(parentLabel);
                    const subEl = createTaskElement(sub, false, true); subEl.classList.add('orphan-subtask');
                    const fakeContainer = document.createElement('div'); fakeContainer.className = 'subtask-container'; fakeContainer.style.marginLeft = '0'; fakeContainer.style.paddingLeft = '0'; fakeContainer.style.borderLeft = 'none';
                    fakeContainer.appendChild(subEl);
                    container.appendChild(fakeContainer);
                    content.appendChild(container);
                }
            });
        }

        group.appendChild(content);
        listViewEl.appendChild(group);
    });
}

function renderTimeline(rangeType = 'today', startDate = null, endDate = null) {
    const timelineViewEl = document.getElementById('timeline-view');
    timelineViewEl.innerHTML = '';

    // Date Range Setup
    let loopStart, loopEnd;

    // FORCE SINGLE DAY VIEW FOR TIMELINE based on currentDate
    // regardless of what filter range is passed. User wants strict day view.
    loopStart = new Date(currentDate);
    loopEnd = new Date(currentDate);

    // Update Header to reflect the specific day being viewed
    // "Sábado 13 de Diciembre" format
    const headerDateStr = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(loopStart);

    // Capitalize first letter
    const capitalizedHeader = headerDateStr.charAt(0).toUpperCase() + headerDateStr.slice(1);
    currentMonthYearEl.textContent = capitalizedHeader;

    const sortedDates = [];
    let d = new Date(loopStart);
    while (d <= loopEnd) { sortedDates.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }

    let hasActivity = false;

    sortedDates.forEach(dateStr => {
        const dateObj = new Date(dateStr + 'T00:00:00');

        // Gather Sessions for this day
        const dayEvents = [];

        tasks.forEach(task => {
            if (task.sessions && Array.isArray(task.sessions)) {
                task.sessions.forEach((session, index) => { // Capture index
                    if (!session.start) return;
                    const start = new Date(session.start);
                    // Local Date Check
                    const sY = start.getFullYear();
                    const sM = start.getMonth();
                    const sD = start.getDate();

                    if (sY === dateObj.getFullYear() && sM === dateObj.getMonth() && sD === dateObj.getDate()) {
                        dayEvents.push({
                            type: (task.isTimelineComment || task.category === 'comment') ? 'comment' : 'session',
                            start: start,
                            end: session.end ? new Date(session.end) : null,
                            task: task,
                            originalIndex: index // Store index
                        });
                    }
                });
            } else if (task.isTimelineComment && task.date === dateStr) {
                // Handle Timeline Comments
                const startStr = (task.sessions && task.sessions[0]) ? task.sessions[0].start : task.date + 'T12:00:00';
                dayEvents.push({
                    type: 'comment',
                    start: new Date(startStr),
                    end: null,
                    task: task
                });
            }
        });

        // Even if empty, if it's "today" or specific range, maybe show header? 
        // For now, keep existing logic but allow header if we want to add comments to empty days?
        // Converting to "always show header" so user can add comments
        // Force header show if range is specific to allow adding comments?
        // Let's stick to existing logic: if 0 events, return. But wait, if 0 events, user CANNOT add comment.
        // User needs to be able to add comment even if empty.
        // Let's remove "if (dayEvents.length === 0) return;" and instead handle empty container

        hasActivity = true; // Always true to show dates? Or Check range.
        // If we want to allow adding comments to any day in range, we must show the header.

        // Sort chronological
        dayEvents.sort((a, b) => a.start - b.start);

        const group = document.createElement('div');
        group.className = 'list-date-group';

        const header = document.createElement('div');
        header.className = 'list-date-header';
        header.style.display = 'flex'; header.style.justifyContent = 'space-between'; header.style.alignItems = 'center';

        const todayStr = new Date().toISOString().split('T')[0];
        let dateLabel = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        if (dateStr === todayStr) dateLabel = "Hoy - " + dateLabel;

        header.innerHTML = `<span>${dateLabel}</span> 
            <button class="btn-icon-sm" onclick="openCommentModal('${dateStr}')" title="Agregar Comentario"><i class="fa-solid fa-comment-dots"></i></button>`;
        group.appendChild(header);

        const container = document.createElement('div');
        container.className = 'timeline-container';

        if (dayEvents.length === 0) {
            container.innerHTML = '<div style="opacity:0.5; font-size:0.8rem; padding:10px;">Sin actividad.</div>';
        }

        dayEvents.forEach(event => {
            const item = document.createElement('div');
            item.className = 'timeline-event';
            if (event.type === 'comment') item.classList.add('timeline-comment');

            // Time
            const timeCol = document.createElement('div');
            timeCol.className = 'timeline-time-col';
            const startStr = event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let timeHtml = `<div>${startStr}</div>`;
            if (event.type === 'session') {
                if (event.end) {
                    const endStr = event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    timeHtml += `<div class="time-end-wrapper"><div class="time-end-dot"></div> <span>${endStr}</span></div>`;
                } else {
                    timeHtml += `<div class="time-end-wrapper" style="opacity:0.5"><div class="time-end-dot" style="background:var(--text-secondary)"></div> <span>...</span></div>`;
                }
            }
            timeCol.innerHTML = timeHtml;

            // Visuals
            const dotCol = document.createElement('div');
            dotCol.className = 'timeline-dot-col';
            const dot = document.createElement('div');
            dot.className = 'timeline-dot';

            if (event.type === 'comment') {
                // Comment Styles: Standard gray dot as requested
                dot.style.borderColor = 'var(--text-secondary)';
                dot.style.background = 'transparent';
                dot.innerHTML = '';
            } else {
                if (event.task.color) dot.style.borderColor = event.task.color;
                else {
                    const pColor = event.task.priority === 'high' ? 'var(--danger-color)' : (event.task.priority === 'medium' ? 'var(--warning-color)' : 'var(--success-color)');
                    dot.style.borderColor = pColor;
                }
            }
            dotCol.appendChild(dot);

            // Content
            const contentCol = document.createElement('div');
            contentCol.className = 'timeline-content-col';

            if (event.type === 'comment') {
                const typeLabels = { interruption: 'Interrupción', annotation: 'Anotación', comment: 'Comentario', other: 'Otro' };

                const metaHeader = document.createElement('div');
                metaHeader.style.display = 'flex'; metaHeader.style.justifyContent = 'space-between'; metaHeader.style.alignItems = 'flex-start';

                const title = document.createElement('div');
                title.className = 'timeline-event-title';
                title.textContent = event.task.title;

                const controls = document.createElement('div');
                controls.className = 'timeline-controls';
                controls.innerHTML = `
                    <button class="timeline-btn" onclick="openCommentEditModal('${event.task.id}')" title="Editar">${ICONS.edit}</button>
                    <button class="timeline-btn delete" onclick="deleteSession('${event.task.id}', 0)" title="Eliminar">${ICONS.delete}</button>
                `;

                metaHeader.appendChild(title);
                metaHeader.appendChild(controls);
                contentCol.appendChild(metaHeader);

                const meta = document.createElement('div');
                meta.className = 'timeline-event-meta';
                meta.style.fontSize = '0.75rem'; meta.style.opacity = '0.7'; meta.style.marginTop = '2px';
                meta.textContent = typeLabels[event.task.commentType] || 'Comentario';
                contentCol.appendChild(meta);
            } else {
                // Session Content
                const metaHeader = document.createElement('div');
                metaHeader.style.display = 'flex'; metaHeader.style.justifyContent = 'space-between'; metaHeader.style.alignItems = 'flex-start';

                const title = document.createElement('div');
                title.className = 'timeline-event-title';
                title.textContent = event.task.title;

                const controls = document.createElement('div');
                controls.className = 'timeline-controls';
                controls.innerHTML = `
                    <button class="timeline-btn" onclick="openSessionEditModal('${event.task.id}', ${event.originalIndex})" title="Editar hora">${ICONS.edit}</button>
                    <button class="timeline-btn delete" onclick="deleteSession('${event.task.id}', ${event.originalIndex})" title="Eliminar">${ICONS.delete}</button>
                `;

                metaHeader.appendChild(title);
                metaHeader.appendChild(controls);
                contentCol.appendChild(metaHeader);

                const meta = document.createElement('div');
                meta.className = 'timeline-event-meta';

                if (event.end) {
                    const diffMs = event.end - event.start;
                    const diffMins = Math.max(1, Math.round(diffMs / 60000));
                    meta.textContent = `Duración: ${diffMins} min`;
                } else {
                    meta.textContent = 'En curso...';
                    meta.style.color = 'var(--accent-color)';
                    meta.style.fontWeight = '600';
                }
                contentCol.appendChild(meta);
            }

            item.appendChild(timeCol);
            item.appendChild(dotCol);
            item.appendChild(contentCol);

            container.appendChild(item);
        });

        group.appendChild(container);
        timelineViewEl.appendChild(group);
    });

    if (!hasActivity) {
        timelineViewEl.innerHTML = '<div class="empty-state" style="text-align:center; padding:40px; color:var(--text-secondary);">No hay actividad registrada en este periodo</div>';
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    document.getElementById('main-timer').textContent = timeStr;
    const miniTimerTime = document.getElementById('mini-timer-time');
    if (miniTimerTime) miniTimerTime.textContent = timeStr;
    const miniTimerDesk = document.getElementById('mini-timer');
    if (miniTimerDesk) miniTimerDesk.textContent = timeStr;
    const miniBtn = document.getElementById('mini-timer-toggle');
    if (miniBtn) { miniBtn.innerHTML = timerInterval ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>'; }
    checkMiniTimerVisibility();
    document.title = `${timeStr} - Planner Pro`;
    const circle = document.querySelector('.progress-ring__circle');
    const totalTime = pomodoroState.isBreak ? pomodoroState.breakTime * 60 : pomodoroState.workTime * 60;
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (timeLeft / totalTime) * circumference;
    circle.style.strokeDashoffset = offset;
    const cycleDisplay = document.getElementById('cycle-display');
    if (cycleDisplay && pomodoroState) { cycleDisplay.textContent = `Ciclo ${pomodoroState.cycle}/${pomodoroState.totalCycles} (${pomodoroState.isBreak ? 'Descanso' : 'Trabajo'})`; }
}

function toggleTimer() {
    if (Notification.permission === 'default') Notification.requestPermission();
    if (isTimerRunning) { clearInterval(timerInterval); isTimerRunning = false; document.getElementById('pomodoro-start').innerHTML = ICONS.play; document.getElementById('mini-play-btn').innerHTML = ICONS.play; }
    else { isTimerRunning = true; document.getElementById('pomodoro-start').innerHTML = '<i class="fa-solid fa-pause"></i>'; document.getElementById('mini-play-btn').innerHTML = '<i class="fa-solid fa-pause"></i>'; timerInterval = setInterval(() => { if (timeLeft > 0) { timeLeft--; updateTimerDisplay(); } else completeCycle(); }, 1000); }
}

function resetTimer() { clearInterval(timerInterval); isTimerRunning = false; timeLeft = (pomodoroState.isBreak ? pomodoroState.breakTime : pomodoroState.workTime) * 60; updateTimerDisplay(); document.getElementById('pomodoro-start').innerHTML = ICONS.play; document.getElementById('mini-play-btn').innerHTML = ICONS.play; }

function adjustTimer(minutes) { timeLeft += minutes * 60; if (timeLeft < 0) timeLeft = 0; updateTimerDisplay(); }

function startPomodoroForTask(id) {
    activeTaskId = id;
    const task = tasks.find(t => t.id === id);

    // Session Logging (Timeline)
    if (!task.sessions) task.sessions = [];

    // Prevent duplicates: Only start new session if last one is closed
    const lastSession = task.sessions.length > 0 ? task.sessions[task.sessions.length - 1] : null;
    if (!lastSession || lastSession.end) {
        task.sessions.push({ start: new Date().toISOString(), end: null });
        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(id, { sessions: task.sessions });
        }
    }

    document.getElementById('active-task-name').textContent = task.title;
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
    let totalPhases = pomodoroState.totalCycles * 2;
    let currentPhaseIndex = (pomodoroState.cycle - 1) * 2 + (pomodoroState.isBreak ? 1 : 0);
    let nextPhaseIndex = currentPhaseIndex + direction;
    if (nextPhaseIndex < 0) { nextPhaseIndex = 0; } else if (nextPhaseIndex >= totalPhases) { return; }
    const wasRunning = isTimerRunning;
    if (isTimerRunning) { clearInterval(timerInterval); isTimerRunning = false; document.getElementById('pomodoro-start').innerHTML = ICONS.play; document.getElementById('mini-play-btn').innerHTML = ICONS.play; }
    pomodoroState.cycle = Math.floor(nextPhaseIndex / 2) + 1;
    pomodoroState.isBreak = (nextPhaseIndex % 2) === 1;
    timeLeft = (pomodoroState.isBreak ? pomodoroState.breakTime : pomodoroState.workTime) * 60;
    updateTimerDisplay();
}

function completeCycle() {
    clearInterval(timerInterval); isTimerRunning = false;
    timerSound.play().catch(e => console.log('Audio play failed', e));
    if (pomodoroState.isBreak) {
        pomodoroState.isBreak = false; pomodoroState.cycle++;
        if (pomodoroState.cycle > pomodoroState.totalCycles) {
            // alert('¡Todos los ciclos completados!'); -- Replaced by logic below
            if (activeTaskId && window.updateTaskInFirebase) { const task = tasks.find(t => t.id === activeTaskId); if (task) window.updateTaskInFirebase(task.id, { pomodoros: (task.pomodoros || 0) + pomodoroState.totalCycles }); }
            resetTimer();
            notifyCompletion("¡Todos los ciclos completados!");
            return;
        } else {
            timeLeft = pomodoroState.workTime * 60;
            // alert(`Ciclo ${pomodoroState.cycle} de ${pomodoroState.totalCycles}: ¡A trabajar!`);
            notifyCompletion(`¡A trabajar! Ciclo ${pomodoroState.cycle}/${pomodoroState.totalCycles}`);
        }
    } else {
        pomodoroState.isBreak = true;
        timeLeft = pomodoroState.breakTime * 60;
        // alert('¡Hora de un descanso!');
        notifyCompletion("¡Hora de un descanso!");
    }
    updateTimerDisplay();
}

// --- NOTIFICATIONS & PIP ---
let titleFlashInterval = null;
let originalTitle = document.title;

function notifyCompletion(message) {
    // 1. Browser Notification
    if (Notification.permission === 'granted') {
        new Notification('Pomodoro Planner', { body: message, icon: 'favicon.ico' });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    // 2. Sound
    timerSound.play().catch(e => console.log('Audio play failed', e));

    // 3. Background Check for Flashing & Persistent Sound
    if (document.hidden) {
        startTitleFlash(message);
    } else {
        alert(message); // Maintain alert if foreground? Or just toast? User used alert before.
    }
}

function startTitleFlash(message) {
    if (titleFlashInterval) clearInterval(titleFlashInterval);
    let flash = false;
    titleFlashInterval = setInterval(() => {
        document.title = flash ? message : "¡TIEMPO!";
        flash = !flash;
    }, 1000);
}

function stopTitleFlash() {
    if (titleFlashInterval) {
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
        document.title = originalTitle;
    }
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        stopTitleFlash();
    }
});

// --- PiP Implementation ---
let pipVideo = document.createElement('video');
let pipCanvas = document.createElement('canvas');
let pipCtx = pipCanvas.getContext('2d');
let pipStream = null;
let isPipActive = false;

// Initialize PiP elements
pipCanvas.width = 300;
pipCanvas.height = 300;
pipVideo.muted = true; // Required for auto-play
pipVideo.style.position = 'fixed';
pipVideo.style.opacity = '0';
pipVideo.style.pointerEvents = 'none';
pipVideo.style.height = '0';
pipVideo.style.width = '0';
document.body.appendChild(pipVideo); // Required for Firefox

function togglePiP() {
    if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
    } else {
        enterPiP();
    }
}

async function enterPiP() {
    try {
        drawPiP(); // Ensure canvas has content before streaming
        if (!pipStream) {
            pipStream = pipCanvas.captureStream(30); // 30 FPS
            pipVideo.srcObject = pipStream;
        }

        // Wait for metadata to load if not ready
        if (pipVideo.readyState === 0) {
            await new Promise(resolve => {
                pipVideo.onloadedmetadata = () => {
                    resolve();
                };
            });
        }

        await pipVideo.play();

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
    alert("Tu navegador (Firefox) requiere activación manual. Usa el botón 'Picture-in-Picture' que aparecerá sobre el video abajo.");

    // Move video to visible area in panel
    const container = document.querySelector('.pomodoro-panel');
    if (container) {
        // Reset styles for visibility
        pipVideo.style.position = 'static';
        pipVideo.style.opacity = '1';
        pipVideo.style.pointerEvents = 'all';
        pipVideo.style.height = '150px'; // Reasonable preview size
        pipVideo.style.width = '100%';
        pipVideo.style.marginTop = '10px';
        pipVideo.style.border = '1px solid var(--glass-border)';
        pipVideo.style.borderRadius = '8px';
        pipVideo.controls = true; // Helps show native controls

        // Insert after timer controls
        const controls = container.querySelector('.timer-controls');
        if (controls) {
            controls.parentNode.insertBefore(pipVideo, controls.nextSibling);
        } else {
            container.appendChild(pipVideo);
        }

        // Add Hide Button if not exists
        let hideBtn = document.getElementById('manual-pip-hide');
        if (!hideBtn) {
            hideBtn = document.createElement('button');
            hideBtn.id = 'manual-pip-hide';
            hideBtn.className = 'btn-secondary';
            hideBtn.style.width = '100%';
            hideBtn.style.marginTop = '5px';
            hideBtn.style.fontSize = '0.8rem';
            hideBtn.innerText = 'Ocultar Vista Previa';
            hideBtn.onclick = () => {
                // Hide video
                pipVideo.style.position = 'fixed';
                pipVideo.style.opacity = '0';
                pipVideo.style.pointerEvents = 'none';
                pipVideo.style.height = '0';
                pipVideo.style.width = '0';
                pipVideo.style.border = 'none';
                pipVideo.style.marginTop = '0';
                pipVideo.controls = false;
                // Remove button
                hideBtn.remove();
            };
            pipVideo.parentNode.insertBefore(hideBtn, pipVideo.nextSibling);
        }

        isPipActive = true; // Enable drawing so video has content
        drawPiP();
    }
}

pipVideo.addEventListener('leavepictureinpicture', () => {
    isPipActive = false;
    // Hide video again if it was in manual mode? 
    // Maybe keep it if user wants to toggle back. 
    // For now, let's leave it visible if manual mode was triggered.
});

function drawPiP() {

    // Background
    pipCtx.fillStyle = '#18181b'; // Dark BG
    pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);

    // Text - Time
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    pipCtx.fillStyle = '#f4f4f5';
    pipCtx.font = 'bold 80px sans-serif';
    pipCtx.textAlign = 'center';
    pipCtx.textBaseline = 'middle';
    pipCtx.fillText(timeStr, 150, 120);

    // Text - Phase
    pipCtx.font = '30px sans-serif';
    pipCtx.fillStyle = pomodoroState.isBreak ? '#22c55e' : '#a1a1aa'; // Green for break, gray for work
    const phaseText = pomodoroState.isBreak ? "Descanso" : "Trabajo";
    pipCtx.fillText(phaseText, 150, 200);

    // Cycle
    pipCtx.font = '20px sans-serif';
    pipCtx.fillStyle = '#71717a';
    pipCtx.fillText(`Ciclo ${pomodoroState.cycle}/${pomodoroState.totalCycles}`, 150, 240);
}

// Hook into updateTimerDisplay to update PiP
const originalUpdateTimer = updateTimerDisplay;
updateTimerDisplay = function () {
    originalUpdateTimer();
    if (isPipActive) drawPiP();
};

// Bind PiP Button
document.addEventListener('DOMContentLoaded', () => {
    const pipBtn = document.getElementById('pip-pomodoro');
    if (pipBtn) pipBtn.addEventListener('click', togglePiP);
});

// --- TIMELINE EDITING ---
// --- TIMELINE EDITING ---
function deleteSession(taskId, sessionIndex) {
    if (!confirm('¿Eliminar esta sesión de la línea de tiempo?')) return;
    const task = tasks.find(t => t.id == taskId);

    // IF COMMENT -> Delete Task entirely
    if (task && (task.isTimelineComment || task.category === 'comment')) {
        if (window.deleteTaskFromFirebase) {
            window.deleteTaskFromFirebase(task.id);
            // Remove locally for immediate feedback
            const idx = tasks.findIndex(t => t.id == taskId);
            if (idx > -1) tasks.splice(idx, 1);
        }
        applyFilters();
        return;
    }

    if (task && task.sessions) {
        task.sessions.splice(sessionIndex, 1);
        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(task.id, { sessions: task.sessions });
        }
        applyFilters();
    }
}

function openSessionEditModal(taskId, sessionIndex) {
    const task = tasks.find(t => t.id == taskId);
    if (!task || !task.sessions[sessionIndex]) return;

    const session = task.sessions[sessionIndex];
    document.getElementById('edit-session-task-id').value = task.id;
    document.getElementById('edit-session-index').value = sessionIndex;

    // Format for datetime-local: YYYY-MM-DDTHH:mm handling timezone offset
    const toLocalISO = (isoStr) => {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const offset = d.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(d - offset)).toISOString().slice(0, 16);
        return localISOTime;
    };

    document.getElementById('edit-session-start').value = toLocalISO(session.start);
    document.getElementById('edit-session-end').value = session.end ? toLocalISO(session.end) : '';

    document.getElementById('session-edit-modal').classList.add('active');
}

function closeSessionEditModal() {
    document.getElementById('session-edit-modal').classList.remove('active');
}

function saveSessionEdit() {
    const taskId = document.getElementById('edit-session-task-id').value;
    const idx = parseInt(document.getElementById('edit-session-index').value);
    const startVal = document.getElementById('edit-session-start').value;
    const endVal = document.getElementById('edit-session-end').value;

    const task = tasks.find(t => t.id == taskId);
    if (task && task.sessions && task.sessions[idx]) {
        if (startVal) task.sessions[idx].start = new Date(startVal).toISOString();
        if (endVal) task.sessions[idx].end = new Date(endVal).toISOString();
        else task.sessions[idx].end = null;

        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(task.id, { sessions: task.sessions });
        }
        closeSessionEditModal();
        applyFilters();
    }
}

// --- TIMELINE COMMENTS ---
function openCommentModal(dateStr) {
    document.getElementById('comment-date-ref').value = dateStr;
    document.getElementById('comment-edit-id').value = ''; // Ensure new

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    let defaultTime;
    if (dateStr === todayStr) {
        const offset = now.getTimezoneOffset() * 60000;
        defaultTime = (new Date(now - offset)).toISOString().slice(0, 16);
    } else {
        defaultTime = dateStr + 'T09:00';
    }

    document.getElementById('comment-time').value = defaultTime;
    document.getElementById('comment-text').value = '';
    document.getElementById('comment-modal').classList.add('active');

    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.type-btn[data-type="comment"]').classList.add('active');
    document.getElementById('comment-type').value = 'comment';
}

function openCommentEditModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('comment-edit-id').value = task.id;
    document.getElementById('comment-text').value = task.title;
    document.getElementById('comment-type').value = task.commentType || 'comment';

    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    let type = task.commentType || 'comment';
    const btn = document.querySelector(`.type-btn[data-type="${type}"]`);
    if (btn) btn.classList.add('active');

    let timeVal = '';
    if (task.sessions && task.sessions.length > 0) {
        const d = new Date(task.sessions[0].start);
        const offset = d.getTimezoneOffset() * 60000;
        timeVal = (new Date(d - offset)).toISOString().slice(0, 16);
    }
    document.getElementById('comment-time').value = timeVal;
    document.getElementById('comment-modal').classList.add('active');
}

function closeCommentModal() {
    document.getElementById('comment-modal').classList.remove('active');
}

function selectCommentType(btn, type) {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('comment-type').value = type;
}

function saveComment() {
    const text = document.getElementById('comment-text').value;
    const type = document.getElementById('comment-type').value;
    const timeVal = document.getElementById('comment-time').value;
    const editId = document.getElementById('comment-edit-id').value;

    if (!text) return alert('Escribe un comentario');
    if (!timeVal) return alert('Selecciona una hora');

    const datePart = timeVal.split('T')[0];

    if (editId) {
        // UPDATE
        const updateData = {
            title: text,
            commentType: type,
            date: datePart,
            sessions: [{ start: new Date(timeVal).toISOString(), end: null }]
        };
        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(editId, updateData);
        }
    } else {
        // CREATE
        const newComment = {
            title: text,
            category: 'comment',
            commentType: type,
            isTimelineComment: true,
            date: datePart,
            status: 'completed',
            sessions: [{ start: new Date(timeVal).toISOString(), end: null }],
            createdAt: new Date().toISOString()
        };

        if (window.addTaskToFirebase) {
            window.addTaskToFirebase(newComment);
        }
    }
    closeCommentModal();
    // Refresh with full state
    setTimeout(() => applyFilters(), 500);
}

// Expose
window.deleteSession = deleteSession;
window.openSessionEditModal = openSessionEditModal;
window.closeSessionEditModal = closeSessionEditModal;
window.saveSessionEdit = saveSessionEdit;
window.openCommentModal = openCommentModal;
window.openCommentEditModal = openCommentEditModal;
window.closeCommentModal = closeCommentModal;
window.selectCommentType = selectCommentType;
window.saveComment = saveComment;

function openSessionEditModal(taskId, sessionIndex) {
    const task = tasks.find(t => t.id == taskId);
    if (!task || !task.sessions[sessionIndex]) return;

    const session = task.sessions[sessionIndex];
    document.getElementById('edit-session-task-id').value = task.id;
    document.getElementById('edit-session-index').value = sessionIndex;

    // Format for datetime-local: YYYY-MM-DDTHH:mm handling timezone offset
    const toLocalISO = (isoStr) => {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const offset = d.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(d - offset)).toISOString().slice(0, 16);
        return localISOTime;
    };

    document.getElementById('edit-session-start').value = toLocalISO(session.start);
    document.getElementById('edit-session-end').value = session.end ? toLocalISO(session.end) : '';

    document.getElementById('session-edit-modal').classList.add('active');
}

function closeSessionEditModal() {
    document.getElementById('session-edit-modal').classList.remove('active');
}

function saveSessionEdit() {
    const taskId = document.getElementById('edit-session-task-id').value;
    const idx = parseInt(document.getElementById('edit-session-index').value);
    const startVal = document.getElementById('edit-session-start').value;
    const endVal = document.getElementById('edit-session-end').value;

    const task = tasks.find(t => t.id == taskId);
    if (task && task.sessions && task.sessions[idx]) {
        if (startVal) task.sessions[idx].start = new Date(startVal).toISOString();
        if (endVal) task.sessions[idx].end = new Date(endVal).toISOString();
        else task.sessions[idx].end = null;

        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(task.id, { sessions: task.sessions });
        }
        closeSessionEditModal();
        if (currentView === 'timeline') renderTimeline(activeFilters.dateRange);
    }
}

// --- TIMELINE COMMENTS ---
function openCommentModal(dateStr) {
    document.getElementById('comment-date-ref').value = dateStr;
    document.getElementById('comment-edit-id').value = ''; // Ensure new

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    let defaultTime;
    if (dateStr === todayStr) {
        const offset = now.getTimezoneOffset() * 60000;
        defaultTime = (new Date(now - offset)).toISOString().slice(0, 16);
    } else {
        defaultTime = dateStr + 'T09:00';
    }

    document.getElementById('comment-time').value = defaultTime;
    document.getElementById('comment-text').value = '';
    document.getElementById('comment-modal').classList.add('active');

    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.type-btn[data-type="comment"]').classList.add('active');
    document.getElementById('comment-type').value = 'comment';
}

function openCommentEditModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('comment-edit-id').value = task.id;
    document.getElementById('comment-text').value = task.title;
    document.getElementById('comment-type').value = task.commentType || 'comment';

    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    let type = task.commentType || 'comment';
    const btn = document.querySelector(`.type-btn[data-type="${type}"]`);
    if (btn) btn.classList.add('active');

    let timeVal = '';
    if (task.sessions && task.sessions.length > 0) {
        const d = new Date(task.sessions[0].start);
        const offset = d.getTimezoneOffset() * 60000;
        timeVal = (new Date(d - offset)).toISOString().slice(0, 16);
    }
    document.getElementById('comment-time').value = timeVal;
    document.getElementById('comment-modal').classList.add('active');
}

function closeCommentModal() {
    document.getElementById('comment-modal').classList.remove('active');
}

function selectCommentType(btn, type) {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('comment-type').value = type;
}

function saveComment() {
    const text = document.getElementById('comment-text').value;
    const type = document.getElementById('comment-type').value;
    const timeVal = document.getElementById('comment-time').value;
    const editId = document.getElementById('comment-edit-id').value;

    if (!text) return alert('Escribe un comentario');
    if (!timeVal) return alert('Selecciona una hora');

    const datePart = timeVal.split('T')[0];

    if (editId) {
        // UPDATE
        const updateData = {
            title: text,
            commentType: type,
            date: datePart,
            sessions: [{ start: new Date(timeVal).toISOString(), end: null }]
        };
        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(editId, updateData);
        }
    } else {
        // CREATE
        const newComment = {
            title: text,
            category: 'comment',
            commentType: type,
            isTimelineComment: true,
            date: datePart,
            status: 'completed',
            sessions: [{ start: new Date(timeVal).toISOString(), end: null }],
            createdAt: new Date().toISOString()
        };

        if (window.addTaskToFirebase) {
            window.addTaskToFirebase(newComment);
        }
    }
    closeCommentModal();
    // Force immediate update 
    if (currentView === 'timeline') setTimeout(() => renderTimeline(activeFilters.dateRange), 500);
}

// Expose
window.deleteSession = deleteSession;
window.openSessionEditModal = openSessionEditModal;
window.closeSessionEditModal = closeSessionEditModal;
window.saveSessionEdit = saveSessionEdit;
window.openCommentModal = openCommentModal;
window.openCommentEditModal = openCommentEditModal;
window.closeCommentModal = closeCommentModal;
window.selectCommentType = selectCommentType;
window.saveComment = saveComment;