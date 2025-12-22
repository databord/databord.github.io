import { state } from '../state.js';
import { isTaskOnDate } from '../utils.js';
import { openModal, createTaskElement } from './ui-helpers.js';
import { closeDayDetails } from '../modal-handler.js';

export function renderCalendar() {
    const calendarGridEl = document.getElementById('calendar-grid');
    const currentMonthYearEl = document.getElementById('current-month-year');

    if (!calendarGridEl || !currentMonthYearEl) return;

    const currentDate = state.currentDate;
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
        let dayTasks = state.tasks.filter(t => isTaskOnDate(t, currentDayDate));

        // Apply Folder Filter to Calendar Counts
        if (state.activeFilters.folderId) {
            dayTasks = dayTasks.filter(t => t.parentId === state.activeFilters.folderId);
        }

        // Apply Main Tag Filter to Calendar Counts
        if (state.activeFilters.mainTags && state.activeFilters.mainTags.size > 0) {
            dayTasks = dayTasks.filter(t => {
                if (!t.category) return false;
                const taskTags = t.category.split(',').map(tag => tag.trim());
                return [...state.activeFilters.mainTags].every(tag => taskTags.includes(tag));
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

export function openDayDetails(dateStr) {
    const modal = document.getElementById('day-details-modal');
    const title = document.getElementById('day-details-title');
    const body = document.getElementById('day-details-body');
    const btnAdd = document.getElementById('btn-add-task-on-day');

    if (!modal) return;

    const dateObj = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    title.textContent = dateObj.toLocaleDateString('es-ES', options);
    body.innerHTML = '';

    // Filtrar tareas para este día específico
    let dayTasks = state.tasks.filter(t => {
        if (!isTaskOnDate(t, dateObj)) return false;
        // Excluir comentarios y notas
        if (t.isTimelineComment || (t.category && (t.category.includes('|||comment') || t.category.includes('|||note')))) return false;
        return true;
    });

    // Aplicar Filtro de Carpeta (si está activo en el sidebar)
    if (state.activeFilters.folderId) {
        dayTasks = dayTasks.filter(t => t.parentId === state.activeFilters.folderId);
    }

    // Aplicar Filtro de Tags Principales
    if (state.activeFilters.mainTags && state.activeFilters.mainTags.size > 0) {
        dayTasks = dayTasks.filter(t => {
            if (!t.category) return false;
            const taskTags = t.category.split(',').map(tag => tag.trim());
            return [...state.activeFilters.mainTags].every(tag => taskTags.includes(tag));
        });
    }

    if (dayTasks.length === 0) {
        body.innerHTML = '<p style="text-align:center; color:var(--text-secondary); margin-top:20px;">No hay tareas para este día.</p>';
    } else {
        dayTasks.forEach(task => {
            const item = document.createElement('div');
            item.className = 'task-item';
            // Usamos false para hasSubtasks e isSubtask porque en esta vista simplificada no expandimos
            const taskEl = createTaskElement(task, false, false);

            // Ocultar toggle de subtareas en esta vista
            const toggle = taskEl.querySelector('.btn-toggle-subtasks');
            if (toggle) toggle.style.visibility = 'hidden';

            item.appendChild(taskEl);
            body.appendChild(taskEl);
        });
    }

    // Configurar botón "Añadir tarea aquí"
    if (btnAdd) {
        btnAdd.onclick = () => {
            closeDayDetails();
            openModal(); // Función interna de ui-helpers
            const dateInput = document.getElementById('task-date');
            if (dateInput) dateInput.value = dateStr;
        };
    }

    modal.classList.add('active');

    // Fix de estilos (Legacy support)
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('opacity', '1', 'important');
    modal.style.setProperty('pointer-events', 'none', 'important');

    setTimeout(() => {
        modal.style.setProperty('pointer-events', 'all', 'important');
    }, 100);
}

