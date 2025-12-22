// js/data.js
import { state } from './state.js';
import { getTodayDate, isTaskOnDate } from './utils.js';

// IMPORTANTE: Estas funciones las crearemos en el siguiente paso (Vistas).
// Por ahora, el IDE podría marcar error, pero se solucionará al crear los archivos de views.
import { renderTasks } from './views/sidebar.js';
import { renderCalendar } from './views/calendar.js';
import { renderListView } from './views/list.js';
import { renderTimeline } from './views/timeline.js';
import { updateParentSelect } from './views/ui-helpers.js'; //

// --- LOGICA PRINCIPAL DE DATOS ---

// Esta función sustituye a window.recibirTareasDeFirebase
export function receiveTasks(downloadedTasks) {
    // 1. Actualizar State Global
    state.tasks = downloadedTasks.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : Infinity;
        const orderB = b.order !== undefined ? b.order : Infinity;
        return orderA - orderB;
    });

    // 2. Re-aplicar lógica de UI
    if (state.currentView === 'calendar') renderCalendar();

    applyFilters(); // Esto actualizará la sidebar y refrescará la vista principal

    // 3. Actualizar Widgets
    updateParentSelect(); // (Nota: Necesitamos mover esta función a ui-helpers.js o similar)
    renderCategoryTags();
    updateFolderFilterOptions();
    updateMainTagFilterOptions();
    updateDailyGoalUI();
}

// --- LOGICA DE FILTRADO (SIDEBAR) ---

export function applyFilters() {
    const filters = state.activeFilters;

    // 1. Sincronizar UI de Filtros (Selects y Botones)
    const dateSelect = document.getElementById('filter-date-range');
    if (dateSelect) dateSelect.value = filters.dateRange;

    const mobileDateSelect = document.getElementById('mobile-filter-date-range');
    if (mobileDateSelect) mobileDateSelect.value = filters.dateRange;

    // Actualizar clases de Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        if (filters.tags.has(chip.textContent)) chip.classList.add('active');
        else chip.classList.remove('active');
    });

    // Actualizar icono de estado
    updateFilterButtonIcon();

    // 2. Determinar Rango de Fechas para el Sidebar
    let start = null, end = null;
    const today = getTodayDate();

    if (filters.dateRange === 'today') {
        start = new Date(today); end = new Date(today);
    } else if (filters.dateRange === 'tomorrow') {
        start = new Date(today); start.setDate(today.getDate() + 1);
        end = new Date(start);
    } else if (filters.dateRange === 'yesterday') {
        start = new Date(today); start.setDate(today.getDate() - 1);
        end = new Date(start);
    } else if (filters.dateRange === 'month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (filters.dateRange === 'week') {
        const day = today.getDay();
        start = new Date(today); start.setDate(today.getDate() - day); // Domingo
        end = new Date(start); end.setDate(end.getDate() + 6); // Sábado
    } else if (filters.dateRange === 'custom' && filters.customStart) {
        if (filters.customStart) start = new Date(filters.customStart + 'T00:00:00');
        if (filters.customEnd) end = new Date(filters.customEnd + 'T00:00:00');
    }

    // 3. Filtrar Tareas (Sidebar Only)
    const filteredTasks = state.tasks.filter(task => {
        // Excluir comentarios/notas del sistema
        if (task.category && (task.category.includes('|||comment') || task.category.includes('|||note'))) return false;

        // Filtro Tags
        if (filters.tags.size > 0) {
            if (!task.category) return false;
            const taskTags = task.category.split(',').map(t => t.trim());
            if (![...filters.tags].every(tag => taskTags.includes(tag))) return false;
        }

        // Filtro Carpeta (Folder)
        const isFolder = !!task.isFolder || (!task.date && !!task.color);
        // Si hay filtro de carpeta activo
        if (filters.folderId && task.parentId !== filters.folderId && task.id !== filters.folderId) return false;

        // Filtro Status
        if (filters.status === 'completed' && task.status !== 'completed') return false;
        if (filters.status === 'pending' && task.status === 'completed') return false;

        // Filtro Fechas (Solo si no es 'all')
        if (filters.dateRange === 'all') return true;
        if (filters.dateRange === 'custom' && (!start || !end)) return true;

        // Optimización de fechas
        if (start && end) {
            // Range check logic simplificada
            let d = new Date(start);
            while (d <= end) {
                if (isTaskOnDate(task, d)) return true;
                d.setDate(d.getDate() + 1);
            }
            return false;
        }

        // Si llegamos aqui y hay filtro de fecha activo pero no coincidió
        if (filters.dateRange !== 'all') return false;

        return true;
    });

    // Renderizar Sidebar
    renderTasks(filteredTasks);

    // Refrescar Vista Principal (Independiente de los filtros del sidebar, excepto mainTags/Folder)
    refreshMainView();

    // Actualizar conteos de tags
    renderCategoryTags();

    // Visibilidad botón Reset
    checkResetButtonVisibility();
}

// --- CONTROLADOR DE VISTAS ---

export function refreshMainView() {
    const today = getTodayDate();

    if (state.currentView === 'timeline') {
        renderTimeline('today'); // Siempre usa state.currentDate internamente
        renderCategoryTags();
    } else if (state.currentView === 'list') {
        if (state.activeFilters.dateRange === 'custom' && state.activeFilters.customStart) {
            const start = new Date(state.activeFilters.customStart + 'T00:00:00');
            const end = new Date(state.activeFilters.customEnd + 'T00:00:00');
            renderListView('custom', start, end);
        } else if (state.mainViewRange === 'week') {
            const day = state.currentDate.getDay();
            const start = new Date(state.currentDate); start.setDate(start.getDate() - day);
            const end = new Date(start); end.setDate(end.getDate() + 6);
            renderListView('week', start, end);
        } else {
            renderListView(state.mainViewRange); // 'month' default
        }
    } else if (state.currentView === 'calendar') {
        renderCalendar();
    }
}

// --- UI HELPERS PARA FILTROS Y ESTADISTICAS ---

function updateFilterButtonIcon() {
    const status = state.activeFilters.status;
    const btns = [document.getElementById('filter-completed'), document.getElementById('mobile-filter-completed')];

    btns.forEach(btn => {
        if (!btn) return;
        btn.classList.remove('active');
        if (status === 'all') {
            btn.innerHTML = '<i class="fa-solid fa-layer-group"></i>';
        } else if (status === 'pending') {
            btn.innerHTML = '<i class="fa-regular fa-square"></i>';
            btn.classList.add('active');
        } else if (status === 'completed') {
            btn.innerHTML = '<i class="fa-solid fa-check-double"></i>';
            btn.classList.add('active');
        }
    });
}

function checkResetButtonVisibility() {
    const f = state.activeFilters;
    const isDefault = f.dateRange === 'today' && f.tags.size === 0 && f.status === 'all' && !f.folderId && f.mainTags.size === 0;

    const els = [document.getElementById('filter-reset'), document.getElementById('mobile-filter-reset')];
    els.forEach(el => {
        if (el) isDefault ? el.classList.add('hidden') : el.classList.remove('hidden');
    });
}

// --- LOGICA DE OBJETIVOS DIARIOS ---

export function updateDailyGoalUI() {
    const today = getTodayDate();
    const isToday = (t) => isTaskOnDate(t, today);

    // Filtrar completadas hoy
    const completedTodayCount = state.tasks.filter(t =>
        t.status === 'completed' && isToday(t) && !t.category?.includes('|||comment')
    ).length;

    // Filtrar pendientes hoy
    const pendingTodayCount = state.tasks.filter(t =>
        t.status !== 'completed' && isToday(t) && !t.category?.includes('|||comment')
    ).length;

    const totalToday = completedTodayCount + pendingTodayCount;

    // Update DOM (Desktop & Mobile)
    const progressBar = document.getElementById('goal-progress-bar');
    const percentage = state.dailyGoal > 0 ? Math.min(100, (completedTodayCount / state.dailyGoal) * 100) : 0;

    if (progressBar) progressBar.style.width = `${percentage}%`;

    // Textos
    setSafeText('goal-progress-text', `${completedTodayCount}/${state.dailyGoal} completadas`);
    setSafeText('today-total-text', `${totalToday} total hoy`);
    setSafeText('pending-tasks-count', `${pendingTodayCount} pendientes`);
    setSafeText('mobile-pending-tasks-count', `${pendingTodayCount} pendientes`);
    setSafeText('mobile-goal-progress', `${completedTodayCount}/${state.dailyGoal}`);

    const mobBar = document.getElementById('mobile-goal-bar');
    if (mobBar) mobBar.style.width = `${percentage}%`;

    // Confetti
    if (completedTodayCount >= state.dailyGoal && !state.confettiTriggeredToday && completedTodayCount > 0) {
        import('./views/ui-helpers.js').then(module => {
            if (module.triggerConfetti) module.triggerConfetti();
        }).catch(e => console.log("Confetti module not loaded yet"));
        state.confettiTriggeredToday = true;
    } else if (completedTodayCount < state.dailyGoal) {
        state.confettiTriggeredToday = false;
    }

    updateDailyStatsUI(totalToday, pendingTodayCount, today);
}

function updateDailyStatsUI(totalToday, pendingTodayCount, today) {
    // Calculo de porcentajes de prioridad
    const pendingTasks = state.tasks.filter(t => t.status !== 'completed' && isTaskOnDate(t, today));
    const totalPending = pendingTasks.length;

    const getPct = (priority) => {
        const count = pendingTasks.filter(t => t.priority === priority).length;
        return totalPending > 0 ? Math.round((count / totalPending) * 100) : 0;
    };

    const completedCount = totalToday - pendingTodayCount;
    const completedPct = totalToday > 0 ? Math.round((completedCount / totalToday) * 100) : 0;

    setSafeText('stats-high', `${getPct('high')}%`);
    setSafeText('stats-medium', `${getPct('medium')}%`);
    setSafeText('stats-low', `${getPct('low')}%`);
    setSafeText('stats-completed-percent', `${completedPct}%`);

    // Mobile counterparts
    setSafeText('mobile-stats-high', `${getPct('high')}%`);
    setSafeText('mobile-stats-medium', `${getPct('medium')}%`);
    setSafeText('mobile-stats-low', `${getPct('low')}%`);
    setSafeText('mobile-stats-completed-percent', `${completedPct}%`);
}

// Helper simple para evitar errores si el elemento no existe en esta vista
function setSafeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Placeholder para funciones que interactúan con DOM complejo
// Estas se pueden mover a sus propios módulos UI o quedarse aquí si son pequeñas
// --- FUNCIONES UI DE FILTROS (Adaptadas de script.js 337-552) ---

export function renderCategoryTags() {
    const desktopContainer = document.getElementById('category-tags-container');
    const mobileContainer = document.getElementById('mobile-category-tags-container');

    // 1. Calcular conteos basados en el contexto actual
    const tagCounts = {};

    // Usamos state.tasks y state.activeFilters
    const visibleTasksContext = state.tasks.filter(task => {
        // Excluir comentarios y notas
        if (task.isTimelineComment || (task.category && (task.category.includes('|||comment') || task.category.includes('|||note')))) return false;

        // Filtro Status
        if (state.activeFilters.status === 'completed' && !task.completed) return false;
        if (state.activeFilters.status === 'pending' && task.completed) return false;

        // Filtro Date Range
        if (state.activeFilters.dateRange !== 'all') {
            const today = getTodayDate(); // Importada de utils.js

            const checkDate = (d) => {
                if (!d) return false;
                const tDate = new Date(d + 'T00:00:00');
                if (state.activeFilters.dateRange === 'today') return tDate.getTime() === today.getTime();
                if (state.activeFilters.dateRange === 'tomorrow') {
                    const tmrw = new Date(today); tmrw.setDate(today.getDate() + 1);
                    return tDate.getTime() === tmrw.getTime();
                }
                if (state.activeFilters.dateRange === 'yesterday') {
                    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
                    return tDate.getTime() === yest.getTime();
                }

                // Lógica simplificada para rangos mayores (copiada del original)
                const taskDate = new Date(d + 'T00:00:00');
                if (state.activeFilters.dateRange === 'week') {
                    const startOfWeek = new Date(today);
                    startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Lunes
                    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);
                    return taskDate >= startOfWeek && taskDate <= endOfWeek;
                }
                if (state.activeFilters.dateRange === 'month') {
                    return taskDate.getMonth() === today.getMonth() && taskDate.getFullYear() === today.getFullYear();
                }
                if (state.activeFilters.dateRange === 'last-month') {
                    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    return taskDate.getMonth() === lastMonth.getMonth() && taskDate.getFullYear() === lastMonth.getFullYear();
                }
                return false;
            };

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

    const sortedCategories = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);

    const fillContainer = (container, isMobile) => {
        if (!container) return;
        container.innerHTML = '';

        // Botón Volver
        const backBtn = document.createElement('button');
        backBtn.className = 'tag-chip';
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

            // Usamos state.activeFilters
            if (state.activeFilters.tags.has(cat)) chip.classList.add('active');

            chip.textContent = `${cat} (${count})`;
            chip.addEventListener('click', () => {
                if (state.activeFilters.tags.has(cat)) state.activeFilters.tags.delete(cat);
                else state.activeFilters.tags.add(cat);
                applyFilters(); // Llamada a la función exportada en este mismo archivo
            });
            container.appendChild(chip);
        });
    };

    fillContainer(desktopContainer, false);
    fillContainer(mobileContainer, true);
}

export function updateFolderFilterOptions() {
    const btn = document.getElementById('filter-folder-btn');
    const dropdown = document.getElementById('filter-folder-dropdown');
    const span = document.getElementById('filter-folder-text');

    if (!btn || !dropdown) return;

    btn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
    };

    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    dropdown.innerHTML = '';

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
            state.activeFilters.folderId = id; // Actualizar State
            updateBtnText();
            applyFilters();
            dropdown.style.display = 'none';
        };
        dropdown.appendChild(row);
    };

    addOption(null, 'Todas las Carpetas', !state.activeFilters.folderId);

    // Filtrar carpetas desde state.tasks
    const folders = state.tasks.filter(t => !!t.isFolder || (!t.date && !!t.color));

    folders.forEach(f => {
        addOption(f.id, f.title, state.activeFilters.folderId === f.id);
    });

    function updateBtnText() {
        if (!state.activeFilters.folderId) {
            span.innerHTML = '<i class="fa-solid fa-folder-open"></i>';
        } else {
            const f = state.tasks.find(t => t.id === state.activeFilters.folderId);
            span.textContent = f ? f.title : "Carpeta";
        }
    }
    updateBtnText();
}

export function updateMainTagFilterOptions() {
    const btn = document.getElementById('filter-tag-main-btn');
    const dropdown = document.getElementById('filter-tag-main-dropdown');
    const span = document.getElementById('filter-tag-main-text');

    if (!btn || !dropdown) return;

    btn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
    };

    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    const tagCounts = {};
    let tasksToCount = state.tasks;

    if (state.currentView === 'timeline') {
        const timelineDate = new Date(state.currentDate);
        timelineDate.setHours(0, 0, 0, 0);

        tasksToCount = state.tasks.filter(task => {
            if (isTaskOnDate(task, timelineDate)) return true; // Usamos helper importado

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
                if (tag && !tag.includes('|||') && tag !== 'comment' && tag !== 'note') {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                }
            });
        }
    });

    const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
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

        row.onmouseover = () => row.style.background = 'rgba(255,255,255,0.05)';
        row.onmouseout = () => row.style.background = 'transparent';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = tag;
        checkbox.style.marginRight = '8px';
        checkbox.checked = state.activeFilters.mainTags.has(tag);

        const label = document.createElement('span');
        label.textContent = `${tag} (${tagCounts[tag]})`;
        label.style.fontSize = '0.9rem';
        label.style.color = 'var(--text-primary)';

        row.appendChild(checkbox);
        row.appendChild(label);

        row.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }

            if (checkbox.checked) {
                state.activeFilters.mainTags.add(tag);
            } else {
                state.activeFilters.mainTags.delete(tag);
            }

            updateBtnText();
            applyFilters();
        });

        dropdown.appendChild(row);
    });

    function updateBtnText() {
        if (state.activeFilters.mainTags.size === 0) {
            span.innerHTML = '<i class="fa-solid fa-tag"></i>';
        } else if (state.activeFilters.mainTags.size === 1) {
            span.textContent = Array.from(state.activeFilters.mainTags)[0];
        } else {
            span.textContent = `${state.activeFilters.mainTags.size} seleccionadas`;
        }
    }
    updateBtnText();
}

// --- Fim de data.js ---