import { state } from '../state.js';
import { updateMainTagFilterOptions } from '../data.js';
import { openModal } from './ui-helpers.js';
import { isTaskOnDate } from '../utils.js';

export function renderGantt() {
    const ganttViewEl = document.getElementById('gantt-view');
    const currentMonthYearEl = document.getElementById('current-month-year');
    if (!ganttViewEl) return;

    // Use current date state for week navigation
    const currDate = new Date(state.currentDate);
    const dayOfWeek = currDate.getDay(); // 0 (Sun) to 6 (Sat)

    // Calculate start of the week (assuming Week starts on Sunday as per generic JS getDay)
    const weekStart = new Date(currDate);
    weekStart.setDate(currDate.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Update Header Text ("Week of ...") or Month Year
    if (currentMonthYearEl) {
        // Logic to calculate ISO week number
        const getWeekNumber = (d) => {
            d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            return weekNo;
        };

        const weekNum = getWeekNumber(weekStart);
        const year = weekStart.getFullYear();
        currentMonthYearEl.textContent = `Semana ${weekNum} - ${year}`;
    }

    // Basic structure
    ganttViewEl.innerHTML = `
        <div class="gantt-controls" style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin:0;">Vista Semanal</h3>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">
                ${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}
            </div>
        </div>
        <div class="gantt-chart-container" style="overflow-x: auto; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--card-bg);">
            <div id="gantt-header" style="display: flex; border-bottom: 1px solid var(--glass-border); min-width: max-content;">
                <!-- Days header injected here -->
            </div>
            <div id="gantt-body" style="min-width: max-content;">
                <!-- Tasks rows injected here -->
            </div>
        </div>
        <div id="gantt-empty-state" style="display:none; padding: 20px; text-align: center; color: var(--text-secondary);">
            No hay tareas visibles para esta semana.
        </div>
    `;

    const headersContainer = document.getElementById('gantt-header');

    // Render Header (Tasks Column)
    const nameHeader = document.createElement('div');
    nameHeader.style.width = '200px';
    nameHeader.style.minWidth = '200px';
    nameHeader.style.padding = '10px';
    nameHeader.style.position = 'sticky';
    nameHeader.style.left = '0';
    nameHeader.style.background = 'var(--card-bg)';
    nameHeader.style.borderRight = '1px solid var(--glass-border)';
    nameHeader.style.zIndex = '10';
    nameHeader.style.fontWeight = '600';
    nameHeader.textContent = 'Tarea';
    headersContainer.appendChild(nameHeader);

    const dayWidth = 100; // Wider columns for week view
    const daysToRender = 7;

    const weekDays = [];
    for (let i = 0; i < daysToRender; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        weekDays.push(d);
    }

    weekDays.forEach(day => {
        const dayCol = document.createElement('div');
        dayCol.style.width = `${dayWidth}px`;
        dayCol.style.minWidth = `${dayWidth}px`;
        dayCol.style.textAlign = 'center';
        dayCol.style.padding = '10px 0';
        dayCol.style.borderRight = '1px solid var(--glass-border)';
        dayCol.style.fontSize = '0.8rem';

        const dayName = new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(day);

        dayCol.innerHTML = `<div style="text-transform:uppercase; font-size:0.7rem; opacity:0.7;">${dayName}</div><div>${day.getDate()}</div>`;

        // Highlight today
        const todayStr = new Date().toDateString();
        if (day.toDateString() === todayStr) {
            dayCol.style.backgroundColor = 'rgba(233, 83, 84, 0.1)';
            dayCol.style.color = 'var(--accent-color)';
            dayCol.style.fontWeight = 'bold';
        }

        headersContainer.appendChild(dayCol);
    });

    // 2. Filter & Sort Tasks

    const tasksToShow = [];

    // Create an array of day objects for the current week to check recurrence against
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        weekDates.push(d);
    }

    state.tasks.forEach(t => {
        // 1. General Filters (Status, Tags)
        if (state.activeFilters.status === 'completed' && t.status !== 'completed') return;
        if (state.activeFilters.status === 'pending' && t.status === 'completed') return;

        if (state.activeFilters.mainTags && state.activeFilters.mainTags.size > 0) {
            if (!t.category) return;
            const taskTags = t.category.split(',').map(tag => tag.trim());
            const hasTag = taskTags.some(tag => state.activeFilters.mainTags.has(tag));
            if (!hasTag) return;
        }

        // 1.5 Folder Filter
        if (state.activeFilters.folderId) {
            // Show if it IS the folder, OR if it's a child of the folder
            const isTargetFolder = t.id === state.activeFilters.folderId;
            const isChildOfFolder = t.parentId === state.activeFilters.folderId;

            if (!isTargetFolder && !isChildOfFolder) return;
        }

        // 2. Recurrence Expansion vs Standard Overlap
        if (t.recurrence && t.recurrence !== 'none') {
            const instances = [];
            // Recurring Task: Check each day of the week
            weekDates.forEach(dayDate => {
                if (isTaskOnDate(t, dayDate)) {
                    // Create a display instance for this day
                    const y = dayDate.getFullYear();
                    const m = String(dayDate.getMonth() + 1).padStart(2, '0');
                    const d = String(dayDate.getDate()).padStart(2, '0');
                    const dayStr = `${y}-${m}-${d}`;

                    instances.push({ start: dayStr, end: dayStr });
                }
            });

            if (instances.length > 0) {
                // Determine display date for sorting (use first instance)
                tasksToShow.push({ ...t, instances: instances, displayDate: instances[0].start });
            }
        } else {
            // Standard Task: Check Range Overlap
            const tStart = t.startDate || t.date;
            if (!tStart) return;

            // Use midnight comparison
            const startObj = new Date(tStart + 'T00:00:00');
            const endObj = (t.endDate || t.date) ? new Date((t.endDate || t.date) + 'T00:00:00') : new Date(startObj);

            // Overlap Check
            if (startObj <= weekEnd && endObj >= weekStart) {
                tasksToShow.push({ ...t, instances: [{ start: tStart, end: t.endDate || tStart }], displayDate: tStart });
            }
        }
    });

    // Sort final list
    tasksToShow.sort((a, b) => {
        const dateA = a.displayDate;
        const dateB = b.displayDate;
        if (dateA && dateB) return dateA.localeCompare(dateB);
        return 0; // priority could go here
    });

    const bodyContainer = document.getElementById('gantt-body');

    if (tasksToShow.length === 0) {
        document.getElementById('gantt-empty-state').style.display = 'block';
        return;
    }

    tasksToShow.forEach(task => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.borderBottom = '1px solid var(--glass-border)';
        row.style.position = 'relative';
        row.style.height = '40px';
        row.style.alignItems = 'center';

        // Sticky Name Column
        const nameCol = document.createElement('div');
        nameCol.style.width = '200px';
        nameCol.style.minWidth = '200px';
        nameCol.style.padding = '0 10px';
        nameCol.style.position = 'sticky';
        nameCol.style.left = '0';
        nameCol.style.background = 'var(--card-bg)';
        nameCol.style.borderRight = '1px solid var(--glass-border)';
        nameCol.style.zIndex = '5';
        nameCol.style.whiteSpace = 'nowrap';
        nameCol.style.overflow = 'hidden';
        nameCol.style.textOverflow = 'ellipsis';
        nameCol.style.fontSize = '0.85rem';
        nameCol.style.display = 'flex';
        nameCol.style.alignItems = 'center';
        nameCol.style.height = '100%';
        nameCol.title = task.title;
        nameCol.innerHTML = `
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${task.color || 'var(--accent-color)'}; margin-right:5px;"></span>
            ${task.title}
        `;
        row.appendChild(nameCol);

        // Timeline Area
        const timelineArea = document.createElement('div');
        timelineArea.style.flex = '1';
        timelineArea.style.position = 'relative';
        timelineArea.style.height = '100%';

        // Render Instances (Bars)
        if (task.instances && task.instances.length > 0) {
            task.instances.forEach(instance => {
                const tStartStr = instance.start;
                const tEndStr = instance.end;

                const tStart = new Date(tStartStr + 'T00:00:00');
                const tEnd = tEndStr ? new Date(tEndStr + 'T00:00:00') : new Date(tStart);

                // Clamp dates to visible week
                const visibleStart = tStart < weekStart ? weekStart : tStart;
                const visibleEnd = tEnd > weekEnd ? weekEnd : tEnd;

                if (visibleStart <= visibleEnd) {
                    const diffStart = (visibleStart - weekStart) / (1000 * 60 * 60 * 24);
                    const diffDuration = ((visibleEnd - visibleStart) / (1000 * 60 * 60 * 24)) + 1;

                    const leftOffset = Math.round(diffStart * dayWidth);
                    const width = Math.round(diffDuration * dayWidth);

                    const bar = document.createElement('div');
                    bar.style.position = 'absolute';
                    bar.style.left = `${leftOffset + 2}px`;
                    bar.style.width = `${width - 4}px`;
                    bar.style.top = '8px';
                    bar.style.height = '24px';

                    let barColor = 'var(--accent-color)';
                    if (task.priority === 'high') barColor = 'var(--danger-color)';
                    else if (task.priority === 'medium') barColor = 'var(--warning-color)';
                    else if (task.priority === 'low') barColor = 'var(--success-color)';

                    bar.style.background = barColor;
                    bar.style.borderRadius = '4px';
                    bar.style.opacity = '0.9';
                    bar.style.cursor = 'pointer';
                    bar.title = `${task.title} (${tStartStr} - ${tEndStr})`;
                    bar.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

                    // Interaction
                    bar.onclick = (e) => {
                        e.stopPropagation();
                        openModal(task.id);
                    };

                    if (width > 30) {
                        bar.style.display = 'flex';
                        bar.style.alignItems = 'center';
                        bar.style.paddingLeft = '5px';
                        bar.style.color = '#fff';
                        if (task.priority === 'medium') bar.style.color = '#333';

                        bar.style.fontSize = '0.75rem';
                        bar.style.overflow = 'hidden';

                        let contentHtml = '';
                        if (task.status === 'completed') {
                            contentHtml += '<i class="fa-solid fa-check" style="margin-right:4px;"></i> ';
                        }

                        if (width > 100) {
                            contentHtml += task.title;
                        }
                        bar.innerHTML = contentHtml;
                    }
                    timelineArea.appendChild(bar);
                }
            });
        }

        row.appendChild(timelineArea);
        bodyContainer.appendChild(row);
    });
}
