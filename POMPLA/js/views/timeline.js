import { state, ICONS } from '../state.js';
import { updateMainTagFilterOptions, applyFilters } from '../data.js';
import { closeNoteModal, closeCommentModal, closeSessionEditModal } from '../modal-handler.js';
import { openModal } from './ui-helpers.js';

// --- RENDERIZADO PRINCIPAL ---

export function renderTimeline(rangeType = 'today') {
    const timelineViewEl = document.getElementById('timeline-view');
    const currentMonthYearEl = document.getElementById('current-month-year');

    if (!timelineViewEl) return;

    // Estructura Base
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
                    </div>
            </div>
        </div>
        <div id="list-date-header" class="list-header" style="margin-bottom: 15px; text-align: center;"></div>
        <div id="timeline-container"></div>
    `;

    // 1. Configurar Fecha
    const loopStart = new Date(state.currentDate);
    loopStart.setHours(0, 0, 0, 0);
    const loopEnd = new Date(loopStart);

    // 2. Renderizar Notas
    renderNotes(loopStart);

    // 3. Actualizar Header
    const headerDateStr = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(loopStart);
    const capitalizedHeader = headerDateStr.charAt(0).toUpperCase() + headerDateStr.slice(1);
    if (currentMonthYearEl) currentMonthYearEl.textContent = capitalizedHeader;

    // 4. Recopilar Eventos (Sesiones + Comentarios)
    const dateStr = loopStart.toISOString().split('T')[0];
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayEvents = [];

    state.tasks.forEach(task => {
        // Timeline ignora filtros de sidebar, muestra TODO lo del día
        if (task.sessions && Array.isArray(task.sessions)) {
            task.sessions.forEach((session, index) => {
                if (!session.start) return;
                const start = new Date(session.start);

                // Chequeo de fecha local
                const sY = start.getFullYear();
                const sM = start.getMonth();
                const sD = start.getDate();

                if (sY === dateObj.getFullYear() && sM === dateObj.getMonth() && sD === dateObj.getDate()) {
                    dayEvents.push({
                        type: (task.isTimelineComment || (task.category && task.category.includes('comment'))) ? 'comment' : 'session',
                        start: start,
                        end: session.end ? new Date(session.end) : null,
                        task: task,
                        originalIndex: index
                    });
                }
            });
        } else if (task.isTimelineComment && task.date === dateStr) {
            // Fallback legacy
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

    // 5. Renderizar Eventos
    // Ordenar cronológicamente
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

    const container = timelineViewEl.querySelector('#timeline-container');
    container.appendChild(group); // Header dentro del container o fuera? En el original era group > header + container interno.
    // Ajuste estructural para coincidir con diseño original:
    const innerContainer = document.createElement('div');
    innerContainer.className = 'timeline-container';
    group.appendChild(innerContainer);

    if (dayEvents.length === 0) {
        innerContainer.innerHTML = '<div style="opacity:0.5; font-size:0.8rem; padding:10px;">Sin actividad.</div>';
    }

    dayEvents.forEach(event => {
        const item = document.createElement('div');
        item.className = 'timeline-event';
        if (event.type === 'comment') item.classList.add('timeline-comment');

        // Columna Tiempo
        const timeCol = document.createElement('div');
        timeCol.className = 'timeline-time-col';
        const startStr = event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let timeHtml = `<div>${startStr}</div>`;
        if (event.end) {
            const endStr = event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeHtml += `<div class="time-end-wrapper"><div class="time-end-dot"></div> <span>${endStr}</span></div>`;
        } else if (event.type === 'session') {
            timeHtml += `<div class="time-end-wrapper" style="opacity:0.5"><div class="time-end-dot" style="background:var(--text-secondary)"></div> <span>...</span></div>`;
        }
        timeCol.innerHTML = timeHtml;

        // Columna Puntos (Visuals)
        const dotCol = document.createElement('div');
        dotCol.className = 'timeline-dot-col';
        const dot = document.createElement('div');
        dot.className = 'timeline-dot';

        if (event.type === 'comment') {
            dot.style.borderColor = 'var(--text-secondary)';
            dot.style.background = 'transparent';
        } else {
            if (event.task.color) dot.style.borderColor = event.task.color;
            else {
                const pColor = event.task.priority === 'high' ? 'var(--danger-color)' : (event.task.priority === 'medium' ? 'var(--warning-color)' : 'var(--success-color)');
                dot.style.borderColor = pColor;
            }
        }
        dotCol.appendChild(dot);

        // Columna Contenido
        const contentCol = document.createElement('div');
        contentCol.className = 'timeline-content-col';

        const metaHeader = document.createElement('div');
        metaHeader.style.display = 'flex'; metaHeader.style.justifyContent = 'space-between'; metaHeader.style.alignItems = 'flex-start';

        const title = document.createElement('div');
        title.className = 'timeline-event-title';
        title.textContent = event.task.title;

        const controls = document.createElement('div');
        controls.className = 'timeline-controls';

        if (event.type === 'comment') {
            controls.innerHTML = `
                <button class="timeline-btn" onclick="openCommentEditModal('${event.task.id}')" title="Editar">${ICONS.edit}</button>
                <button class="timeline-btn delete" onclick="deleteSession('${event.task.id}', 0)" title="Eliminar">${ICONS.delete}</button>
            `;
        } else {
            controls.innerHTML = `
                <button class="timeline-btn" onclick="openSessionEditModal('${event.task.id}', ${event.originalIndex})" title="Editar hora">${ICONS.edit}</button>
                <button class="timeline-btn delete" onclick="deleteSession('${event.task.id}', ${event.originalIndex})" title="Eliminar">${ICONS.delete}</button>
            `;
        }

        metaHeader.appendChild(title);
        metaHeader.appendChild(controls);
        contentCol.appendChild(metaHeader);

        const meta = document.createElement('div');
        meta.className = 'timeline-event-meta';

        if (event.type === 'comment') {
            const typeLabels = { interruption: 'Interrupción', annotation: 'Anotación', comment: 'Comentario', other: 'Otro' };
            meta.style.fontSize = '0.75rem'; meta.style.opacity = '0.7'; meta.style.marginTop = '2px';
            if (event.end) {
                const diffMs = event.end - event.start;
                const diffMins = Math.max(1, Math.round(diffMs / 60000));
                meta.textContent = `${typeLabels[event.task.commentType] || 'Comentario'} - Duración: ${diffMins} min`;
            } else {
                meta.textContent = typeLabels[event.task.commentType] || 'Comentario';
            }
        } else {
            if (event.end) {
                const diffMs = event.end - event.start;
                const diffMins = Math.max(1, Math.round(diffMs / 60000));
                meta.textContent = `Duración: ${diffMins} min`;
            } else {
                meta.textContent = 'En curso...';
                meta.style.color = 'var(--accent-color)';
                meta.style.fontWeight = '600';
            }
        }
        contentCol.appendChild(meta);

        // Conclusiones (Solo sesiones)
        if (event.type !== 'comment' && event.task.comment_after_end) {
            const conclusion = document.createElement('div');
            conclusion.className = 'timeline-conclusion';
            conclusion.style.fontSize = '0.75rem'; conclusion.style.color = 'var(--text-secondary)'; conclusion.style.fontStyle = 'italic'; conclusion.style.marginTop = '4px';
            conclusion.textContent = event.task.comment_after_end;
            contentCol.appendChild(conclusion);
        }

        // Tags
        if (event.task.category) {
            const parts = event.task.category.split(',').map(t => t.trim());
            const userTags = parts.filter(t => t !== 'comment' && t !== '|||comment|||' && t !== 'note' && t !== '|||note|||' && !t.includes('|||') && t !== '');

            if (userTags.length > 0) {
                const tagsContainer = document.createElement('div');
                tagsContainer.className = 'timeline-event-tags';
                tagsContainer.style.marginTop = '4px'; tagsContainer.style.display = 'flex'; tagsContainer.style.flexWrap = 'wrap'; tagsContainer.style.gap = '4px';

                userTags.forEach(tag => {
                    const chip = document.createElement('span');
                    chip.style.fontSize = '0.7rem'; chip.style.padding = '2px 6px'; chip.style.borderRadius = '10px'; chip.style.background = 'var(--hover-bg)'; chip.style.color = 'var(--text-secondary)'; chip.style.border = '1px solid var(--glass-border)';
                    chip.textContent = tag;
                    tagsContainer.appendChild(chip);
                });
                contentCol.appendChild(tagsContainer);
            }
        }

        item.appendChild(timeCol);
        item.appendChild(dotCol);
        item.appendChild(contentCol);
        innerContainer.appendChild(item);
    });

    // Actualizar filtros de tags basados en lo renderizado
    updateMainTagFilterOptions();
}

// --- RENDERIZADO DE NOTAS ---

export function renderNotes(dateObj) {
    const container = document.getElementById('timeline-notes-list');
    if (!container) return;
    container.innerHTML = '';

    const viewDateStr = dateObj.toISOString().split('T')[0];

    const notes = state.tasks.filter(t => {
        if (!t.isTimelineNote && (t.category !== 'note' && t.category !== '|||note|||')) return false;

        // Siempre visible si es permanente o no tiene fecha
        if (t.isPermanent || (!t.date && !t.startDate)) return true;

        // Rango de fechas
        if (t.startDate) {
            const start = t.startDate;
            const end = t.endDate || t.startDate;
            return viewDateStr >= start && viewDateStr <= end;
        }

        // Fecha simple
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

        let dateBadge = '';
        if (note.isPermanent || (!note.date && !note.startDate)) {
            dateBadge = '<span style="font-size: 0.7rem; background: var(--accent-color); color: white; padding: 2px 5px; border-radius: 4px; margin-bottom: 5px; display: inline-block;">Siempre visible</span>';
        } else if (note.startDate && note.startDate !== note.endDate) {
            dateBadge = `<span style="font-size: 0.7rem; background: var(--bg-dark); border: 1px solid var(--glass-border); color: var(--text-secondary); padding: 2px 5px; border-radius: 4px; margin-bottom: 5px; display: inline-block;">${note.startDate} - ${note.endDate}</span>`;
        }

        const isCollapsed = note.isCollapsed;

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <div style="display: flex; align-items: center; gap: 5px; flex: 1;">
                    ${dateBadge}
                    <div style="font-weight: 600; color: var(--text-primary); cursor: pointer;" onclick="toggleNoteCollapse('${note.id}')">
                        ${note.title}
                    </div>
                </div>
                <div style="display: flex; gap: 5px; align-items: center;">
                     <button onclick="editNote('${note.id}')" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer;"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteNote('${note.id}')" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer;"><i class="fa-solid fa-trash"></i></button>
                    <i class="fa-solid fa-chevron-down note-chevron" onclick="toggleNoteCollapse('${note.id}')" style="font-size: 0.8rem; color: var(--text-secondary); cursor: pointer; transition: transform 0.2s; transform: ${isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}; margin-left: 5px;"></i>
                </div>
            </div>
            <div id="note-content-${note.id}" style="font-size: 0.9rem; color: var(--text-secondary); white-space: pre-wrap; display: ${isCollapsed ? 'none' : 'block'}; padding-left: 0px; margin-top: 5px;">${note.desc || ''}</div>
        `;
        container.appendChild(div);
    });
}

// --- ACCIONES UI DE NOTAS ---

export function toggleNoteCollapse(id) {
    const note = state.tasks.find(t => t.id === id);
    if (!note) return;
    note.isCollapsed = !note.isCollapsed;
    renderNotes(state.currentDate);
}

export function openNoteModal() {
    document.getElementById('note-modal').classList.add('active');
    const dateInput = document.getElementById('note-date');
    if (state.currentDate) {
        dateInput.value = state.currentDate.toISOString().split('T')[0];
    } else {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
    document.getElementById('note-no-date').checked = false;
    document.getElementById('note-edit-id').value = '';
    document.querySelector('#note-modal h3').textContent = 'Nueva Nota';
    dateInput.disabled = false;
}

export function editNote(id) {
    const note = state.tasks.find(t => t.id === id);
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
        if (state.currentDate) dateInput.value = state.currentDate.toISOString().split('T')[0];
    } else {
        noDateCheck.checked = false;
        dateInput.disabled = false;
        dateInput.value = note.date;
    }
}

export function saveNoteFromModal() {
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
        if (window.updateTaskInFirebase) window.updateTaskInFirebase(editId, noteData);
    } else {
        if (window.addTaskToFirebase) window.addTaskToFirebase(noteData);
    }

    closeNoteModal();
    setTimeout(() => renderNotes(state.currentDate), 500);
}

export function deleteNote(id) {
    if (confirm('¿Eliminar esta nota?')) {
        if (window.deleteTaskFromFirebase) window.deleteTaskFromFirebase(id);
        setTimeout(() => renderNotes(state.currentDate), 500);
    }
}

export function toggleNotesSection() {
    const content = document.getElementById('notes-collapsible-content');
    const chevron = document.getElementById('notes-chevron');
    if (!content || !chevron) return;
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
}

// --- ACCIONES DE SESIONES Y COMENTARIOS ---

export function deleteSession(taskId, sessionIndex) {
    if (!confirm('¿Eliminar esta sesión de la línea de tiempo?')) return;
    const task = state.tasks.find(t => t.id == taskId);

    if (task && (task.isTimelineComment || (task.category && task.category.includes('comment')))) {
        if (window.deleteTaskFromFirebase) window.deleteTaskFromFirebase(task.id);
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

export function openCommentModal(dateStr) {
    document.getElementById('comment-date-ref').value = dateStr;
    document.getElementById('comment-edit-id').value = '';

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

export function saveComment() {
    const text = document.getElementById('comment-text').value;
    const type = document.getElementById('comment-type').value;
    const timeVal = document.getElementById('comment-time').value;
    const endTimeVal = document.getElementById('comment-end-time').value;
    const editId = document.getElementById('comment-edit-id').value;
    const tagsInput = document.getElementById('comment-tags');

    if (!text) return alert('Escribe un comentario');
    if (!timeVal) return alert('Selecciona una hora');

    let finalCategory = '|||comment|||';
    if (tagsInput && tagsInput.value.trim() !== '') {
        const userTags = tagsInput.value.replace(/\|\|\|/g, '').split(',').map(t => t.trim()).filter(t => t !== '');
        if (userTags.length > 0) finalCategory += ', ' + userTags.join(', ');
    }

    const datePart = timeVal.split('T')[0];
    const sessionObj = {
        start: new Date(timeVal).toISOString(),
        end: endTimeVal ? new Date(endTimeVal).toISOString() : null
    };

    if (editId) {
        if (window.updateTaskInFirebase) {
            window.updateTaskInFirebase(editId, {
                title: text,
                category: finalCategory,
                commentType: type,
                date: datePart,
                sessions: [sessionObj]
            });
        }
    } else {
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
        if (window.addTaskToFirebase) window.addTaskToFirebase(newComment);
    }

    document.getElementById('comment-modal').classList.remove('active');
    setTimeout(() => { if (state.currentView === 'timeline') renderTimeline(); }, 500);
}

export function openCommentEditModal(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
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
        if (task.sessions[0].end) {
            const dEnd = new Date(task.sessions[0].end);
            endTimeVal = (new Date(dEnd - offset)).toISOString().slice(0, 16);
        }
    }
    document.getElementById('comment-time').value = timeVal;
    document.getElementById('comment-end-time').value = endTimeVal;

    const tagsInput = document.getElementById('comment-tags');
    if (tagsInput) {
        let userTags = '';
        if (task.category) {
            const parts = task.category.split(',').map(t => t.trim());
            const filtered = parts.filter(t => !t.includes('|||') && t !== 'comment' && t !== 'note');
            userTags = filtered.join(', ');
        }
        tagsInput.value = userTags;
    }
    document.getElementById('comment-modal').classList.add('active');
}

export function openSessionEditModal(taskId, sessionIndex) {
    const task = state.tasks.find(t => t.id == taskId);
    if (!task || !task.sessions[sessionIndex]) return;

    const session = task.sessions[sessionIndex];
    document.getElementById('edit-session-task-id').value = task.id;
    document.getElementById('edit-session-index').value = sessionIndex;

    const toLocalISO = (isoStr) => {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const offset = d.getTimezoneOffset() * 60000;
        return (new Date(d - offset)).toISOString().slice(0, 16);
    };

    document.getElementById('edit-session-start').value = toLocalISO(session.start);
    document.getElementById('edit-session-end').value = session.end ? toLocalISO(session.end) : '';
    document.getElementById('edit-session-conclusion').value = task.comment_after_end || '';

    const modal = document.getElementById('session-edit-modal');
    modal.classList.add('active');
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('opacity', '1', 'important');
    modal.style.setProperty('pointer-events', 'all', 'important');
}

export function saveSessionEdit() {
    const taskId = document.getElementById('edit-session-task-id').value;
    const idx = parseInt(document.getElementById('edit-session-index').value);
    const startVal = document.getElementById('edit-session-start').value;
    const endVal = document.getElementById('edit-session-end').value;
    const conclusionVal = document.getElementById('edit-session-conclusion').value;

    const task = state.tasks.find(t => t.id == taskId);
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
        if (state.currentView === 'timeline') renderTimeline();
    }
}

export function selectCommentType(btn, type) {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('comment-type').value = type;
}

// --- MINI CALENDAR ---

let miniCalendarDate = new Date();

export function toggleMiniCalendar() {
    // Buscar o crear el popup
    let popup = document.getElementById('mini-calendar-popup');

    // Si no existe, lo creamos dinámicamente y lo insertamos en el main content
    if (!popup) {
        // Buscamos el contenedor padre adecuado, idealmente cerca del header o en timeline-view
        // Pero para posicionarlo absolute respecto al header, mejor ponerlo en .calendar-nav o .top-bar si tienen relative
        // O simplemente en body y calculamos posición.
        // El user pidió: "debajo de current-month-year".

        const container = document.querySelector('.month-nav-controls');
        if (!container) return; // No hay header

        // Asegurar relative positioning
        container.style.position = 'relative';

        popup = document.createElement('div');
        popup.id = 'mini-calendar-popup';
        popup.className = 'mini-calendar-popup';

        // Estructura interna
        popup.innerHTML = `
            <div class="mini-calendar-header">
                <button class="icon-btn" id="mini-prev"><i class="fa-solid fa-chevron-left"></i></button>
                <span id="mini-month-year" style="font-weight:600; font-size: 0.9rem;"></span>
                <button class="icon-btn" id="mini-next"><i class="fa-solid fa-chevron-right"></i></button>
            </div>
            <div class="mini-calendar-grid" id="mini-calendar-grid"></div>
        `;

        container.appendChild(popup);

        // Listeners internos del mini calendar
        popup.querySelector('#mini-prev').onclick = (e) => {
            e.stopPropagation();
            miniCalendarDate.setMonth(miniCalendarDate.getMonth() - 1);
            renderMiniCalendar();
        };
        popup.querySelector('#mini-next').onclick = (e) => {
            e.stopPropagation();
            miniCalendarDate.setMonth(miniCalendarDate.getMonth() + 1);
            renderMiniCalendar();
        };

        // Cerrar al hacer click fuera (se maneja con un listener global o en el botón toggle)
        document.addEventListener('click', (e) => {
            const toggleBtn = document.getElementById('current-month-year');
            if (popup.classList.contains('active') && !popup.contains(e.target) && e.target !== toggleBtn) {
                popup.classList.remove('active');
            }
        });
    }

    const isActive = popup.classList.contains('active');

    if (isActive) {
        popup.classList.remove('active');
    } else {
        // Sincronizar fecha al abrir
        miniCalendarDate = new Date(state.currentDate);
        renderMiniCalendar();
        popup.classList.add('active');
    }
}

function renderMiniCalendar() {
    const grid = document.getElementById('mini-calendar-grid');
    const title = document.getElementById('mini-month-year');
    if (!grid) return;

    // Título
    const monthName = miniCalendarDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    title.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    grid.innerHTML = '';

    // Días de la semana
    const days = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    days.forEach(d => {
        const span = document.createElement('div');
        span.className = 'mini-calendar-day-name';
        span.textContent = d;
        grid.appendChild(span);
    });

    const year = miniCalendarDate.getFullYear();
    const month = miniCalendarDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Espacios vacíos
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'mini-calendar-day empty';
        grid.appendChild(empty);
    }

    // Días
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEl = document.createElement('div');
        dayEl.className = 'mini-calendar-day';
        dayEl.textContent = day;

        // Verificar si es el día seleccionado actualmente en timeline
        const currentStr = state.currentDate.toISOString().split('T')[0];
        if (dateStr === currentStr) {
            dayEl.classList.add('selected');
        }

        // Verificar si tiene notas (Excluyendo permanentes/sin fecha)
        const hasNotes = state.tasks.some(t => {
            // Debe ser nota
            if (!t.isTimelineNote && (t.category !== 'note' && t.category !== '|||note|||')) return false;

            // Excluir permanentes
            if (t.isPermanent || (!t.date && !t.startDate)) return false;

            // Verificar fecha exacta
            if (t.startDate) {
                // Si es rango
                return dateStr >= t.startDate && dateStr <= (t.endDate || t.startDate);
            } else if (t.date) {
                // Si es fecha simple
                return t.date === dateStr;
            }
            return false;
        });

        if (hasNotes) {
            dayEl.classList.add('has-note');
            const dot = document.createElement('div');
            dot.className = 'mini-calendar-dot';
            dayEl.appendChild(dot);
        }

        // Click: Ir a ese día
        dayEl.onclick = (e) => {
            e.stopPropagation();
            state.currentDate = new Date(year, month, day);
            if (state.currentView === 'timeline') {
                renderTimeline(); // Esto actualiza el header y notas
            }
            // Cerrar popup
            document.getElementById('mini-calendar-popup').classList.remove('active');
        };

        grid.appendChild(dayEl);
    }
}