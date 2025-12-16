// Helper to get formatted task data
// Helper to get formatted task data
function getTasksData() {
    if (!tasks || tasks.length === 0) return null;

    // Filter: Include only tasks (no comments, no notes)
    let tasksToExport = tasks.filter(t =>
        !t.isTimelineComment &&
        t.category !== 'comment' &&
        t.category !== 'note'
    );

    // Filter by Date Range (if selected)
    const exportStartEl = document.getElementById('export-date-start');
    const exportEndEl = document.getElementById('export-date-end');

    if (exportStartEl && exportStartEl.value) {
        tasksToExport = tasksToExport.filter(t => t.date >= exportStartEl.value);
    }
    if (exportEndEl && exportEndEl.value) {
        tasksToExport = tasksToExport.filter(t => t.date <= exportEndEl.value);
    }

    // NEW: Filter by Folder
    const folderFilterEl = document.getElementById('export-filter-folder');
    if (folderFilterEl && folderFilterEl.value) {
        const folderId = folderFilterEl.value;
        tasksToExport = tasksToExport.filter(t => t.parentId === folderId || t.id === folderId);
    }

    // NEW: Multi-Select Tag Filter (AND Logic)
    // We need to retrieve selected tags from our global Set or by querying DOM if we don't store it global.
    // Let's rely on queried DOM checkboxes to be stateless/simple, or use a window global if needed.
    // Querying checkboxes is safer if we didn't setup a global state manager for this modal.
    const checkedBoxes = document.querySelectorAll('#export-tag-dropdown input[type="checkbox"]:checked');
    if (checkedBoxes.length > 0) {
        const selectedTags = Array.from(checkedBoxes).map(cb => cb.value);
        tasksToExport = tasksToExport.filter(t => {
            if (!t.category) return false;
            const taskTags = t.category.split(',').map(tag => tag.trim());
            // AND Logic: Task must have ALL selected tags
            return selectedTags.every(selTag => taskTags.includes(selTag));
        });
    }

    if (tasksToExport.length === 0) return null;

    const formatDate = (dateStr) => dateStr || "";

    const formatReminder = (t) => {
        if (t.reminderActive && t.reminderTime) return t.reminderTime;
        return "No";
    };

    const formatTags = (t) => {
        let labels = [];
        if (t.category && t.category !== 'general' && t.category !== 'note' && t.category !== 'comment') labels.push(t.category);
        if (t.tags && Array.isArray(t.tags)) labels.push(...t.tags);
        return labels.join(", ");
    };

    // Recurrence Helpers
    const formatRecurrence = (r) => {
        const map = {
            'daily': 'Diariamente',
            'weekly': 'Semanalmente',
            'monthly': 'Mensualmente',
            'custom': 'Personalizado',
            'none': 'No'
        };
        return map[r] || 'No';
    };

    const formatRecurrenceDays = (t) => {
        if (t.recurrence !== 'custom' || !t.recurrenceDays || t.recurrenceDays.length === 0) return "";
        const daysMap = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        // Ensure values are integers and map them
        return t.recurrenceDays.map(d => daysMap[d]).filter(Boolean).join(", ");
    };

    return tasksToExport.map(t => ({
        "Fecha inicio": formatDate(t.date),
        "Fecha fin": formatDate(t.endDate),
        "Tarea": t.title,
        "Descripción": t.desc || "",
        "Prioridad": t.priority || "none",
        "Se repite": formatRecurrence(t.recurrence),
        "Días que repite": formatRecurrenceDays(t),
        "Etiquetas": formatTags(t),
        "Completada": t.status === 'completed' ? "Sí" : "No",
        "Recordatorio": formatReminder(t)
    }));
}

function populateExportFilters() {
    const folderSelect = document.getElementById('export-filter-folder');

    // Multi-Select Logic
    const tagBtn = document.getElementById('export-tag-btn');
    const tagDropdown = document.getElementById('export-tag-dropdown');
    const tagText = document.getElementById('export-tag-text');

    if (folderSelect) {
        const folders = tasks.filter(t => !!t.isFolder || (!t.date && !!t.color));
        const currentVal = folderSelect.value;
        folderSelect.innerHTML = '<option value="">Todas</option>';
        folders.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.title;
            folderSelect.appendChild(opt);
        });
        folderSelect.value = currentVal; // Restore if possible
    }

    if (tagBtn && tagDropdown) {
        // Clear previous listeners to avoid duplicates? 
        // Best approach is assuming populate called once per open, or idempotent.
        // We'll just reset innerHTML which kills old listeners on items.

        // Toggle Logic with Lazy Load
        tagBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = tagDropdown.style.display === 'block';

            if (!isVisible) {
                renderExportTags();
                tagDropdown.style.display = 'block';
            } else {
                tagDropdown.style.display = 'none';
            }
        };

        function renderExportTags() {
            console.log("Rendering export tags. Tasks:", tasks ? tasks.length : 0);
            const tagCounts = new Map();
            if (tasks && Array.isArray(tasks)) {
                tasks.forEach(t => {
                    if (t.category) {
                        t.category.split(',').forEach(tag => {
                            const cleanTag = tag.trim();
                            if (cleanTag && cleanTag !== 'comment' && cleanTag !== 'note' && !cleanTag.startsWith('|||')) {
                                tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
                            }
                        });
                    }
                });
            }

            const sortedTags = Array.from(tagCounts.keys()).sort((a, b) => {
                const diff = tagCounts.get(b) - tagCounts.get(a);
                if (diff !== 0) return diff;
                return a.localeCompare(b);
            });

            console.log("Sorted tags for dropdown:", sortedTags);

            tagDropdown.innerHTML = '';
            if (sortedTags.length === 0) {
                tagDropdown.innerHTML = '<div style="padding:10px; color:var(--text-secondary); font-size:0.8rem;">No hay etiquetas</div>';
            } else {
                sortedTags.forEach(tag => {
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.alignItems = 'center';
                    row.style.padding = '8px';
                    row.style.cursor = 'pointer';
                    row.style.borderBottom = '1px solid var(--glass-border)';

                    row.onmouseover = () => row.style.background = 'rgba(255,255,255,0.05)';
                    row.onmouseout = () => row.style.background = 'transparent';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = tag;
                    checkbox.style.marginRight = '8px';

                    const label = document.createElement('span');
                    label.textContent = tag;
                    label.style.fontSize = '0.9rem';
                    label.style.color = 'var(--text-primary)';

                    // Click Row Toggles Checkbox
                    row.onclick = (e) => {
                        if (e.target !== checkbox) {
                            checkbox.checked = !checkbox.checked;
                            updateTagText();
                        }
                    };
                    checkbox.onclick = () => updateTagText();

                    row.appendChild(checkbox);
                    row.appendChild(label);
                    tagDropdown.appendChild(row);
                });
            }
        }

        function updateTagText() {
            const checked = tagDropdown.querySelectorAll('input:checked');
            if (checked.length === 0) {
                tagText.textContent = "Todas";
            } else if (checked.length === 1) {
                tagText.textContent = checked[0].value;
            } else {
                tagText.textContent = `${checked.length} seleccionadas`;
            }
        }
    }
}

function exportTasksToExcel() {
    const rows = getTasksData();
    if (!rows) { alert("No hay tareas para exportar con los filtros seleccionados."); return; }

    const ws = XLSX.utils.json_to_sheet(rows);

    const wscols = [
        { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 40 },
        { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 15 },
        { wch: 10 }, { wch: 10 }
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tareas");

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Tareas_${dateStr}.xls`);
}


function exportTasksToCSV() {
    const rows = getTasksData();
    if (!rows) { alert("No hay tareas para exportar con los filtros seleccionados."); return; }

    // Manual CSV generation for specific control (semicolon separator)
    const headers = Object.keys(rows[0]);
    const csvContent = [
        headers.join(";"), // Header row
        ...rows.map(row => headers.map(header => {
            let val = row[header];
            // Escape quotes and wrap in quotes if it contains separator or newlines
            if (typeof val === 'string') {
                val = val.replace(/"/g, '""'); // Double quote escape
                if (val.search(/("|\n|;)/g) >= 0) val = `"${val}"`;
            }
            return val;
        }).join(";"))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, `Tareas_${dateStr}.csv`);
    } else {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Tareas_${dateStr}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

window.populateExportFilters = populateExportFilters;
window.exportTasksToExcel = exportTasksToExcel;
window.exportTasksToCSV = exportTasksToCSV;
