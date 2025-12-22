// js/state.js

export const state = {
    tasks: [],
    currentDate: new Date(),

    // Timer State
    timerInterval: null,
    timeLeft: 25 * 60,
    isTimerRunning: false,
    activeTaskId: null,
    pomodoro: {
        cycle: 1,
        isBreak: false,
        totalCycles: 1,
        workTime: 25,
        breakTime: 5
    },

    // UI State
    currentView: 'calendar', // 'calendar', 'list', 'timeline'
    mainViewRange: 'month',  // 'month', 'week', 'today'
    listDensity: localStorage.getItem('planner_list_density') || 'normal',
    expandedTasks: new Set(),

    // Filtering State
    activeFilters: {
        dateRange: 'today',
        tags: new Set(),
        status: 'all',
        folderId: null,
        mainTags: new Set(),
        customStart: null,
        customEnd: null
    },

    // Daily Goal
    dailyGoal: parseInt(localStorage.getItem('planner_daily_goal')) || 5,
    confettiTriggeredToday: false,

    // Utils
    notifiedTasks: new Set() // Para evitar notificaciones duplicadas
};

// Constantes visuales
export const ICONS = {
    edit: '<i class="fa-solid fa-pen"></i>',
    delete: '<i class="fa-solid fa-trash"></i>',
    play: '<i class="fa-solid fa-play"></i>',
    check: '<i class="fa-solid fa-check"></i>',
    add: '<i class="fa-solid fa-plus"></i>',
    chevronDown: '<i class="fa-solid fa-chevron-down"></i>',
    pause: '<i class="fa-solid fa-pause"></i>'
};