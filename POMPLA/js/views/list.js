import { state } from '../state.js';
import { isTaskOnDate } from '../utils.js';
import { createTaskElement } from './ui-helpers.js';

export function renderListView(rangeType = 'month', startDate = null, endDate = null) {
    const listViewEl = document.getElementById('list-view');
    const currentMonthYearEl = document.getElementById('current-month-year');

    if (!listViewEl || !currentMonthYearEl) return;

    listViewEl.innerHTML = '';

    // Aplicar densidad visual actual
    if (state.listDensity) {
        listViewEl.classList.remove('normal', 'compact', 'large');
        listViewEl.classList.add(state.listDensity);
    }

    // 1. Determinar el rango del bucle
    let loopStart, loopEnd;
    const currentDate = state.currentDate;

    // Helpers locales de formato
    const fmt = (d) => {
        const day = d.getDate().toString().padStart(2, '0');
        const mo = (d.getMonth() + 1).toString().padStart(2, '0');
        const yy = d.getFullYear().toString().slice(-2);
        return `${day}/${mo}/${yy}`;
    };

    const getWeek = (d) => {
        const date = new Date(d.getTime());
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
        const week1 = new Date(date.getFullYear(), 0, 4);
        return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    };

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

        if (rangeType === 'today' && isSystemToday) {
            currentMonthYearEl.textContent = "Hoy";
        } else if (rangeType === 'week') {
            const curWeek = getWeek(loopStart);
            currentMonthYearEl.textContent = `Semana ${curWeek} (del ${fmt(loopStart)} al ${fmt(loopEnd)})`;
        } else {
            currentMonthYearEl.textContent = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', day: 'numeric' }).format(loopStart);
        }
    } else {
        // Fallback
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        loopStart = new Date(year, month, 1);
        loopEnd = new Date(year, month + 1, 0);
    }

    // 2. Generar lista de fechas
    const sortedDates = [];
    let d = new Date(loopStart);
    while (d <= loopEnd) {
        sortedDates.push(d.toISOString().split('T')[0]);
        d.setDate(d.getDate() + 1);
    }

    // 3. Renderizar cada día
    sortedDates.forEach(dateStr => {
        const dateObj = new Date(dateStr + 'T00:00:00');

        // Filtrar tareas para este día
        const tasksOnDay = state.tasks.filter(t => {
            if (t.isTimelineComment || (t.category && t.category.includes('comment'))) return false;

            // Filtro Carpeta (Main View)
            if (state.activeFilters.folderId) {
                if (t.id !== state.activeFilters.folderId && t.parentId !== state.activeFilters.folderId) return false;
            }

            // Filtro Tags (Main View - Multi-Select)
            if (state.activeFilters.mainTags && state.activeFilters.mainTags.size > 0) {
                if (!t.category) return false;
                const taskTags = t.category.split(',').map(tag => tag.trim());
                if (![...state.activeFilters.mainTags].every(tag => taskTags.includes(tag))) return false;
            }

            // Check Fecha Estándar
            if (!isTaskOnDate(t, dateObj)) return false;

            return true;
        });

        // Agrupar (Padres vs Huérfanos)
        const groupsToRender = [];
        const processedParents = new Set();
        const visibleParents = tasksOnDay.filter(t => !t.parentId);

        visibleParents.forEach(p => {
            // Mostrar hijos que coinciden con la fecha O que no tienen fecha (heredan contexto)
            const subs = state.tasks.filter(t => t.parentId === p.id && (!t.date || isTaskOnDate(t, dateObj)));
            groupsToRender.push({ type: 'wrapper', parent: p, children: subs });
            processedParents.add(p.id);
        });

        const visibleSubtasks = tasksOnDay.filter(t => t.parentId);
        visibleSubtasks.forEach(sub => {
            if (!processedParents.has(sub.parentId)) {
                const parent = state.tasks.find(t => t.id === sub.parentId);
                if (parent) {
                    groupsToRender.push({ type: 'orphan-context', parent: parent, subtask: sub });
                }
            }
        });

        // Crear Elemento de Grupo (Día)
        const group = document.createElement('div');
        group.className = 'list-date-group';

        // Header del Día
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

        // Contenido del Día
        const content = document.createElement('div');
        content.className = 'list-date-content';

        header.onclick = () => {
            if (content.style.display === 'none') {
                content.style.display = 'block';
                chevron.style.transform = 'rotate(0deg)';
                group.dataset.collapsed = 'false';
            } else {
                content.style.display = 'none';
                chevron.style.transform = 'rotate(-90deg)';
                group.dataset.collapsed = 'true';
            }
        };

        if (groupsToRender.length === 0) {
            content.innerHTML = '<div style="padding:10px; color:var(--glass-border); font-style:italic; font-size:0.9rem;">Sin tareas</div>';
            content.style.display = 'none';
            chevron.style.transform = 'rotate(-90deg)';
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
                        if (!state.expandedTasks.has(parent.id)) {
                            subContainer.classList.add('hidden');
                            const btn = taskEl.querySelector('.btn-toggle-subtasks');
                            if (btn) btn.classList.add('rotate');
                        }

                        subtasksAll.forEach(sub => {
                            subContainer.appendChild(createTaskElement(sub, false, true));
                        });
                        wrapper.appendChild(subContainer);
                    }
                    content.appendChild(wrapper);

                } else if (g.type === 'orphan-context') {
                    const parent = g.parent;
                    const sub = g.subtask;

                    const container = document.createElement('div');
                    container.className = 'task-wrapper';

                    const parentLabel = document.createElement('div');
                    parentLabel.className = 'parent-indicator';
                    parentLabel.innerHTML = `<i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right:5px;"></i> Subtarea de: <strong>${parent.title}</strong>`;
                    container.appendChild(parentLabel);

                    const subEl = createTaskElement(sub, false, true);
                    subEl.classList.add('orphan-subtask');

                    const fakeContainer = document.createElement('div');
                    fakeContainer.className = 'subtask-container';
                    fakeContainer.style.marginLeft = '0';
                    fakeContainer.style.paddingLeft = '0';
                    fakeContainer.style.borderLeft = 'none';
                    fakeContainer.style.marginTop = '0';

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