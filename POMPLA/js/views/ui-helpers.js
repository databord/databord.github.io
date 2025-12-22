import { state, ICONS } from '../state.js';
import { isTaskOnDate } from '../utils.js';

// --- VARIABLES LOCALES PARA DRAG & DROP (TOUCH) ---
let touchTimer = null;
let touchDragItem = null;
let touchClone = null;
let touchStartX = 0;
let touchStartY = 0;
let touchOffsetX = 0;
let touchOffsetY = 0;

// --- GESTIÓN DEL MODAL DE TAREAS ---

export function openModal(editId = null) {
    const modal = document.getElementById('task-modal');
    const taskForm = document.getElementById('task-form');

    modal.classList.add('active');

    if (editId) {
        const task = state.tasks.find(t => t.id === editId);
        if (!task) return; // Seguridad

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

        // Icon Logic
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

        // Disparar evento change manual si es necesario
        // iconSelect.dispatchEvent(new Event('change')); 

        // Pomodoro Settings
        const settings = task.pomodoroSettings || { cycles: 1, work: 25, break: 5 };
        document.getElementById('pomo-cycles').value = settings.cycles;
        document.getElementById('pomo-work').value = settings.work;
        document.getElementById('pomo-break').value = settings.break;

        // Folder Logic
        const isFolder = !!task.isFolder || (!task.date && !!task.color);
        const folderCheck = document.getElementById('task-is-folder');
        folderCheck.checked = isFolder;
        document.getElementById('task-color').value = task.color || '#3b82f6';

        // Trigger Folder UI update
        folderCheck.dispatchEvent(new Event('change'));

        if (!isFolder) {
            document.getElementById('task-date').value = task.date || '';
            document.getElementById('task-priority').value = task.priority;
            document.getElementById('task-recurrence').value = task.recurrence || 'none';
        }

        taskForm.dataset.editId = editId;

        // Reminder Logic
        const reminderActive = document.getElementById('task-reminder-active');
        const reminderTime = document.getElementById('task-reminder-time');
        reminderActive.checked = !!task.reminderActive;
        reminderTime.value = task.reminderTime || '';
        reminderTime.style.display = task.reminderActive ? 'block' : 'none';

    } else {
        // Nueva Tarea
        document.getElementById('modal-title').textContent = 'Nueva Tarea';
        taskForm.reset();

        const folderCheck = document.getElementById('task-is-folder');
        folderCheck.checked = false;
        folderCheck.dispatchEvent(new Event('change'));

        document.getElementById('task-date').valueAsDate = new Date();
        document.getElementById('task-recurrence').value = 'none';
        document.getElementById('recurrence-days-container').classList.add('hidden');
        document.querySelectorAll('.days-checkbox-group input').forEach(c => c.checked = false);

        // Defaults Pomodoro
        document.getElementById('pomo-cycles').value = 1;
        document.getElementById('pomo-work').value = 25;
        document.getElementById('pomo-break').value = 5;

        const iconSelect = document.getElementById('task-icon-select');
        iconSelect.value = '';
        document.getElementById('task-icon-custom').style.display = 'none';

        delete taskForm.dataset.editId;

        // Reset Reminder
        document.getElementById('task-reminder-active').checked = false;
        document.getElementById('task-reminder-time').value = '';
        document.getElementById('task-reminder-time').style.display = 'none';
    }

    updateParentSelect();
}



// Aquí está la función pendiente, ahora usando state.tasks
export function updateParentSelect() {
    const taskForm = document.getElementById('task-form');
    const taskParentSelect = document.getElementById('task-parent');
    const editId = taskForm.dataset.editId;

    const dateVal = document.getElementById('task-date').value;
    const endDateVal = document.getElementById('task-end-date').value;
    const currentParentId = taskParentSelect.value;

    taskParentSelect.innerHTML = '<option value="">Ninguna (Tarea Principal)</option>';

    const isValidParent = (t) => {
        if (editId && t.id === editId) return false; // No ser padre de sí mismo

        const isFolder = !!t.isFolder || (!t.date && !!t.color);
        if (isFolder) return true;

        if (!dateVal && !endDateVal) return true;

        let onStart = false;
        if (dateVal) onStart = isTaskOnDate(t, new Date(dateVal + 'T00:00:00'));

        let onEnd = false;
        if (endDateVal) onEnd = isTaskOnDate(t, new Date(endDateVal + 'T00:00:00'));

        return onStart || onEnd;
    };

    const renderOption = (t, depth) => {
        if (depth > 2) return;

        if (isValidParent(t)) {
            const option = document.createElement('option');
            option.value = t.id;
            option.textContent = '\u00A0\u00A0'.repeat(depth) + (depth > 0 ? '↳ ' : '') + t.title;
            taskParentSelect.appendChild(option);
        }

        // Recursión usando state.tasks
        state.tasks.filter(child => child.parentId === t.id).forEach(c => renderOption(c, depth + 1));
    };

    state.tasks.filter(t => !t.parentId).forEach(t => renderOption(t, 0));

    if (currentParentId) taskParentSelect.value = currentParentId;
}


// --- CREACIÓN DE ELEMENTOS DOM (CORE) ---

export function createTaskElement(task, hasSubtasks = false, isSubtask = false) {
    const isFolder = !!task.isFolder || (!task.date && !!task.color);
    const div = document.createElement('div');

    div.className = `task-item ${isFolder ? 'priority-none is-folder' : 'priority-' + task.priority} ${task.status === 'completed' && !isFolder ? 'completed' : ''}`;
    div.dataset.id = task.id;

    if (task.status === 'completed' && !isFolder) div.style.opacity = '0.6';

    if (isFolder && task.color) {
        div.style.borderLeft = `5px solid ${task.color}`;
        div.style.background = `linear-gradient(90deg, ${task.color}20, var(--card-bg))`;
    }

    let toggleHtml = '';
    if (hasSubtasks) {
        // Nota: onclick="toggleSubtasks..." requiere que toggleSubtasks sea global.
        // Lo expondremos en main.js
        toggleHtml = `<button class="btn-toggle-subtasks" onclick="toggleSubtasks('${task.id}', this)">${ICONS.chevronDown}</button>`;
        if (!state.expandedTasks.has(task.id) && !div.dataset.initialized) {
            state.expandedTasks.add(task.id);
        }
    } else {
        toggleHtml = `<span style="width:20px;display:inline-block;margin-right:5px;"></span>`;
    }

    const iconHtml = task.icon ? `<i class="${task.icon}" style="margin-right:5px;"></i>` : (isFolder ? '<i class="fa-solid fa-folder" style="margin-right:5px;"></i>' : '');

    let categoryHtml = '';
    if (task.category) {
        const tags = task.category.split(',').map(t => t.trim()).filter(t => t);
        // Filtrar tags de sistema visualmente si quieres
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

    const descriptionHtml = task.desc ? `<div class="task-description">${task.desc}</div>` : '';

    // HTML Structure
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

    // Drag Logic Binding
    div.draggable = true;
    div.addEventListener('dragstart', (e) => {
        div.classList.add('dragging');
        div.dataset.dragType = isSubtask ? 'subtask' : 'parent';
        // Para Firefox y otros
        if (e.dataTransfer) {
            e.dataTransfer.setData('text/plain', task.id);
            e.dataTransfer.effectAllowed = 'move';
        }
    });

    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
    });

    return div;
}

export function toggleSubtasks(taskId, btn) {
    if (state.expandedTasks.has(taskId)) {
        state.expandedTasks.delete(taskId);
        btn.classList.add('rotate');
    } else {
        state.expandedTasks.add(taskId);
        btn.classList.remove('rotate');
    }

    const taskItem = btn.closest('.task-item');
    if (taskItem) {
        const container = taskItem.nextElementSibling;
        if (container && container.classList.contains('subtask-container')) {
            container.classList.toggle('hidden');
        }
    }
}

// --- TOUCH DRAG HANDLERS (Exportados para usarse en Main o Sidebar) ---

export function handleTouchStart(e) {
    if (e.target.closest('.btn-toggle-subtasks') || e.target.closest('.action-btn') || e.target.closest('.task-check')) return;

    const taskItem = e.target.closest('.task-item');
    if (!taskItem) return;

    let target = taskItem.closest('.task-wrapper');
    if (!target) {
        target = taskItem;
    } else {
        const subtaskItem = e.target.closest('.subtask-container .task-item');
        if (subtaskItem) target = subtaskItem;
    }

    if (!target) return;

    touchDragItem = target;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;

    touchTimer = setTimeout(() => {
        startTouchDrag(touch);
    }, 500);
}

function startTouchDrag(touch) {
    touchTimer = null;
    if (!touchDragItem) return;
    if (navigator.vibrate) navigator.vibrate(50);

    touchDragItem.classList.add('dragging');

    if (touchDragItem.classList.contains('task-wrapper')) {
        touchDragItem.dataset.dragType = 'parent';
    } else {
        touchDragItem.dataset.dragType = 'subtask';
    }

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
    touchClone.style.pointerEvents = 'none';

    document.body.appendChild(touchClone);
}

export function handleTouchMove(e) {
    if (!touchDragItem) return;

    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartX);
    const dy = Math.abs(touch.clientY - touchStartY);

    if (touchTimer && (dx > 10 || dy > 10)) {
        clearTimeout(touchTimer);
        touchTimer = null;
        touchDragItem = null;
    }

    if (touchClone) {
        e.preventDefault();
        touchClone.style.transform = `translate(${touch.clientX - touchOffsetX}px, ${touch.clientY - touchOffsetY}px)`;

        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        if (elementBelow) {
            // Importar handleDragOver dinámicamente o pasarlo como callback si fuera necesario
            // Por ahora asumiremos que el evento 'dragover' nativo no se dispara con touch,
            // así que simulamos llamando a la lógica de dragover del sidebar.
            // Para simplificar, este handler debería estar en Main o Sidebar donde handleDragOver es accesible.
            // ... (Lo conectaremos en sidebar.js) ...
        }
    }
}

export function handleTouchEnd(e, handleDropCallback) {
    if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
    }

    if (touchClone) {
        touchClone.remove();
        touchClone = null;
        touchDragItem.classList.remove('dragging');

        const touch = e.changedTouches[0];
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);

        // Ejecutar callback de drop
        if (handleDropCallback) {
            const mockEvent = {
                preventDefault: () => { },
                target: elementBelow || document.body,
                clientX: touch.clientX,
                clientY: touch.clientY
            };
            handleDropCallback(mockEvent);
        }

        touchDragItem = null;
    } else {
        touchDragItem = null;
    }
}





