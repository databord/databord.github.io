// Helper to get formatted task data
function getTasksData() {
    if (!tasks || tasks.length === 0) return null;

    // Filter: Include only tasks (no comments, no notes)
    const tasksToExport = tasks.filter(t =>
        !t.isTimelineComment &&
        t.category !== 'comment' &&
        t.category !== 'note'
    );

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

function exportTasksToExcel() {
    const rows = getTasksData();
    if (!rows) { alert("No hay tareas para exportar."); return; }

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
    if (!rows) { alert("No hay tareas para exportar."); return; }

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

window.exportTasksToExcel = exportTasksToExcel;
window.exportTasksToCSV = exportTasksToCSV;
