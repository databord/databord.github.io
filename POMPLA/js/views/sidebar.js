import { state } from '../state.js';
import { createTaskElement, handleTouchStart, handleTouchMove, handleTouchEnd } from './ui-helpers.js';
import { applyFilters } from '../data.js'; // Necesario para refrescar tras Drag & Drop

// --- RENDERIZADO PRINCIPAL ---

export function renderTasks(tasksToRender) {
    const taskListEl = document.getElementById('task-list');
    if (!taskListEl) return;

    taskListEl.innerHTML = '';

    // Aplicar densidad (clase CSS)
    taskListEl.className = ''; // Limpiar
    if (state.listDensity) taskListEl.classList.add(state.listDensity);

    const processedIds = new Set();
    const renderSet = new Set(tasksToRender.map(t => t.id));

    // Recursiva para hijos
    function renderRecursive(parentId, container, depth) {
        if (depth > 2) return;

        const children = tasksToRender.filter(t => t.parentId === parentId);
        if (children.length === 0) return;

        children.forEach(child => {
            if (processedIds.has(child.id)) return;
            processedIds.add(child.id);

            const hasGrandChildren = tasksToRender.some(t => t.parentId === child.id);
            const taskEl = createTaskElement(child, hasGrandChildren, true); // true = isSubtask

            container.appendChild(taskEl);

            if (hasGrandChildren) {
                const subContainer = document.createElement('div');
                subContainer.className = 'subtask-container';
                if (!state.expandedTasks.has(child.id)) {
                    subContainer.classList.add('hidden');
                    const btn = taskEl.querySelector('.btn-toggle-subtasks');
                    if (btn) btn.classList.add('rotate');
                }
                renderRecursive(child.id, subContainer, depth + 1);
                container.appendChild(subContainer);
            }
        });
    }

    // Renderizar Raíces
    tasksToRender.forEach(task => {
        const isRoot = !task.parentId || !renderSet.has(task.parentId);

        if (isRoot && !processedIds.has(task.id)) {
            processedIds.add(task.id);
            const hasChildren = tasksToRender.some(t => t.parentId === task.id);

            const wrapper = document.createElement('div');
            wrapper.className = 'task-wrapper';
            wrapper.dataset.id = task.id;

            // Contexto de huérfanos (si filtramos padre pero mostramos hijo)
            if (task.parentId) {
                const realParent = state.tasks.find(p => p.id === task.parentId);
                const pName = realParent ? realParent.title : '...';
                const context = document.createElement('div');
                context.className = 'parent-indicator';
                context.innerHTML = `<i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right:5px;"></i> Subtarea de: <strong>${pName}</strong>`;
                wrapper.appendChild(context);
            }

            const taskEl = createTaskElement(task, hasChildren, false);
            wrapper.appendChild(taskEl);

            if (hasChildren) {
                const subContainer = document.createElement('div');
                subContainer.className = 'subtask-container';
                if (!state.expandedTasks.has(task.id)) {
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

    // Re-attach listeners del contenedor principal para Drag & Drop
    setupDragListeners(taskListEl);
}

// --- LOGICA DRAG & DROP LISTENER SETUP ---

function setupDragListeners(taskListEl) {
    // Mouse Events
    taskListEl.removeEventListener('dragover', handleDragOver); // Prevenir duplicados
    taskListEl.removeEventListener('drop', handleDrop);

    taskListEl.addEventListener('dragover', handleDragOver);
    taskListEl.addEventListener('drop', handleDrop);

    // Touch Events
    taskListEl.removeEventListener('touchstart', handleTouchStart);
    taskListEl.removeEventListener('touchmove', handleTouchMove);
    taskListEl.removeEventListener('touchend', handleTouchEndWrapper);

    taskListEl.addEventListener('touchstart', handleTouchStart, { passive: false });
    taskListEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    taskListEl.addEventListener('touchend', handleTouchEndWrapper);
}

// Wrapper para pasar handleDrop al helper de touch
function handleTouchEndWrapper(e) {
    handleTouchEnd(e, handleDrop);
}

// --- LOGICA DRAG OVER & DROP (La parte difícil) ---

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();

    const draggable = document.querySelector('.dragging');
    if (!draggable) return;

    const dragType = draggable.dataset.dragType;
    const taskListEl = document.getElementById('task-list');

    // Identificar targets
    let target = e.target;
    const closestSubContainer = target.closest('.subtask-container');

    // Limpiar clases visuales previas
    document.querySelectorAll('.drop-target-nest').forEach(el => el.classList.remove('drop-target-nest'));

    // Caso A: Arrastrar Subtarea dentro de Subcontenedor
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

    // Caso B: Nesting (Anidar) - Convertir en hijo
    const elements = [...taskListEl.querySelectorAll('.task-wrapper:not(.dragging)')];
    let nestingTarget = null;
    const mouseY = e.clientY;

    for (const wrapper of elements) {
        const rect = wrapper.getBoundingClientRect();
        const threshold = rect.height * 0.25; // Zona sensible
        if (mouseY > rect.top + threshold && mouseY < rect.bottom - threshold) {
            nestingTarget = wrapper;
            break;
        }
    }

    if (nestingTarget) {
        if (nestingTarget.dataset.id === draggable.dataset.id) return; // No anidar en sí mismo
        nestingTarget.classList.add('drop-target-nest');
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        return;
    }

    // Caso C: Reordenar Lista Principal
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

    // Obtener ID del elemento arrastrado (puede ser el wrapper o el item directo)
    const draggedId = draggable.dataset.id || (draggable.querySelector('.task-item') ? draggable.querySelector('.task-item').dataset.id : null);
    if (!draggedId) return;

    const dragType = draggable.dataset.dragType;
    const task = state.tasks.find(t => t.id === draggedId);
    if (!task) return;

    let target = e.target;
    const nestingTarget = target.closest('.task-wrapper.drop-target-nest') || (target.classList.contains('drop-target-nest') ? target : null);
    const taskListEl = document.getElementById('task-list');

    // 1. Lógica de Anidamiento (Nesting)
    if (nestingTarget) {
        const newParentId = nestingTarget.dataset.id;
        if (newParentId === draggedId) return;

        if (task.parentId !== newParentId) {
            task.parentId = newParentId;
            if (window.updateTaskInFirebase) {
                window.updateTaskInFirebase(draggedId, { parentId: newParentId });
            }
            applyFilters(); // Refrescar vista
        }
        return;
    }

    // 2. Lógica de Reordenamiento / Cambio de Nivel
    const parentOfDraggable = draggable.parentElement;
    const isNowInMainList = parentOfDraggable === taskListEl;
    const isNowInSubContainer = parentOfDraggable.classList.contains('subtask-container');

    // Subtarea arrastrada a la raíz
    if (dragType === 'subtask' && isNowInMainList) {
        if (task.parentId) {
            task.parentId = ""; // Hacer raíz
            if (window.updateTaskInFirebase) {
                window.updateTaskInFirebase(draggedId, { parentId: "" });
            }
            saveTaskOrder();
            applyFilters();
            return;
        }
    }

    // Tarea movida a un subcontenedor (Cambio de padre visual)
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

    // Guardar nuevo orden visual
    saveTaskOrder();
}

function getDragAfterElement(container, y) {
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

function saveTaskOrder() {
    const taskListEl = document.getElementById('task-list');
    const visualWrappers = Array.from(taskListEl.children);
    const visibleTaskIds = [];

    // Extraer IDs en orden visual
    visualWrappers.forEach(child => {
        if (child.classList.contains('task-wrapper')) {
            const parentId = child.dataset.id;
            if (parentId) visibleTaskIds.push(parentId);
            const subContainer = child.querySelector('.subtask-container');
            if (subContainer) {
                const subs = subContainer.querySelectorAll('.task-item');
                subs.forEach(s => visibleTaskIds.push(s.dataset.id));
            }
        } else if (child.children.length > 0) {
            // Caso huérfanos
            const orphans = child.querySelectorAll('.task-item');
            orphans.forEach(o => visibleTaskIds.push(o.dataset.id));
        }
    });

    if (visibleTaskIds.length === 0) return;

    // Lógica para preservar slots (huecos) de tareas ocultas por filtro
    // 1. Ordenar lista global actual
    state.tasks.sort((a, b) => (a.order || 0) - (b.order || 0));

    const visibleIdSet = new Set(visibleTaskIds);
    const visibleTasksIndices = [];

    // Obtener índices donde estaban las tareas visibles
    state.tasks.forEach((t, index) => {
        if (visibleIdSet.has(t.id)) visibleTasksIndices.push(index);
    });

    const newTasks = [...state.tasks];

    if (visibleTasksIndices.length !== visibleTaskIds.length) {
        console.warn("Mismatch de índices al reordenar. Abortando save para seguridad.");
        return;
    }

    // Colocar las tareas visuales en los índices originales
    visibleTasksIndices.forEach((globalIndex, i) => {
        const taskId = visibleTaskIds[i];
        const taskObj = state.tasks.find(t => t.id === taskId);
        if (taskObj) newTasks[globalIndex] = taskObj;
    });

    // Reasignar propiedad 'order'
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

    // Actualizar estado local
    state.tasks = newTasks;
}