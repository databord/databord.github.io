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
let activeFilters = { dateRange: 'today', tags: new Set(), status: 'all', folderId: null, mainTags: new Set(), customStart: null, customEnd: null }; // status: 'all' | 'completed'
let mainViewRange = 'month'; // 'month', 'week', 'today' (Independent of sidebar)

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

// --- HELPER FUNCTIONS ---
// esto esta ok - helper reutilizable para formatear tiempo
function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// esto esta ok - sincroniza todos los botones de play/pause
function updatePlayPauseButtons(isPlaying) {
    const icon = isPlaying ? '<i class="fa-solid fa-pause"></i>' : ICONS.play;
    document.getElementById('pomodoro-start').innerHTML = icon;
    document.getElementById('mini-play-btn').innerHTML = icon;
    const mobileToggle = document.getElementById('mini-timer-toggle');
    if (mobileToggle) mobileToggle.innerHTML = icon;
}

// esto esta ok - obtiene fecha de hoy sin hora
function getTodayDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// --- FILTERING LOGIC ---
// esto esta ok - centralizador de filtros para sidebar
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

    // 2. Determine Sidebar Date Range (Based on SYSTEM TIME, not Navigation)
    let start = null, end = null;
    const now = new Date(); // System Time
    const today = getTodayDate(); // esto esta ok - usa helper

    if (activeFilters.dateRange === 'today') {
        start = new Date(today); end = new Date(today);
    } else if (activeFilters.dateRange === 'yesterday') {
        start = new Date(today); start.setDate(today.getDate() - 1);
        end = new Date(start);
    } else if (activeFilters.dateRange === 'tomorrow') {
        start = new Date(today); start.setDate(today.getDate() + 1);
        end = new Date(start);
    } else if (activeFilters.dateRange === 'week') {
        // Current week (Sunday to Saturday) relative to SYSTEM TIME
        const day = today.getDay();
        start = new Date(today); start.setDate(today.getDate() - day);
        end = new Date(start); end.setDate(end.getDate() + 6);
    } else if (activeFilters.dateRange === 'month') {
        // "Este Mes" (System Month)
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (activeFilters.dateRange === 'last-month') {
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (activeFilters.dateRange === 'custom') {
        if (activeFilters.customStart) start = new Date(activeFilters.customStart + 'T00:00:00');
        if (activeFilters.customEnd) end = new Date(activeFilters.customEnd + 'T00:00:00');
    }
    // 'all' leaves start/end as null

    // 3. Filter Tasks (Sidebar Only)
    const filteredTasks = tasks.filter(task => {
        // Exclude Timeline Comments from Main List
        if (task.isTimelineComment || task.category === 'comment' || task.category === '|||comment|||') return false;
        if (task.isTimelineNote || task.category === 'note' || task.category === '|||note|||') return false;

        // Tag Filter (AND logic)
        if (activeFilters.tags.size > 0) {
            if (!task.category) return false;
            const taskTags = task.category.split(',').map(t => t.trim());
            // AND: Task must contain ALL tags in activeFilters.tags
            if (![...activeFilters.tags].every(tag => taskTags.includes(tag))) return false;
        }

        // Folder Check: Always show folders (Unless filtered out by specific folder above)
        // If we are filtering by a specific folder, we already handled the "Hide other folders" above.
        // If we are NOT filtering by folder (folderId is null), we show clear folders.
        const isFolder = !!task.isFolder || (!task.date && !!task.color);
        if (isFolder) return true;

        // Status Filter
        if (activeFilters.status === 'completed') {
            if (task.status !== 'completed') return false;
        } else if (activeFilters.status === 'pending') {
            if (task.status === 'completed') return false;
        }

        // Date Filter
        if (activeFilters.dateRange === 'all') return true;
        if (activeFilters.dateRange === 'custom' && (!start || !end)) return true;

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
    // Also refresh Main View ensuring it shows correct data, but INDEPENDENT of filters
    refreshMainView();
    renderCategoryTags(); // Update sidebar tags with new counts

    // Update Reset Button Visibility
    const isDefault = activeFilters.dateRange === 'today' &&
        activeFilters.tags.size === 0 &&
        activeFilters.status === 'all' &&
        !activeFilters.folderId &&
        activeFilters.mainTags.size === 0 &&
        !activeFilters.customStart;

    const resetBtn = document.getElementById('filter-reset');
    const mobileResetBtn = document.getElementById('mobile-filter-reset');

    if (resetBtn) {
        if (isDefault) resetBtn.classList.add('hidden');
        else resetBtn.classList.remove('hidden');
    }

    if (mobileResetBtn) {
        if (isDefault) mobileResetBtn.classList.add('hidden');
        else mobileResetBtn.classList.remove('hidden');
    }
}

// esto esta ok - actualiza la vista principal independientemente de filtros laterales
function refreshMainView() {
    // 2. Determine Main View Date Range (Based on NAVIGABLE currentDate)
    let start = null, end = null;
    const now = new Date(currentDate);
    const todayNav = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (currentView === 'timeline') {
        // Always single day based on proper currentDate
        renderTimeline('today');
        // Also update Folder Filter options? Maybe not necessary every time, only on data change.
        // But Category Tags DO need update to reflect counts based on current date range.
        renderCategoryTags();
    } else if (currentView === 'list') {
        if (activeFilters.dateRange === 'custom' && activeFilters.customStart && activeFilters.customEnd) {
            const start = new Date(activeFilters.customStart + 'T00:00:00');
            const end = new Date(activeFilters.customEnd + 'T00:00:00');
            renderListView('custom', start, end);
        } else if (mainViewRange === 'week') {
            const day = todayNav.getDay();
            start = new Date(todayNav); start.setDate(todayNav.getDate() - day);
            end = new Date(start); end.setDate(end.getDate() + 6);
            renderListView('week', start, end);
        } else {
            // Default to month or other mainViewRanges
            renderListView(mainViewRange);
        }
    } else if (currentView === 'calendar') {
        renderCalendar();
    }
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
// esto esta ok - calcula el progreso hacia la meta diaria
function updateDailyGoalUI() {
    // MATCH FILTER LOGIC EXACTLY - esto esta ok - usa helper para fecha consistente
    const today = getTodayDate();

    // Helper: Check if task is valid for 'Today' (scheduled or recurring on today)
    const isToday = (t) => isTaskOnDate(t, today);

    // Completed Today (Filter: Status=Completed AND Date=Today AND Not Comment)
    const completedTodayCount = tasks.filter(t =>
        t.status === 'completed' && isToday(t) && !t.isTimelineComment && t.category !== 'comment'
    ).length;

    // Pending Today (Filter: Status!=Completed AND Date=Today AND Not Comment)
    const pendingTodayCount = tasks.filter(t =>
        t.status !== 'completed' && isToday(t) && !t.isTimelineComment && t.category !== 'comment'
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

    const pendingText = document.getElementById('pending-tasks-count');
    if (pendingText) pendingText.textContent = `${pendingTodayCount} pendientes`;

    // Update Mobile Widget
    const mobileProgress = document.getElementById('mobile-goal-progress');
    if (mobileProgress) mobileProgress.textContent = `${completedTodayCount}/${dailyGoal}`;

    const mobileBar = document.getElementById('mobile-goal-bar');
    if (mobileBar) mobileBar.style.width = `${percentage}%`;

    const mobilePending = document.getElementById('mobile-pending-tasks-count');
    if (mobilePending) mobilePending.textContent = `${pendingTodayCount} pendientes`;

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
    // Use passed reference or fallback for robustness - esto esta ok
    const today = todayRef || getTodayDate();

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
    // Desktop Elements
    const elTotal = document.getElementById('stats-total-today');
    if (elTotal) elTotal.textContent = totalPending + completedCount; // Total for day
    const elHigh = document.getElementById('stats-high');
    if (elHigh) elHigh.textContent = `${highPct}%`;
    const elMedium = document.getElementById('stats-medium');
    if (elMedium) elMedium.textContent = `${mediumPct}%`;
    const elLow = document.getElementById('stats-low');
    if (elLow) elLow.textContent = `${lowPct}%`;
    const elCompleted = document.getElementById('stats-completed-percent');
    if (elCompleted) elCompleted.textContent = `${completedPct}%`;

    // Only set quote if empty/loading (for desktop)
    const elQuote = document.getElementById('stats-quote');
    if (elQuote) {
        if (typeof FRASES_MOTIVACIONALES !== 'undefined' && FRASES_MOTIVACIONALES.length > 0) {
            const randomQuote = FRASES_MOTIVACIONALES[Math.floor(Math.random() * FRASES_MOTIVACIONALES.length)];
            elQuote.textContent = `"${randomQuote}"`;
            // Sync mobile quote too
            const mQuote = document.getElementById('mobile-stats-quote');
            if (mQuote) mQuote.textContent = `"${randomQuote}"`;
        } else {
            elQuote.textContent = "Haz que hoy cuente.";
        }
    }

    // --- Update Mobile Stats ---
    const mHigh = document.getElementById('mobile-stats-high');
    if (mHigh) mHigh.textContent = `${highPct}%`;
    const mMedium = document.getElementById('mobile-stats-medium');
    if (mMedium) mMedium.textContent = `${mediumPct}%`;
    const mLow = document.getElementById('mobile-stats-low');
    if (mLow) mLow.textContent = `${lowPct}%`;
    const mCompleted = document.getElementById('mobile-stats-completed-percent');
    if (mCompleted) mCompleted.textContent = `${completedPct}%`;
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

    // ResizeObserver for Ultra Compact Mode
    const timerDisplay = document.querySelector('.timer-display');
    if (timerDisplay) {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.contentRect.height < 80) {
                    timerDisplay.classList.add('ultra-compact');
                } else {
                    timerDisplay.classList.remove('ultra-compact');
                }
            }
        });
        resizeObserver.observe(timerDisplay);
    }

    if (window.innerWidth <= 768) {
        window.switchMobileTab('list');
    } else {
        document.body.classList.add('tab-list');
    }

    // Request Notification Permission
    if ("Notification" in window) {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
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

    // Dynamic Header Font Size
    const headerTitle = document.getElementById('current-month-year');
    if (headerTitle) {
        const observer = new MutationObserver(() => {
            if (headerTitle.textContent.length > 20) {
                headerTitle.style.fontSize = '1.1rem'; // Reduced size
            } else {
                headerTitle.style.fontSize = ''; // Reset
            }
        });
        observer.observe(headerTitle, { childList: true, characterData: true, subtree: true });
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

    // esto esta ok - llamadas de actualización sin duplicar
    updateParentSelect();
    renderCategoryTags();
    updateFolderFilterOptions(); // Update Folder Dropdown
    updateMainTagFilterOptions(); // Update Main Tag Dropdown
    updateDailyGoalUI();
};

// esto podria hacerse con memoization para mejorar rendimiento si hay muchas etiquetas
function renderCategoryTags() {
    // Desktop Container
    const desktopContainer = document.getElementById('category-tags-container');
    // Mobile Container
    const mobileContainer = document.getElementById('mobile-category-tags-container');

    // 1. Calculate Tag Counts based on CURRENT CONTEXT (Date & Status)
    // We want to know: "If I click this tag, how many tasks will I see?"
    // So we invoke the same logic as applyFilters BUT ignoring the tag filter itself.

    const tagCounts = {};
    const visibleTasksContext = tasks.filter(task => {
        // Exclude Timeline Comments and Notes (Legacy and New)
        if (task.isTimelineComment || task.category === 'comment' || task.category === '|||comment|||') return false;
        if (task.isTimelineNote || task.category === 'note' || task.category === '|||note|||') return false;

        // Status Filter
        if (activeFilters.status === 'completed' && !task.completed) return false;
        if (activeFilters.status === 'pending' && task.completed) return false;

        // Date Range Filter
        if (activeFilters.dateRange !== 'all') {
            const today = getTodayDate(); // esto esta ok

            // Helper for single date match
            const checkDate = (d) => {
                if (!d) return false; // Tasks without date only match 'all'
                const tDate = new Date(d + 'T00:00:00');
                if (activeFilters.dateRange === 'today') return tDate.getTime() === today.getTime();
                if (activeFilters.dateRange === 'tomorrow') {
                    const tmrw = new Date(today); tmrw.setDate(tmrw.getDate() + 1);
                    return tDate.getTime() === tmrw.getTime();
                }
                if (activeFilters.dateRange === 'yesterday') {
                    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
                    return tDate.getTime() === yest.getTime();
                }
                // Simplified week/month checks (assuming basic usage or standard logic replication)
                // For robustness, full replication of applyFilters logic is needed.
                // Let's grab the logic from applyFilters or assume standard ranges.
                // Reusing the exact logic from applyFilters (lines 50-80 approx) would be best.

                // Let's try to match basic cases which are most common:
                // If it's complex range, maybe just count all? No, user wants filtered counts.

                // Copying logic from applyFilters:
                const taskDate = new Date(d + 'T00:00:00');
                if (activeFilters.dateRange === 'week') {
                    const startOfWeek = new Date(today);
                    startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Mon
                    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);
                    return taskDate >= startOfWeek && taskDate <= endOfWeek;
                }
                if (activeFilters.dateRange === 'month') {
                    return taskDate.getMonth() === today.getMonth() && taskDate.getFullYear() === today.getFullYear();
                }
                if (activeFilters.dateRange === 'last-month') {
                    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    return taskDate.getMonth() === lastMonth.getMonth() && taskDate.getFullYear() === lastMonth.getFullYear();
                }
                return false;
            };

            // Recursion/Inheritance note: applyFilters handles inherited dates. 
            // For simplicity here, we check direct date. 
            // Improving this to be fully consistent is hard without refactoring applyFilters.
            // But basic direct date check covers 90% of cases.
            if (!checkDate(task.date)) return false;
        }

        return true;
    });

    visibleTasksContext.forEach(task => {
        if (task.category && task.category.trim() !== '') {
            task.category.split(',').forEach(t => {
                const tag = t.trim();
                if (tag !== '') {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                }
            });
        }
    });

    // Sort by Count DESC
    const sortedCategories = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);

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

        if (sortedCategories.length === 0) {
            const msg = document.createElement('span');
            msg.style.fontSize = '0.8rem';
            msg.style.color = 'var(--text-secondary)';
            msg.style.marginLeft = '8px';
            msg.textContent = 'No hay etiquetas';
            container.appendChild(msg);
            return;
        }

        sortedCategories.forEach(cat => {
            const count = tagCounts[cat];
            const chip = document.createElement('button');
            chip.className = 'tag-chip filter-chip';
            if (activeFilters.tags.has(cat)) chip.classList.add('active');
            chip.textContent = `${cat} (${count})`; // Display Count
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



function updateFolderFilterOptions() {
    const btn = document.getElementById('filter-folder-btn');
    const dropdown = document.getElementById('filter-folder-dropdown');
    const span = document.getElementById('filter-folder-text');

    if (!btn || !dropdown) return;

    // Toggle Dropdown (Simple handler, remove old one if exists or just overwrite property)
    btn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
    };

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    dropdown.innerHTML = '';

    // "Todas" Option
    const addOption = (id, text, isSelected) => {
        const row = document.createElement('div');
        row.style.padding = '5px';
        row.style.cursor = 'pointer';
        row.style.borderBottom = '1px solid var(--glass-border)';
        row.style.fontSize = '0.9rem';
        row.style.color = isSelected ? 'var(--accent-color)' : 'var(--text-primary)';
        if (isSelected) row.style.fontWeight = '600';

        row.textContent = text;

        row.onmouseover = () => row.style.background = 'rgba(255,255,255,0.05)';
        row.onmouseout = () => row.style.background = 'transparent';

        row.onclick = () => {
            activeFilters.folderId = id;
            updateBtnText();
            applyFilters();
            dropdown.style.display = 'none';
        };
        dropdown.appendChild(row);
    };

    // Add "Todas"
    addOption(null, 'Todas las Carpetas', !activeFilters.folderId);

    // Find all folders
    const folders = tasks.filter(t => !!t.isFolder || (!t.date && !!t.color));

    folders.forEach(f => {
        addOption(f.id, f.title, activeFilters.folderId === f.id);
    });

    function updateBtnText() {
        if (!activeFilters.folderId) {
            span.innerHTML = '<i class="fa-solid fa-folder-open"></i>';
        } else {
            const f = tasks.find(t => t.id === activeFilters.folderId);
            span.textContent = f ? f.title : "Carpeta";
        }
    }

    updateBtnText();
}

function updateMainTagFilterOptions() {
    const btn = document.getElementById('filter-tag-main-btn');
    const dropdown = document.getElementById('filter-tag-main-dropdown');
    const span = document.getElementById('filter-tag-main-text');

    if (!btn || !dropdown) return;

    // Toggle Dropdown
    // Remove old listener to avoid duplicates if called multiple times? 
    // Ideally this setup should be idempotent.
    // Let's use a property to check if listener attached or just clone/replace.
    // For simplicity in this codebase context:
    btn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
    };

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // 1. Calculate Frequency
    const tagCounts = {};

    // Determine Tasks to Count
    let tasksToCount = tasks;
    if (currentView === 'timeline') {
        const timelineDate = new Date(currentDate);
        timelineDate.setHours(0, 0, 0, 0);
        // We use checkDate helper or direct comparison if checkDate is not easily accessible here?
        // Let's use isTaskOnDate helper if available, or reproduce basic logic.
        // isTaskOnDate is available in scope (script.js global).
        // Timeline shows tasks on a specific date (usually currentDate).
        tasksToCount = tasks.filter(task => {
            // Also need sessions check for timeline? 
            // renderTimeline iterates tasks and checks sessions OR direct date.
            // Let's mirror renderTimeline logic for "Does this task appear?"

            // Check direct date
            if (isTaskOnDate(task, timelineDate)) return true;

            // Check sessions
            if (task.sessions && Array.isArray(task.sessions)) {
                return task.sessions.some(s => {
                    if (!s.start) return false;
                    const sDate = new Date(s.start);
                    return sDate.getFullYear() === timelineDate.getFullYear() &&
                        sDate.getMonth() === timelineDate.getMonth() &&
                        sDate.getDate() === timelineDate.getDate();
                });
            }
            return false;
        });
    }

    tasksToCount.forEach(task => {
        if (task.category && task.category.trim() !== '') {
            task.category.split(',').forEach(t => {
                const tag = t.trim();
                // Exclude system tags
                if (tag && tag !== 'comment' && tag !== 'note' && !tag.startsWith('|||')) {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                }
            });
        }
    });

    // 2. Sort by Frequency DESC
    const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);

    // 3. Render
    dropdown.innerHTML = '';

    if (sortedTags.length === 0) {
        dropdown.innerHTML = '<div style="padding: 5px; color: var(--text-secondary); font-size: 0.8rem;">No hay etiquetas</div>';
        return;
    }

    sortedTags.forEach(tag => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.padding = '5px';
        row.style.cursor = 'pointer';
        row.style.borderBottom = '1px solid var(--glass-border)';

        // Hover effect manual or CSS? Inline for speed
        row.onmouseover = () => row.style.background = 'rgba(255,255,255,0.05)';
        row.onmouseout = () => row.style.background = 'transparent';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = tag;
        checkbox.style.marginRight = '8px';
        checkbox.checked = activeFilters.mainTags.has(tag);

        const label = document.createElement('span');
        label.textContent = `${tag} (${tagCounts[tag]})`;
        label.style.fontSize = '0.9rem';
        label.style.color = 'var(--text-primary)';

        row.appendChild(checkbox);
        row.appendChild(label);

        // Click handler for row or checkbox
        const toggle = () => {
            if (checkbox.checked) {
                // Was checked, now unchecked (if clicked direct) or we uncheck it
                // Wait, if row clicked, we invert.
                // If checkbox clicked, it handled itself.
                // Let's sync.
            }
        };

        row.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }

            if (checkbox.checked) {
                activeFilters.mainTags.add(tag);
            } else {
                activeFilters.mainTags.delete(tag);
            }

            updateBtnText();
            applyFilters();
        });

        dropdown.appendChild(row);
    });

    function updateBtnText() {
        if (activeFilters.mainTags.size === 0) {
            span.innerHTML = '<i class="fa-solid fa-tag"></i>';
        } else if (activeFilters.mainTags.size === 1) {
            span.textContent = Array.from(activeFilters.mainTags)[0];
        } else {
            span.textContent = `${activeFilters.mainTags.size} seleccionadas`;
        }
    }

    updateBtnText();
}

function setupAuthListeners() {
    // Auth Elements
    const authForm = document.getElementById('auth-form');
    const authTitle = document.getElementById('auth-title');
    const emailInput = document.getElementById('auth-email');
    const passInput = document.getElementById('auth-password');
    const passConfirmInput = document.getElementById('auth-password-confirm'); // New
    const inviteInput = document.getElementById('auth-invite-code'); // New
    const grpConfirm = document.getElementById('grp-auth-confirm'); // New
    const grpInvite = document.getElementById('grp-auth-invite'); // New
    const errorMsg = document.getElementById('auth-error');
    const btnSubmit = document.getElementById('btn-auth-submit');
    const btnToggle = document.getElementById('btn-toggle-auth');
    const switchText = document.getElementById('auth-switch-text');

    // Logout
    const btnLogout = document.getElementById('logout-btn');

    let isLoginMode = true;

    // Toggle Mode Logic
    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            isLoginMode = !isLoginMode;
            errorMsg.style.display = 'none';

            if (isLoginMode) {
                // LOGIN MODE
                authTitle.textContent = "Iniciar Sesión";
                btnSubmit.textContent = "Iniciar Sesión";
                switchText.textContent = "¿No tienes cuenta?";
                btnToggle.textContent = "Registrarse";
                // Hide extra fields
                grpConfirm.style.display = 'none';
                grpInvite.style.display = 'none';
                // Remove required attribute just in case
                passConfirmInput.required = false;
                inviteInput.required = false;
            } else {
                // REGISTER MODE
                authTitle.textContent = "Crear Cuenta";
                btnSubmit.textContent = "Registrarse";
                switchText.textContent = "¿Ya tienes cuenta?";
                btnToggle.textContent = "Iniciar Sesión";
                // Show extra fields
                grpConfirm.style.display = 'block';
                grpInvite.style.display = 'block';
                passConfirmInput.required = true;
                inviteInput.required = true;
            }
        });
    }

    // Submit Handler
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorMsg.style.display = 'none';

            const email = emailInput.value;
            const password = passInput.value;

            if (!email || !password) return;

            if (password.length < 6) {
                errorMsg.textContent = "La contraseña debe tener al menos 6 caracteres.";
                errorMsg.style.display = 'block';
                return;
            }

            let result;
            if (isLoginMode) {
                if (window.authLogin) {
                    btnSubmit.textContent = "Iniciando...";
                    btnSubmit.disabled = true;
                    result = await window.authLogin(email, password);
                }
            } else {
                // REGISTRATION VALIDATIONS
                const passConfirm = passConfirmInput.value;
                const inviteCode = inviteInput.value.trim();

                if (password !== passConfirm) {
                    errorMsg.textContent = "Las contraseñas no coinciden.";
                    errorMsg.style.display = 'block';
                    return;
                }

                if (!inviteCode) {
                    errorMsg.textContent = "Debes ingresar un código de invitación.";
                    errorMsg.style.display = 'block';
                    return;
                }

                // Verify Code
                btnSubmit.textContent = "Verificando código...";
                btnSubmit.disabled = true;

                if (window.checkInvitationCode) {
                    const codeCheck = await window.checkInvitationCode(inviteCode);
                    if (!codeCheck.valid) {
                        errorMsg.textContent = codeCheck.message || "Código inválido.";
                        errorMsg.style.display = 'block';
                        btnSubmit.textContent = "Registrarse";
                        btnSubmit.disabled = false;
                        return;
                    }
                } else {
                    console.warn("Función checkInvitationCode no encontrada. Saltando verificación (DEV MODE).");
                }

                if (window.authRegister) {
                    btnSubmit.textContent = "Registrando...";
                    result = await window.authRegister(email, password);
                }
            }

            btnSubmit.disabled = false;

            if (result) {
                if (!result.success) {
                    errorMsg.textContent = result.message;
                    errorMsg.style.display = 'block';
                    // Reset button text
                    btnSubmit.textContent = isLoginMode ? "Iniciar Sesión" : "Registrarse";
                } else {
                    // Success
                    emailInput.value = '';
                    passInput.value = '';
                    if (!isLoginMode) {
                        alert("Cuenta creada con éxito.");
                        // Clean
                        passConfirmInput.value = '';
                        inviteInput.value = '';
                    }
                    btnSubmit.textContent = isLoginMode ? "Iniciar Sesión" : "Registrarse";
                }
            }
        });
    }

    // Logout Logic
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm("¿Cerrar sesión?")) {
                if (window.authLogout) window.authLogout();
            }
        });

        // Duplicate logout button for mobile header
        const btnLogoutDup = document.querySelector('.logout-btn-dup');
        if (btnLogoutDup) {
            btnLogoutDup.addEventListener('click', () => {
                if (confirm("¿Cerrar sesión?")) {
                    if (window.authLogout) window.authLogout();
                }
            });
        }
    }

    // --- Change Password Logic (Settings) ---
    const btnChangePass = document.getElementById('btn-change-pass');
    const oldPassInput = document.getElementById('sec-old-pass');
    const newPassInput = document.getElementById('sec-new-pass');
    const confirmPassInput = document.getElementById('sec-confirm-pass');
    const secMsg = document.getElementById('sec-msg');

    if (btnChangePass) {
        btnChangePass.addEventListener('click', async () => {
            // UI Reset
            secMsg.style.display = 'none';
            secMsg.style.color = 'var(--text-secondary)';

            const oldPass = oldPassInput.value;
            const newPass = newPassInput.value;
            const confirmPass = confirmPassInput.value;

            // Validations
            if (!oldPass || !newPass || !confirmPass) {
                secMsg.textContent = "Por favor completa todos los campos.";
                secMsg.style.color = "var(--danger-color)";
                secMsg.style.display = 'block';
                return;
            }

            if (newPass.length < 6) {
                secMsg.textContent = "La nueva contraseña debe tener al menos 6 caracteres.";
                secMsg.style.color = "var(--danger-color)";
                secMsg.style.display = 'block';
                return;
            }

            if (newPass !== confirmPass) {
                secMsg.textContent = "Las nuevas contraseñas no coinciden.";
                secMsg.style.color = "var(--danger-color)";
                secMsg.style.display = 'block';
                return;
            }

            if (oldPass === newPass) {
                secMsg.textContent = "La nueva contraseña no puede ser igual a la anterior.";
                secMsg.style.color = "var(--danger-color)";
                secMsg.style.display = 'block';
                return;
            }

            // Action
            btnChangePass.disabled = true;
            btnChangePass.textContent = "Actualizando...";

            if (window.changeUserPassword) {
                const result = await window.changeUserPassword(oldPass, newPass);

                if (result.success) {
                    secMsg.textContent = "¡Contraseña actualizada con éxito!";
                    secMsg.style.color = "var(--success-color)"; // Ensure this var exists or use green
                    if (!getComputedStyle(document.documentElement).getPropertyValue('--success-color')) {
                        secMsg.style.color = "#4CAF50";
                    }
                    secMsg.style.display = 'block';

                    // Clear inputs
                    oldPassInput.value = '';
                    newPassInput.value = '';
                    confirmPassInput.value = '';
                } else {
                    secMsg.textContent = result.message;
                    secMsg.style.color = "var(--danger-color)";
                    secMsg.style.display = 'block';
                }
            }

            btnChangePass.disabled = false;
            btnChangePass.textContent = "Actualizar Contraseña";
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
    // Prevent "|||" in Task Category (Reserved for system tags)
    const categoryInput = document.getElementById('task-category');
    if (categoryInput) {
        categoryInput.addEventListener('input', (e) => {
            if (e.target.value.includes('|||')) {
                e.target.value = e.target.value.replace(/\|\|\|/g, '');

                // Visual Feedback
                let errorMsg = categoryInput.parentNode.querySelector('.input-error-msg');
                if (!errorMsg) {
                    errorMsg = document.createElement('span');
                    errorMsg.className = 'input-error-msg';
                    errorMsg.style.color = 'var(--priority-high)';
                    errorMsg.style.fontSize = '0.75rem';
                    errorMsg.style.marginTop = '5px';
                    errorMsg.style.display = 'block';
                    errorMsg.textContent = 'Las etiquetas no pueden contener |||';
                    categoryInput.parentNode.appendChild(errorMsg);
                }

                if (categoryInput.errorTimeout) clearTimeout(categoryInput.errorTimeout);
                categoryInput.errorTimeout = setTimeout(() => {
                    if (errorMsg) errorMsg.remove();
                }, 3000);
            }
            updateTagSuggestions(e.target.value);
        });

        // Also update on focus to show top 5 defaults
        categoryInput.addEventListener('focus', (e) => {
            updateTagSuggestions(e.target.value);
        });
    }

    document.getElementById('add-task-btn').addEventListener('click', () => openModal());
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-task').addEventListener('click', closeModal);
    taskForm.addEventListener('submit', handleTaskSubmit);

    // Dynamic Parent Filtering
    document.getElementById('task-date').addEventListener('change', updateParentSelect);
    document.getElementById('task-end-date').addEventListener('change', updateParentSelect);


    // Correct Implementation of toggleUnifiedWidget
    const setupUnifiedWidget = () => {
        // Desktop
        const dHeader = document.getElementById('stats-header');
        const dBody = document.getElementById('stats-body');
        const dChevron = document.getElementById('stats-chevron');
        const dContainer = document.getElementById('desktop-unified-widget'); // Using ID from index check

        if (dHeader && dContainer) {
            dHeader.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;

                const isCollapsed = dContainer.classList.contains('widget-collapsed'); // Use specific class to avoid conflict

                if (isCollapsed) {
                    // EXPAND
                    dContainer.classList.remove('widget-collapsed');
                    if (dBody) dBody.style.display = 'block'; // Or flex/grid? usually block for stats body
                    if (dChevron) dChevron.style.transform = 'rotate(0deg)';

                    // Show Elements
                    const els = ['goal-progress-text', 'today-total-text', 'daily-goal-input'];
                    els.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; }); // Reset to default

                    const bar = dHeader.querySelector('.goal-progress-bar-bg');
                    if (bar) bar.style.display = '';

                } else {
                    // COLLAPSE
                    dContainer.classList.add('widget-collapsed');
                    if (dBody) dBody.style.display = 'none';
                    if (dChevron) dChevron.style.transform = 'rotate(-90deg)';

                    // Hide Elements
                    const els = ['goal-progress-text', 'today-total-text', 'daily-goal-input'];
                    // daily-goal-input logic: if we hide input, user can't change goal.
                    // But user requested it. "daily-goal-input tambien deberían ocultarse".
                    els.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

                    const bar = dHeader.querySelector('.goal-progress-bar-bg');
                    if (bar) bar.style.display = 'none';
                }
            });
        }

        // Mobile
        const mHeader = document.getElementById('mobile-daily-goal');
        // Mobile container is tricky, stats are siblings inside #mobile-widgets-container?
        // Index check:
        // #mobile-widgets-container (daily-goal-widget collapsed-widget)
        //    #mobile-daily-goal
        //    #mobile-stats-body

        const mContainer = document.getElementById('mobile-widgets-container');
        const mBody = document.getElementById('mobile-stats-body');
        const mChevron = document.getElementById('mobile-stats-chevron');

        if (mHeader && mContainer) {
            mHeader.addEventListener('click', (e) => {
                const isCollapsed = mContainer.classList.contains('collapsed-widget'); // It has this class by default in HTML line 163

                if (isCollapsed) {
                    // EXPAND
                    mContainer.classList.remove('collapsed-widget');
                    if (mBody) mBody.style.display = 'block';
                    if (mChevron) mChevron.style.transform = 'rotate(0deg)';

                    // Show specific elements
                    const mProgress = document.getElementById('mobile-goal-progress');
                    if (mProgress) {
                        // Logic: "Objetivo: 0/5". If we hide 0/5, we see "Objetivo: ".
                        // User said "also hide ... goal-progress-text". 
                        // Check structure: <span>Objetivo: <span id>...</span></span>.
                        // Maybe hide parent span? But parent has no ID.
                        // Let's hide the ID element for now as closest match, or closest span.
                        mProgress.style.display = '';
                    }
                    const mBarContainer = document.getElementById('mobile-goal-bar-container'); // Added ID in previous step
                    if (mBarContainer) mBarContainer.style.display = '';

                } else {
                    // COLLAPSE
                    mContainer.classList.add('collapsed-widget');
                    if (mBody) mBody.style.display = 'none';
                    if (mChevron) mChevron.style.transform = 'rotate(-90deg)';

                    // Hide specific elements
                    const mProgress = document.getElementById('mobile-goal-progress');
                    if (mProgress) mProgress.style.display = 'none';

                    const mBarContainer = document.getElementById('mobile-goal-bar-container');
                    if (mBarContainer) mBarContainer.style.display = 'none';
                }
            });
        }
    };
    setupUnifiedWidget();

    // Mobile Widgets Toggle (Existing logic - we might need to adjust or remove if it conflicts?
    // The previous logic targeted #mobile-widgets-toggle button. 
    // The unified widget is separate functionality.
    // Ensure no conflict.

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
    const customPicker = document.getElementById('custom-date-picker');

    if (dateRangeSelect) {
        dateRangeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                if (customPicker) {
                    customPicker.style.display = 'flex';
                    if (activeFilters.customStart) document.getElementById('custom-date-start').value = activeFilters.customStart;
                    if (activeFilters.customEnd) document.getElementById('custom-date-end').value = activeFilters.customEnd;
                }
            } else {
                if (customPicker) customPicker.style.display = 'none';
                activeFilters.dateRange = e.target.value;
                applyFilters();
            }
        });
    }

    // Custom Picker Buttons (Desktop)
    const btnApplyCustom = document.getElementById('btn-apply-custom-date');
    const btnCancelCustom = document.getElementById('btn-cancel-custom-date');

    if (btnApplyCustom) {
        btnApplyCustom.addEventListener('click', () => {
            const s = document.getElementById('custom-date-start').value;
            const e = document.getElementById('custom-date-end').value;
            if (s && e) {
                activeFilters.dateRange = 'custom';
                activeFilters.customStart = s;
                activeFilters.customEnd = e;
                if (customPicker) customPicker.style.display = 'none';
                applyFilters();
            } else {
                alert('Por favor selecciona ambas fechas.');
            }
        });
    }

    if (btnCancelCustom) {
        btnCancelCustom.addEventListener('click', () => {
            if (customPicker) customPicker.style.display = 'none';
            if (dateRangeSelect) dateRangeSelect.value = 'today';
            activeFilters.dateRange = 'today';
            applyFilters();
        });
    }

    // Mobile Date Range
    const mobileDateRangeSelect = document.getElementById('mobile-filter-date-range');
    const mobileCustomPicker = document.getElementById('mobile-custom-date-picker');

    if (mobileDateRangeSelect) {
        mobileDateRangeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                if (mobileCustomPicker) {
                    mobileCustomPicker.style.display = 'flex';
                    if (activeFilters.customStart) document.getElementById('mobile-custom-date-start').value = activeFilters.customStart;
                    if (activeFilters.customEnd) document.getElementById('mobile-custom-date-end').value = activeFilters.customEnd;
                }
            } else {
                if (mobileCustomPicker) mobileCustomPicker.style.display = 'none';
                activeFilters.dateRange = e.target.value;
                applyFilters();
            }
        });
    }

    // Custom Picker Buttons (Mobile)
    const btnApplyMobileCustom = document.getElementById('mobile-btn-apply-custom-date');
    const btnCancelMobileCustom = document.getElementById('mobile-btn-cancel-custom-date');

    if (btnApplyMobileCustom) {
        btnApplyMobileCustom.addEventListener('click', () => {
            const s = document.getElementById('mobile-custom-date-start').value;
            const e = document.getElementById('mobile-custom-date-end').value;
            if (s && e) {
                activeFilters.dateRange = 'custom';
                activeFilters.customStart = s;
                activeFilters.customEnd = e;
                if (mobileCustomPicker) mobileCustomPicker.style.display = 'none';
                applyFilters();
            } else {
                alert('Por favor selecciona ambas fechas.');
            }
        });
    }

    if (btnCancelMobileCustom) {
        btnCancelMobileCustom.addEventListener('click', () => {
            if (mobileCustomPicker) mobileCustomPicker.style.display = 'none';
            if (mobileDateRangeSelect) mobileDateRangeSelect.value = 'today';
            activeFilters.dateRange = 'today';
            applyFilters();
        });
    }

    // 2. Todos / Reset Button
    const resetBtn = document.getElementById('filter-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            activeFilters = { dateRange: 'today', tags: new Set(), status: 'all', folderId: null, mainTags: new Set(), customStart: null, customEnd: null };
            // Reset Folder UI: now handled by updateFolderFilterOptions state check, but we trigger it
            updateFolderFilterOptions();
            // Reset Main Tag UI
            updateMainTagFilterOptions();
            applyFilters();
        });
    }

    // Mobile Reset
    const mobileResetBtn = document.getElementById('mobile-filter-reset');
    if (mobileResetBtn) {
        mobileResetBtn.addEventListener('click', () => {
            activeFilters = { dateRange: 'today', tags: new Set(), status: 'all', folderId: null, mainTags: new Set(), customStart: null, customEnd: null };

            const mobileDateRange = document.getElementById('mobile-filter-date-range');
            if (mobileDateRange) mobileDateRange.value = 'today';

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
    // Prevent clicks inside modal content from closing the modal
    const dayDetailsContent = document.querySelector('#day-details-modal .modal-content');
    if (dayDetailsContent) {
        dayDetailsContent.addEventListener('click', (e) => e.stopPropagation());
    }
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

    // Unify Mobile Toggle: One button toggles the whole "mobile-widgets-container"
    // Inside it, "mobile-daily-goal" is the header. Let's make it toggle "mobile-stats-body" too?
    // Or just make stats body show when container is filtered?
    // User wants "Collapsible daily goal and stats". 
    // Let's assume on Mobile, clicking the goal header toggles stats body also?
    // Or simpler: Just ensure mobile-stats-body is shown if container is expanded?
    // Currently "mobile-widgets-toggle" expands the container. 
    // Let's explicitly hook expanding stats inside mobile container.
    const mobileGoalHeader = document.getElementById('mobile-daily-goal');
    const mobileStatsBody = document.getElementById('mobile-stats-body');
    if (mobileGoalHeader && mobileStatsBody) {
        // Allow clicking the goal header to toggle the extra stats details
        mobileGoalHeader.addEventListener('click', () => {
            if (mobileStatsBody.style.display === 'none') {
                mobileStatsBody.style.display = 'block';
            } else {
                mobileStatsBody.style.display = 'none';
            }
        });
        // Make it pointer
        mobileGoalHeader.style.cursor = "pointer";
    }

    // Initialize Sidebar
    setupSidebar();
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
        mainViewRange = 'month';
        refreshMainView();
    } else if (view === 'list') {
        calendarGridEl.style.display = 'none';
        listViewEl.style.display = 'flex';
        document.getElementById('timeline-view').style.display = 'none';

        // Force Week View defaults when switching to List
        mainViewRange = 'week';
        refreshMainView();
    } else if (view === 'timeline') {
        calendarGridEl.style.display = 'none';
        listViewEl.style.display = 'none';
        document.getElementById('timeline-view').style.display = 'block';
        mainViewRange = 'today';
        refreshMainView();
    }

    // Filter Visibility Logic
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

    // Refresh Filter Tag Counts based on View Context
    if (typeof updateMainTagFilterOptions === 'function') {
        updateMainTagFilterOptions();
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
    // Reminder Populating
    const reminderActive = document.getElementById('task-reminder-active');
    const reminderTime = document.getElementById('task-reminder-time');

    if (editId) {
        const t = tasks.find(t => t.id === editId);
        if (t) {
            // ... existing population ... 
            reminderActive.checked = !!t.reminderActive;
            reminderTime.value = t.reminderTime || '';
            reminderTime.style.display = t.reminderActive ? 'block' : 'none';
        }
    } else {
        reminderActive.checked = false;
        reminderTime.value = '';
        reminderTime.style.display = 'none';
    }

    // Toggle Time Input Visibility
    reminderActive.onclick = () => {
        if (reminderActive.checked) {
            reminderTime.style.display = 'block';
            reminderTime.disabled = false;
        } else {
            reminderTime.style.display = 'none';
        }
    };

    updateParentSelect();
}

function closeModal() { modal.classList.remove('active'); }

// esto esta ok - actualiza opciones de padre según contexto
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
    const category = document.getElementById('task-category').value.replace(/\|\|\|/g, '');
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
    const reminderActive = document.getElementById('task-reminder-active').checked;
    const reminderTime = document.getElementById('task-reminder-time').value;

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
        isFolder: isFolder,
        reminderActive: isFolder ? false : reminderActive,
        reminderTime: isFolder ? null : reminderTime
    };

    if (editId) { if (window.updateTaskInFirebase) window.updateTaskInFirebase(editId, taskData); }
    else { if (window.addTaskToFirebase) window.addTaskToFirebase(taskData); }

    // Optimistic Update for immediate UI feedback (optional, but good)
    // Actually receiving Firebase update will trigger UI refresh, but let's ensure goal checks happen
    setTimeout(updateDailyGoalUI, 500); // Small delay to allow Firebase callback
    closeModal();
}

function checkReminders() {
    // Permission check for notifications (only stops browser notification, not modal)
    const canNotify = "Notification" in window && Notification.permission === "granted";

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHours}:${currentMinutes}`;

    if (!window.notifiedTasks) window.notifiedTasks = new Set();

    tasks.forEach(task => {
        if (!task.reminderActive || !task.reminderTime || task.status === 'completed') return;

        // Check if task is active today
        // Note: isTaskOnDate uses activeFilters logic implicitly if recursive? No, it's generic.
        // But let's verify if isTaskOnDate works correctly with `now`.
        if (isTaskOnDate(task, now)) {
            if (task.reminderTime === currentTime) {
                const uniqueKey = `${task.id}_${now.toDateString()}_${currentTime}`;

                if (!window.notifiedTasks.has(uniqueKey)) {
                    // 1. Show Modal
                    const reminderModal = document.getElementById('reminder-modal');
                    const reminderText = document.getElementById('reminder-text');
                    const btnStartPomo = document.getElementById('btn-reminder-start-pomo');

                    if (reminderModal && reminderText) {
                        reminderText.textContent = `Recordatorio: ${task.title}`;
                        reminderModal.dataset.taskId = task.id; // Store ID for snooze

                        if (btnStartPomo) {
                            btnStartPomo.onclick = () => {
                                startPomodoroForTask(task.id);
                                reminderModal.classList.remove('active');
                            };
                        }

                        reminderModal.classList.add('active');
                    }

                    // 2. Trigger Browser Notification
                    if (canNotify) {
                        new Notification("Recordatorio: " + task.title, {
                            body: "Es hora de tu tarea.",
                            icon: 'https://i.imgur.com/wMx638E.png'
                        });
                    }

                    // 3. Play Sound (if available)
                    if (timerSound) {
                        timerSound.play().catch(e => console.log("Audio play error", e));
                    }

                    window.notifiedTasks.add(uniqueKey);
                }
            }
        }
    });
}

function snoozeReminder(minutes) {
    const modal = document.getElementById('reminder-modal');
    const taskId = modal.dataset.taskId;

    if (!taskId) {
        modal.classList.remove('active');
        return;
    }

    const task = tasks.find(t => t.id === taskId);
    if (!task) {
        modal.classList.remove('active');
        return;
    }

    // Calculate new time
    const now = new Date();
    // Add minutes to current time (or should it be added to the ORIGINAL reminder time? 
    // Usability wise, adding to "Now" makes more sense if I saw the notification late.)
    now.setMinutes(now.getMinutes() + minutes);

    const newHours = String(now.getHours()).padStart(2, '0');
    const newMinutes = String(now.getMinutes()).padStart(2, '0');
    const newTime = `${newHours}:${newMinutes}`;

    // Update Task
    if (window.updateTaskInFirebase) {
        window.updateTaskInFirebase(taskId, {
            reminderTime: newTime,
            reminderActive: true // Ensure it stays active
        });
    }

    // Feedback? 
    // console.log(`Snoozed ${minutes}m. New time: ${newTime}`);

    modal.classList.remove('active');
}
// Run check every 30 seconds
setInterval(checkReminders, 30000);

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
    console.log('[DEBUG] openDayDetails called for date:', date);
    const modal = document.getElementById('day-details-modal');
    const title = document.getElementById('day-details-title');
    const body = document.getElementById('day-details-body');
    const btnAdd = document.getElementById('btn-add-task-on-day');

    console.log('[DEBUG] day-details-modal element:', modal);
    console.log('[DEBUG] day-details-body element:', body);

    const dateObj = new Date(date + 'T00:00:00');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    title.textContent = dateObj.toLocaleDateString('es-ES', options);
    body.innerHTML = '';

    let dayTasks = tasks.filter(t => {
        if (!isTaskOnDate(t, dateObj)) return false;
        if (t.category === 'comment' || t.category === '|||comment|||') return false;
        if (t.category === 'note' || t.category === '|||note|||') return false;
        return true;
    });
    // Apply Folder Filter to Day Details
    if (activeFilters.folderId) {
        dayTasks = dayTasks.filter(t => t.parentId === activeFilters.folderId);
    }

    // Apply Main Tag Filter to Day Details
    if (activeFilters.mainTags && activeFilters.mainTags.size > 0) {
        dayTasks = dayTasks.filter(t => {
            if (!t.category) return false;
            const taskTags = t.category.split(',').map(tag => tag.trim());
            // AND logic: Task must have ALL selected tags
            return [...activeFilters.mainTags].every(tag => taskTags.includes(tag));
        });
    }

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

    // FIX: Force ALL critical styles via JavaScript to bypass CSS issues
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('opacity', '1', 'important');

    // CRITICAL FIX: Temporarily disable pointer events to prevent calendar click from bubbling
    // and immediately closing the modal. Re-enable after a short delay.
    modal.style.setProperty('pointer-events', 'none', 'important');
    setTimeout(() => {
        modal.style.setProperty('pointer-events', 'all', 'important');
        console.log('[DEBUG] Pointer events re-enabled after delay');
    }, 100);

    console.log('[DEBUG] AFTER setting all styles, values are:', {
        display: modal.style.display,
        opacity: modal.style.opacity,
        pointerEvents: modal.style.pointerEvents
    });

    console.log('[DEBUG] modal classList after add:', modal.classList.toString());
    console.log('[DEBUG] modal computed styles:', {
        display: window.getComputedStyle(modal).display,
        opacity: window.getComputedStyle(modal).opacity,
        zIndex: window.getComputedStyle(modal).zIndex,
        pointerEvents: window.getComputedStyle(modal).pointerEvents
    });

    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        console.log('[DEBUG] modal-content computed styles:', {
            display: window.getComputedStyle(modalContent).display,
            opacity: window.getComputedStyle(modalContent).opacity,
            visibility: window.getComputedStyle(modalContent).visibility
        });
    }
}

function closeDayDetails() {
    const modal = document.getElementById('day-details-modal');
    modal.classList.remove('active');
    // Reset all inline styles to let CSS handle it
    modal.style.display = '';
    modal.style.opacity = '';
    modal.style.pointerEvents = '';
}

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
    if (expandedTasks.has(taskId)) {
        expandedTasks.delete(taskId);
        btn.classList.add('rotate');
    } else {
        expandedTasks.add(taskId);
        btn.classList.remove('rotate');
    }

    // Correctly find the container associated with THIS task
    const taskItem = btn.closest('.task-item');
    if (taskItem) {
        const container = taskItem.nextElementSibling;
        if (container && container.classList.contains('subtask-container')) {
            container.classList.toggle('hidden');
        }
    }
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
    div.className = `task-item ${isFolder ? 'priority-none is-folder' : 'priority-' + task.priority} ${task.status === 'completed' && !isFolder ? 'completed' : ''}`;
    div.dataset.id = task.id;
    // Opacity is redundant if we style via class, but keeps legacy support until CSS handles opacity too? 
    // User requested BG change, maybe opacity can stay or be moved to CSS. Keeping it for now.
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

// --- TIMELINE NOTES LOGIC ---

// --- TIMELINE NOTES LOGIC ---

// --- NEW NOTE MODAL LOGIC ---
function openNoteModal() {
    document.getElementById('note-modal').classList.add('active');
    // Set date to current visual date if exists, or today
    const dateInput = document.getElementById('note-date');
    if (currentDate) {
        dateInput.value = currentDate.toISOString().split('T')[0];
    } else {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Reset other fields
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
    document.getElementById('note-no-date').checked = false;
    document.getElementById('note-edit-id').value = ''; // Clear edit ID
    document.querySelector('#note-modal h3').textContent = 'Nueva Nota';
    dateInput.disabled = false;
}

function editNote(id) {
    const note = tasks.find(t => t.id === id);
    if (!note) return;

    document.getElementById('note-modal').classList.add('active');
    document.getElementById('note-title').value = note.title;
    document.getElementById('note-content').value = note.desc || '';
    document.getElementById('note-edit-id').value = note.id;
    document.querySelector('#note-modal h3').textContent = 'Editar Nota';

    const dateInput = document.getElementById('note-date');
    const noDateCheck = document.getElementById('note-no-date');

    if (note.isPermanent || !note.date) {
        noDateCheck.checked = true;
        dateInput.disabled = true;
        if (currentDate) dateInput.value = currentDate.toISOString().split('T')[0];
    } else {
        noDateCheck.checked = false;
        dateInput.disabled = false;
        dateInput.value = note.date;
    }
}
window.editNote = editNote;

function closeNoteModal() {
    document.getElementById('note-modal').classList.remove('active');
}

function saveNoteFromModal() {
    const titleVal = document.getElementById('note-title').value.trim();
    const contentVal = document.getElementById('note-content').value.trim();
    const dateVal = document.getElementById('note-date').value;
    const noDate = document.getElementById('note-no-date').checked;
    const editId = document.getElementById('note-edit-id').value;

    if (!titleVal && !contentVal) {
        alert("Por favor escribe un título o contenido.");
        return;
    }

    let noteData = {
        title: titleVal || 'Nota sin título',
        desc: contentVal,
        isTimelineNote: true,
        category: '|||note|||',
        status: 'pending',
        createdAt: new Date().toISOString()
    };

    if (noDate) {
        noteData.date = null;
        noteData.startDate = null;
        noteData.endDate = null;
        noteData.isPermanent = true;
    } else {
        noteData.date = dateVal;
        noteData.startDate = dateVal;
        noteData.endDate = dateVal;
        noteData.isPermanent = false;
    }

    if (editId) {
        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(editId, noteData);
        }
    } else {
        if (window.addTaskToFirebase) {
            window.addTaskToFirebase(noteData);
        }
    }

    closeNoteModal();

    // Refresh view
    setTimeout(() => {
        if (typeof renderNotes === 'function') {
            renderNotes(currentDate);
        } else if (typeof renderTimeline === 'function') {
            renderTimeline();
        }
    }, 500);
}

// Event Listener for "No Date" checkbox
document.getElementById('note-no-date').addEventListener('change', function (e) {
    document.getElementById('note-date').disabled = e.target.checked;
});

// Old addTimelineNote removed or kept as reference if needed, but logic is now here.
// function addTimelineNote() { ... } replaced.

function deleteNote(id) {
    if (confirm('¿Eliminar esta nota?')) {
        if (window.deleteTaskFromFirebase) {
            window.deleteTaskFromFirebase(id);
        }
        setTimeout(() => {
            renderNotes(currentDate);
        }, 500);
    }
}

function renderNotes(dateObj) {
    const container = document.getElementById('timeline-notes-list');
    if (!container) return;

    container.innerHTML = '';

    const viewDateStr = dateObj.toISOString().split('T')[0];

    const notes = tasks.filter(t => {
        if (!t.isTimelineNote && t.category !== 'note' && t.category !== '|||note|||') return false;

        // 1. Permanent Notes OR No Date (Always Visible)
        if (t.isPermanent || (!t.date && !t.startDate)) return true;

        // 2. Date Range
        if (t.startDate) {
            const start = t.startDate;
            const end = t.endDate || t.startDate;
            return viewDateStr >= start && viewDateStr <= end;
        }

        // 3. Simple Legacy Date
        if (t.date && !t.startDate) {
            return t.date === viewDateStr;
        }

        return false;
    });

    if (notes.length === 0) {
        container.innerHTML = '<div style="font-size: 0.9rem; color: var(--text-secondary); font-style: italic;">No hay notas para este día.</div>';
        return;
    }

    notes.forEach(note => {
        const div = document.createElement('div');
        div.style.background = 'var(--card-bg)';
        div.style.border = '1px solid var(--glass-border)';
        div.style.borderRadius = '8px';
        div.style.padding = '10px';
        div.style.position = 'relative';

        // Badge
        let dateBadge = '';
        if (note.isPermanent || (!note.date && !note.startDate)) {
            dateBadge = '<span style="font-size: 0.7rem; background: var(--accent-color); color: white; padding: 2px 5px; border-radius: 4px; margin-bottom: 5px; display: inline-block;">Siempre visible</span>';
        } else if (note.startDate) {
            if (note.startDate !== note.endDate) {
                dateBadge = `<span style="font-size: 0.7rem; background: var(--bg-dark); border: 1px solid var(--glass-border); color: var(--text-secondary); padding: 2px 5px; border-radius: 4px; margin-bottom: 5px; display: inline-block;">${note.startDate} - ${note.endDate}</span>`;
            }
        }

        const isCollapsed = note.isCollapsed; // Preserve state or default to false

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <div style="display: flex; align-items: center; gap: 5px; flex: 1;">
                    ${dateBadge}
                    <div style="font-weight: 600; color: var(--text-primary); cursor: pointer;" onclick="toggleNoteCollapse('${note.id}')">
                        ${note.title}
                    </div>
                </div>
                <div style="display: flex; gap: 5px; align-items: center;">
                     <button onclick="editNote('${note.id}')" 
                        style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer;">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button onclick="deleteNote('${note.id}')" 
                        style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                    <i class="fa-solid fa-chevron-down note-chevron" 
                       onclick="toggleNoteCollapse('${note.id}')"
                       style="font-size: 0.8rem; color: var(--text-secondary); cursor: pointer; transition: transform 0.2s; transform: ${isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}; margin-left: 5px;"></i>
                </div>
            </div>
            
            <div id="note-content-${note.id}" style="font-size: 0.9rem; color: var(--text-secondary); white-space: pre-wrap; display: ${isCollapsed ? 'none' : 'block'}; padding-left: 0px; margin-top: 5px;">${note.desc || ''}</div>
        `;
        container.appendChild(div);
    });
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
        const today = new Date();
        const currentDayDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) { dayEl.classList.add('today'); }
        dayEl.innerHTML = `<div class="day-number">${i}</div>`;
        dayEl.addEventListener('click', () => { openDayDetails(currentDayDateStr); });

        // Aggregation for Priority Bar & Count
        let dayTasks = tasks.filter(t => isTaskOnDate(t, currentDayDate));

        // Apply Folder Filter to Calendar Counts
        if (activeFilters.folderId) {
            dayTasks = dayTasks.filter(t => t.parentId === activeFilters.folderId);
        }

        // Apply Main Tag Filter to Calendar Counts
        if (activeFilters.mainTags && activeFilters.mainTags.size > 0) {
            dayTasks = dayTasks.filter(t => {
                if (!t.category) return false;
                const taskTags = t.category.split(',').map(tag => tag.trim());
                return [...activeFilters.mainTags].every(tag => taskTags.includes(tag));
            });
        }

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
    } else if (currentView === 'list') {
        // List: Navigate by Week
        currentDate.setDate(currentDate.getDate() + (delta * 7));
        mainViewRange = 'week';
    } else {
        // Calendar: Navigate by Month
        currentDate.setMonth(currentDate.getMonth() + delta);
        if (currentView !== 'calendar') {
            // Fallback
            mainViewRange = 'month';
        }
    }
    refreshMainView();
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

        // Helper for formatting DD/MM/YY
        const fmt = (d) => {
            const day = d.getDate().toString().padStart(2, '0');
            const mo = (d.getMonth() + 1).toString().padStart(2, '0');
            const yy = d.getFullYear().toString().slice(-2);
            return `${day}/${mo}/${yy}`;
        };

        // Helper for Week Number (ISO 8601ish)
        const getWeek = (d) => {
            const date = new Date(d.getTime());
            date.setHours(0, 0, 0, 0);
            // Thursday in current week decides the year.
            date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
            const week1 = new Date(date.getFullYear(), 0, 4);
            return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        };

        if (rangeType === 'today' && isSystemToday) currentMonthYearEl.textContent = "Hoy";
        else if (rangeType === 'week') {
            // "Semana 1 (del DD/MM/YY al DD/MM/YY)"
            const curWeek = getWeek(loopStart);
            currentMonthYearEl.textContent = `Semana ${curWeek} (del ${fmt(loopStart)} al ${fmt(loopEnd)})`;
        }
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

            // IGNORE SIDEBAR FILTERS (tags, status) for Main View
            // Show all tasks (Pending & Completed) unless deleted/hidden logic?
            // Assuming standard behavior: show everything on date.

            // Removed isFolder check to prevent folders appearing on every day
            // Only show folders if they have a date matching the day

            // Folder Filter (Main View)
            if (activeFilters.folderId) {
                if (t.id !== activeFilters.folderId && t.parentId !== activeFilters.folderId) return false;
            }

            // Tag Filter (Main View - Multi-Select)
            if (activeFilters.mainTags && activeFilters.mainTags.size > 0) {
                if (!t.category) return false;
                const taskTags = t.category.split(',').map(tag => tag.trim());
                if (![...activeFilters.mainTags].every(tag => taskTags.includes(tag))) return false;
            }

            // Standard Task Date Check
            if (!isTaskOnDate(t, dateObj)) return false;

            return true;
        });

        const groupsToRender = [];
        const processedParents = new Set();
        const visibleParents = tasksOnDay.filter(t => !t.parentId);

        visibleParents.forEach(p => {
            // Only show subtasks that are EITHER undated (inherit parent context) OR match this date
            const subs = tasks.filter(t => t.parentId === p.id && (!t.date || isTaskOnDate(t, dateObj)));
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
                    const container = document.createElement('div');
                    container.className = 'task-wrapper';
                    const parentLabel = document.createElement('div'); parentLabel.className = 'parent-indicator';
                    parentLabel.innerHTML = `<i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right:5px;"></i> Subtarea de: <strong>${parent.title}</strong>`;
                    container.appendChild(parentLabel);
                    const subEl = createTaskElement(sub, false, true); subEl.classList.add('orphan-subtask');
                    const fakeContainer = document.createElement('div'); fakeContainer.className = 'subtask-container'; fakeContainer.style.marginLeft = '0'; fakeContainer.style.paddingLeft = '0'; fakeContainer.style.borderLeft = 'none'; fakeContainer.style.marginTop = '0';
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

    // Create Layout Structure (Notes + Header + Container)
    timelineViewEl.innerHTML = `
        <div id="timeline-notes-section" style="margin-bottom: 20px;">
            <div onclick="toggleNotesSection()" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; cursor: pointer;">
                <h3 style="margin: 0; color: var(--text-primary);">Notas</h3>
                <i id="notes-chevron" class="fa-solid fa-chevron-down" style="transition: transform 0.3s;"></i>
            </div>
            
            <div id="notes-collapsible-content" style="display: block;">
                <div class="add-note-form" style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <button onclick="openNoteModal()" class="btn-primary" style="width: 100%; justify-content: center;">
                        <i class="fa-solid fa-plus"></i> Nueva Nota
                    </button>
                </div>

                <div id="timeline-notes-list" style="display: flex; flex-direction: column; gap: 10px;">
                    <!-- Notes injected here -->
                </div>
            </div>
        </div>
        <div id="list-date-header" class="list-header" style="margin-bottom: 15px; text-align: center;"></div>
        <div id="timeline-container" class="timeline-container"></div>
    `;

    // Date Range Setup
    let loopStart, loopEnd;

    // FORCE SINGLE DAY VIEW FOR TIMELINE based on currentDate
    loopStart = new Date(currentDate);
    loopStart.setHours(0, 0, 0, 0);
    loopEnd = new Date(loopStart);

    // Render Notes using the current day
    renderNotes(loopStart);

    // Update Header
    const headerDateStr = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(loopStart);
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
            // CRITICAL: Timeline NO debe filtrar por tags ni carpetas
            // Los filtros solo afectan a task-list (sidebar), NO al timeline
            // El timeline muestra TODAS las sesiones del día actual

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
                // Handle Timeline Comments (fallback for old structure)
                const startStr = (task.sessions && task.sessions[0]) ? task.sessions[0].start : task.date + 'T12:00:00';
                const endStr = (task.sessions && task.sessions[0] && task.sessions[0].end) ? task.sessions[0].end : null;
                dayEvents.push({
                    type: 'comment',
                    start: new Date(startStr),
                    end: endStr ? new Date(endStr) : null,
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
            // Show end time for both sessions and comments
            if (event.end) {
                const endStr = event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                timeHtml += `<div class="time-end-wrapper"><div class="time-end-dot"></div> <span>${endStr}</span></div>`;
            } else if (event.type === 'session') {
                // Only show "..." for sessions without end time (ongoing sessions)
                timeHtml += `<div class="time-end-wrapper" style="opacity:0.5"><div class="time-end-dot" style="background:var(--text-secondary)"></div> <span>...</span></div>`;
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

                // Show duration if end time exists
                if (event.end) {
                    const diffMs = event.end - event.start;
                    const diffMins = Math.max(1, Math.round(diffMs / 60000));
                    meta.textContent = `${typeLabels[event.task.commentType] || 'Comentario'} - Duración: ${diffMins} min`;
                } else {
                    meta.textContent = typeLabels[event.task.commentType] || 'Comentario';
                }
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

                // Conclusiones
                if (event.task.comment_after_end) {
                    const conclusion = document.createElement('div');
                    conclusion.className = 'timeline-conclusion';
                    conclusion.style.fontSize = '0.75rem';
                    conclusion.style.color = 'var(--text-secondary)';
                    conclusion.style.fontStyle = 'italic';
                    conclusion.style.marginTop = '4px';
                    conclusion.textContent = event.task.comment_after_end;
                    contentCol.appendChild(conclusion);
                }
            }

            // Render Tags
            if (event.task.category) {
                const parts = event.task.category.split(',').map(t => t.trim());
                const userTags = parts.filter(t => t !== 'comment' && t !== '|||comment|||' && t !== 'note' && t !== '|||note|||' && !t.includes('|||') && t !== '');

                if (userTags.length > 0) {
                    const tagsContainer = document.createElement('div');
                    tagsContainer.className = 'timeline-event-tags';
                    tagsContainer.style.marginTop = '4px';
                    tagsContainer.style.display = 'flex';
                    tagsContainer.style.flexWrap = 'wrap';
                    tagsContainer.style.gap = '4px';

                    userTags.forEach(tag => {
                        const chip = document.createElement('span');
                        chip.style.fontSize = '0.7rem';
                        chip.style.padding = '2px 6px';
                        chip.style.borderRadius = '10px';
                        chip.style.background = 'var(--hover-bg)';
                        chip.style.color = 'var(--text-secondary)';
                        chip.style.border = '1px solid var(--glass-border)';
                        chip.textContent = tag;
                        tagsContainer.appendChild(chip);
                    });
                    contentCol.appendChild(tagsContainer);
                }
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

    // Update Tag Counts for Timeline Context
    if (typeof updateMainTagFilterOptions === 'function') {
        updateMainTagFilterOptions();
    }
}

// esto esta ok - actualiza todos los displays del timer
function updateTimerDisplay() {
    const timeStr = formatTime(timeLeft);
    document.getElementById('main-timer').textContent = timeStr;
    const miniTimerTime = document.getElementById('mini-timer-time');
    if (miniTimerTime) miniTimerTime.textContent = timeStr;
    const miniTimerDesk = document.getElementById('mini-timer');
    if (miniTimerDesk) miniTimerDesk.textContent = timeStr;
    const miniBtn = document.getElementById('mini-timer-toggle');
    if (miniBtn) { miniBtn.innerHTML = timerInterval ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>'; }
    checkMiniTimerVisibility();
    document.title = `${timeStr} - Ceibo`;
    const circle = document.querySelector('.progress-ring__circle');
    const totalTime = pomodoroState.isBreak ? pomodoroState.breakTime * 60 : pomodoroState.workTime * 60;
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (timeLeft / totalTime) * circumference;
    circle.style.strokeDashoffset = offset;
    const cycleDisplay = document.getElementById('cycle-display');
    if (cycleDisplay && pomodoroState) { cycleDisplay.textContent = `${pomodoroState.cycle}/${pomodoroState.totalCycles} - ${pomodoroState.isBreak ? 'Descanso' : 'Trabajo'}`; }
}

// esto esta ok - control de play/pause del timer
function toggleTimer() {
    if (Notification.permission === 'default') Notification.requestPermission();
    if (isTimerRunning) {
        clearInterval(timerInterval);
        timerInterval = null;
        isTimerRunning = false;
        updatePlayPauseButtons(false);
    } else {
        isTimerRunning = true;
        updatePlayPauseButtons(true);
        timerInterval = setInterval(() => { if (timeLeft > 0) { timeLeft--; updateTimerDisplay(); } else completeCycle(); }, 1000);
    }
}

// esto esta ok - reinicia el timer al estado inicial
function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    isTimerRunning = false;
    timeLeft = (pomodoroState.isBreak ? pomodoroState.breakTime : pomodoroState.workTime) * 60;
    updateTimerDisplay();
    updatePlayPauseButtons(false);
}

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

// esto esta ok - cambia entre ciclos de trabajo y descanso
function changeCycle(direction) {
    if (!pomodoroState) return;
    let totalPhases = pomodoroState.totalCycles * 2;
    let currentPhaseIndex = (pomodoroState.cycle - 1) * 2 + (pomodoroState.isBreak ? 1 : 0);
    let nextPhaseIndex = currentPhaseIndex + direction;
    if (nextPhaseIndex < 0) { nextPhaseIndex = 0; } else if (nextPhaseIndex >= totalPhases) { return; }
    const wasRunning = isTimerRunning;
    if (isTimerRunning) { clearInterval(timerInterval); isTimerRunning = false; updatePlayPauseButtons(false); }
    pomodoroState.cycle = Math.floor(nextPhaseIndex / 2) + 1;
    pomodoroState.isBreak = (nextPhaseIndex % 2) === 1;
    timeLeft = (pomodoroState.isBreak ? pomodoroState.breakTime : pomodoroState.workTime) * 60;
    updateTimerDisplay();
}

function completeCycle() {
    // Only stop interval if we are completely stopping (End of all cycles)
    // Otherwise we just update state and let the interval continue

    timerSound.play().catch(e => console.log('Audio play failed', e));
    if (pomodoroState.isBreak) {
        pomodoroState.isBreak = false; pomodoroState.cycle++;
        if (pomodoroState.cycle > pomodoroState.totalCycles) {
            // STOP EVERYTHING
            clearInterval(timerInterval);
            timerInterval = null;
            isTimerRunning = false;
            updatePlayPauseButtons(false);

            if (activeTaskId && window.updateTaskInFirebase) { const task = tasks.find(t => t.id === activeTaskId); if (task) window.updateTaskInFirebase(task.id, { pomodoros: (task.pomodoros || 0) + pomodoroState.totalCycles }); }
            resetTimer();
            notifyCompletion("¡Todos los ciclos completados!");
            return;
        } else {
            // Auto-start Work Phase
            timeLeft = pomodoroState.workTime * 60;
            const timeStr = formatTime(timeLeft);
            // Message: "XXXX terminado! A continuación 00:00 de XXXXX"
            notifyCompletion(`¡Descanso terminado! A continuación ${timeStr} de Trabajo`);
        }
    } else {
        // Auto-start Break Phase
        pomodoroState.isBreak = true;
        timeLeft = pomodoroState.breakTime * 60;
        const timeStr = formatTime(timeLeft);
        notifyCompletion(`¡Trabajo terminado! A continuación ${timeStr} de Descanso`);
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
    }

    // Blocking Alert (Requested by User)
    // We use setTimeout to allow parsing/UI update to happen first if needed, 
    // though alert halts JS execution, so we want the timer display to update BEFORE the alert blocks.
    setTimeout(() => {
        alert(message);
    }, 50);
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
    // Get current theme colors
    const styles = getComputedStyle(document.documentElement);
    const bgColor = styles.getPropertyValue('--card-bg').trim() || '#18181b';
    const textColor = styles.getPropertyValue('--text-primary').trim() || '#f4f4f5';
    const secondaryColor = styles.getPropertyValue('--text-secondary').trim() || '#a1a1aa';
    const successColor = styles.getPropertyValue('--success-color').trim() || '#22c55e';

    // Background
    pipCtx.fillStyle = bgColor;
    pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);

    // Text - Time
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    pipCtx.fillStyle = textColor;
    pipCtx.font = 'bold 80px sans-serif';
    pipCtx.textAlign = 'center';
    pipCtx.textBaseline = 'middle';
    pipCtx.fillText(timeStr, 150, 120);

    // Text - Phase
    pipCtx.font = '30px sans-serif';
    pipCtx.fillStyle = pomodoroState.isBreak ? successColor : secondaryColor;
    const phaseText = pomodoroState.isBreak ? "Descanso" : "Trabajo";
    pipCtx.fillText(phaseText, 150, 200);

    // Cycle
    pipCtx.font = '20px sans-serif';
    pipCtx.fillStyle = secondaryColor;
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
    if (task && (task.isTimelineComment || task.category === 'comment' || task.category === '|||comment|||')) {
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


// Expose
window.deleteSession = deleteSession;
window.openSessionEditModal = openSessionEditModal;
window.closeSessionEditModal = closeSessionEditModal;
window.saveSessionEdit = saveSessionEdit;

function openSessionEditModal(taskId, sessionIndex) {
    console.log('[DEBUG] openSessionEditModal called for taskId:', taskId, 'sessionIndex:', sessionIndex);
    const task = tasks.find(t => t.id == taskId);
    if (!task || !task.sessions[sessionIndex]) {
        console.log('[DEBUG] Task or session not found');
        return;
    }

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
    document.getElementById('edit-session-conclusion').value = task.comment_after_end || '';

    const modal = document.getElementById('session-edit-modal');
    console.log('[DEBUG] session-edit-modal element:', modal);

    modal.classList.add('active');

    // FIX: Force ALL critical styles via JavaScript to bypass CSS issues
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('opacity', '1', 'important');
    modal.style.setProperty('pointer-events', 'all', 'important');

    console.log('[DEBUG] AFTER setting all styles, values are:', {
        display: modal.style.display,
        opacity: modal.style.opacity,
        pointerEvents: modal.style.pointerEvents
    });

    console.log('[DEBUG] modal classList after add:', modal.classList.toString());
    console.log('[DEBUG] modal computed styles:', {
        display: window.getComputedStyle(modal).display,
        opacity: window.getComputedStyle(modal).opacity,
        zIndex: window.getComputedStyle(modal).zIndex,
        pointerEvents: window.getComputedStyle(modal).pointerEvents
    });

    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        console.log('[DEBUG] modal-content computed styles:', {
            display: window.getComputedStyle(modalContent).display,
            opacity: window.getComputedStyle(modalContent).opacity,
            visibility: window.getComputedStyle(modalContent).visibility
        });
    }
}

function closeSessionEditModal() {
    const modal = document.getElementById('session-edit-modal');
    modal.classList.remove('active');
    // Reset all inline styles to let CSS handle it
    modal.style.display = '';
    modal.style.opacity = '';
    modal.style.pointerEvents = '';
}

function saveSessionEdit() {
    const taskId = document.getElementById('edit-session-task-id').value;
    const idx = parseInt(document.getElementById('edit-session-index').value);
    const startVal = document.getElementById('edit-session-start').value;
    const endVal = document.getElementById('edit-session-end').value;
    const conclusionVal = document.getElementById('edit-session-conclusion').value;

    const task = tasks.find(t => t.id == taskId);
    if (task && task.sessions && task.sessions[idx]) {
        if (startVal) task.sessions[idx].start = new Date(startVal).toISOString();
        if (endVal) task.sessions[idx].end = new Date(endVal).toISOString();
        else task.sessions[idx].end = null;

        task.comment_after_end = conclusionVal;

        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(task.id, {
                sessions: task.sessions,
                comment_after_end: conclusionVal
            });
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
    let endTimeVal = '';
    if (task.sessions && task.sessions.length > 0) {
        const d = new Date(task.sessions[0].start);
        const offset = d.getTimezoneOffset() * 60000;
        timeVal = (new Date(d - offset)).toISOString().slice(0, 16);

        // Load end time if exists
        if (task.sessions[0].end) {
            const dEnd = new Date(task.sessions[0].end);
            endTimeVal = (new Date(dEnd - offset)).toISOString().slice(0, 16);
        }
    }
    document.getElementById('comment-time').value = timeVal;
    document.getElementById('comment-end-time').value = endTimeVal;

    // Extract User Tags
    const tagsInput = document.getElementById('comment-tags');
    if (tagsInput) {
        let userTags = '';
        if (task.category) {
            // Remove system tags
            const parts = task.category.split(',').map(t => t.trim());
            const filtered = parts.filter(t => t !== 'comment' && t !== '|||comment|||' && t !== 'note' && t !== '|||note|||' && !t.includes('|||'));
            userTags = filtered.join(', ');
        }
        tagsInput.value = userTags;
    }

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
    const endTimeVal = document.getElementById('comment-end-time').value;
    const editId = document.getElementById('comment-edit-id').value;
    const tagsInput = document.getElementById('comment-tags');

    if (!text) return alert('Escribe un comentario');
    if (!timeVal) return alert('Selecciona una hora');

    // Combine Tags
    let finalCategory = '|||comment|||';
    if (tagsInput && tagsInput.value.trim() !== '') {
        const userTags = tagsInput.value.replace(/\|\|\|/g, '').split(',').map(t => t.trim()).filter(t => t !== '');
        if (userTags.length > 0) {
            finalCategory += ', ' + userTags.join(', ');
        }
    }

    const datePart = timeVal.split('T')[0];

    // Build session object with end time if provided
    const sessionObj = {
        start: new Date(timeVal).toISOString(),
        end: endTimeVal ? new Date(endTimeVal).toISOString() : null
    };

    if (editId) {
        // UPDATE
        const updateData = {
            title: text,
            category: finalCategory,
            commentType: type,
            date: datePart,
            sessions: [sessionObj]
        };
        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(editId, updateData);
        }
    } else {
        // CREATE
        const newComment = {
            title: text,
            category: finalCategory,
            commentType: type,
            isTimelineComment: true,
            date: datePart,
            status: 'completed',
            sessions: [sessionObj],
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

// Sidebar & Resizer Logic
function setupSidebar() {
    const appContainer = document.getElementById('app-container');
    const sidebar = document.querySelector('.sidebar');
    const resizer = document.getElementById('resizer');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const expandBtn = document.getElementById('sidebar-expand-btn');

    if (!appContainer || !sidebar || !resizer || !collapseBtn || !expandBtn) return;

    // --- Resizing ---
    let isResizing = false;
    let lastWidth = 350; // Default

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        e.preventDefault(); // Prevent text selection
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        let newWidth = e.clientX;
        // Limits
        if (newWidth < 50) newWidth = 50;
        if (newWidth > 600) newWidth = 600;

        appContainer.style.gridTemplateColumns = `${newWidth}px 1fr`;
        lastWidth = newWidth;
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = '';
        }
    });

    // --- Collapse/Expand ---
    collapseBtn.addEventListener('click', () => {
        // Collapse: Hide sidebar completely and make main content full width
        appContainer.style.gridTemplateColumns = '1fr';
        sidebar.style.display = 'none';
        expandBtn.style.display = 'block';
    });

    expandBtn.addEventListener('click', () => {
        // Expand: Restore grid and sidebar
        appContainer.style.gridTemplateColumns = `${lastWidth}px 1fr`;
        sidebar.style.display = 'flex';
        expandBtn.style.display = 'none';
    });
    // --- Settings Modal Logic ---
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings');
    const settingsTabBtns = document.querySelectorAll('.settings-tabs-container .tab-btn');
    const settingsTabContents = document.querySelectorAll('.settings-tab-content');

    if (settingsBtn && settingsModal && closeSettingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('active');
            if (typeof populateExportFilters === 'function') {
                populateExportFilters();
            }
        });

        // Duplicate settings button for mobile header
        const settingsBtnDup = document.querySelector('.settings-btn-dup');
        if (settingsBtnDup) {
            settingsBtnDup.addEventListener('click', () => {
                settingsModal.classList.add('active');
                if (typeof populateExportFilters === 'function') {
                    populateExportFilters();
                }
            });
        }

        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('active');
        });

        // Close on outside click
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('active');
            }
        });

        // Tab Switching
        settingsTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons and contents
                settingsTabBtns.forEach(b => b.classList.remove('active'));
                settingsTabContents.forEach(c => {
                    c.style.display = 'none';
                    c.classList.remove('active');
                });

                // Activate clicked button and corresponding content
                btn.classList.add('active');
                const tabId = btn.getAttribute('data-tab');
                const content = document.getElementById(`tab-${tabId}`);
                if (content) {
                    content.style.display = 'block';
                    content.classList.add('active');
                }
            });
        });

        // Theme Selector Logic
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            // Load saved theme
            const savedTheme = localStorage.getItem('pompla_theme') || 'default';
            themeSelect.value = savedTheme;
            loadTheme(savedTheme);

            themeSelect.addEventListener('change', (e) => {
                const theme = e.target.value;
                loadTheme(theme);
                localStorage.setItem('pompla_theme', theme);
            });
        }
    }

} // End of Main Wrapper

async function loadTheme(themeName) {
    try {
        const response = await fetch(`temas/tema_${themeName}.json`);
        if (!response.ok) throw new Error('Theme not found');
        const themeData = await response.json();

        for (const [key, value] of Object.entries(themeData)) {
            document.documentElement.style.setProperty(key, value);
        }
    } catch (error) {
        console.error('Error loading theme:', error);
    }
}

// esto esta ok - función unificada para todos los toggles colapsables
function toggleCollapsible(contentId, chevronId, containerId = null) {
    const content = document.getElementById(contentId);
    const chevron = document.getElementById(chevronId);
    const container = containerId ? document.getElementById(containerId) : null;

    if (!content || !chevron) return;

    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    if (container) container.style.display = isHidden ? 'block' : 'none';
    chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
}

// Wrappers para compatibilidad - esto esta ok
function toggleNotesSection() {
    toggleCollapsible('notes-collapsible-content', 'notes-chevron', 'timeline-container');
}
window.toggleNotesSection = toggleNotesSection;

function toggleDailyGoalWidget() {
    toggleCollapsible('daily-goal-content', 'daily-goal-chevron');
}
window.toggleDailyGoalWidget = toggleDailyGoalWidget;

function toggleMobileDailyGoalWidget() {
    toggleCollapsible('mobile-daily-goal-content', 'mobile-daily-goal-chevron');
}
window.toggleMobileDailyGoalWidget = toggleMobileDailyGoalWidget;


function toggleNoteCollapse(id) {
    const note = tasks.find(t => t.id === id);
    if (!note) return;
    note.isCollapsed = !note.isCollapsed;
    renderNotes(currentDate);
}

window.toggleNoteCollapse = toggleNoteCollapse;

function updateTagSuggestions(inputValue) {
    const container = document.getElementById('category-suggestions');
    if (!container) return;
    container.innerHTML = '';

    // 1. Get all unique tags and counts
    const tagCounts = {};
    tasks.forEach(task => {
        if (!task.category) return;
        if (task.category.includes('|||')) return; // Ignore system tags in suggestions
        if (task.category === 'comment' || task.category === 'note') return; // Ignore legacy system tags

        task.category.split(',').forEach(t => {
            const tag = t.trim();
            if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });

    // 2. Determine Scope (Current tag being typed)
    const tags = inputValue.split(',');
    const currentTagIndex = tags.length - 1;
    let currentSegment = tags[currentTagIndex];
    if (currentSegment) currentSegment = currentSegment.trim();
    else currentSegment = '';

    const existingInputTags = new Set(tags.map(t => t.trim().toLowerCase()).filter((t, i) => i !== currentTagIndex && t !== ''));

    // 3. Filter Candidates
    let candidates = Object.keys(tagCounts);

    if (currentSegment === '') {
        // Show Top 5
        candidates.sort((a, b) => tagCounts[b] - tagCounts[a]);
        candidates = candidates.slice(0, 5);
    } else {
        // Search
        const lowerSeg = currentSegment.toLowerCase();
        candidates = candidates.filter(tag => tag.toLowerCase().includes(lowerSeg));

        candidates.sort((a, b) => {
            const aStarts = a.toLowerCase().startsWith(lowerSeg);
            const bStarts = b.toLowerCase().startsWith(lowerSeg);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return tagCounts[b] - tagCounts[a];
        });
    }

    // Filter out already used
    candidates = candidates.filter(tag => !existingInputTags.has(tag.toLowerCase()));

    // 4. Render
    if (candidates.length === 0) return;

    candidates.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'tag-chip';
        btn.style.fontSize = '0.75rem';
        btn.style.padding = '2px 8px';
        btn.style.cursor = 'pointer';
        btn.type = 'button';
        btn.textContent = tag;

        btn.onclick = () => {
            // Replace current segment with tag
            // Preserve previous tags
            tags[currentTagIndex] = ' ' + tag;
            const newValue = tags.join(',') + ', ';
            const input = document.getElementById('task-category');
            if (input) {
                input.value = newValue;
                input.focus();
                // Trigger update again to show defaults or next suggestion
                updateTagSuggestions(newValue);
            }
        };
        container.appendChild(btn);
    });
}
window.updateTagSuggestions = updateTagSuggestions;
