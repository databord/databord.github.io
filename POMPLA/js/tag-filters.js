import { state } from './state.js';
import { applyFilters } from './data.js';

export function setupTagFilters() {
    // 1. Desktop Checkbox Toggle Logic (Show/Hide Container)
    const btnTags = document.getElementById('btn-tags-filter');
    if (btnTags) {
        btnTags.addEventListener('click', () => {
            const container = document.getElementById('category-tags-container');
            const filters = document.querySelector('.task-filters');

            if (container && filters) {
                const isHidden = container.classList.contains('hidden');
                if (isHidden) {
                    container.classList.remove('hidden');
                    filters.classList.add('hidden'); // Hide other filters when tags open
                    btnTags.classList.add('active');
                } else {
                    container.classList.add('hidden');
                    filters.classList.remove('hidden'); // Show filters back
                    btnTags.classList.remove('active');
                }
            }
        });
    }

    // 2. Mobile Checkbox Toggle logic
    const mobileBtnTags = document.getElementById('mobile-btn-tags-filter');
    if (mobileBtnTags) {
        mobileBtnTags.addEventListener('click', () => {
            const container = document.getElementById('mobile-category-tags-container');
            const filters = document.querySelector('.mobile-filters-section');

            if (container && filters) {
                const isHidden = container.classList.contains('hidden');
                if (isHidden) {
                    container.classList.remove('hidden');
                    if (filters) filters.classList.add('hidden');
                    mobileBtnTags.classList.add('active');
                } else {
                    container.classList.add('hidden');
                    if (filters) filters.classList.remove('hidden');
                    mobileBtnTags.classList.remove('active');
                }
            }
        });
    }

    // 3. Setup Tag Clicks (Desktop)
    const container = document.getElementById('category-tags-container');
    if (container) {
        // Delegate for main-tag-chip clicks (which are dynamically rendered)
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('main-tag-chip')) {
                const tag = e.target.dataset.tag;
                if (state.activeFilters.mainTags.has(tag)) {
                    state.activeFilters.mainTags.delete(tag);
                    e.target.classList.remove('active');
                } else {
                    state.activeFilters.mainTags.add(tag);
                    e.target.classList.add('active');
                }
                applyFilters();
            }
        });
    }

    // 4. Setup Tag Clicks (Mobile)
    const mobileContainer = document.getElementById('mobile-category-tags-container');
    if (mobileContainer) {
        mobileContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('main-tag-chip')) {
                const tag = e.target.dataset.tag;
                if (state.activeFilters.mainTags.has(tag)) {
                    state.activeFilters.mainTags.delete(tag);
                    e.target.classList.remove('active');
                } else {
                    state.activeFilters.mainTags.add(tag);
                    e.target.classList.add('active');
                }
                applyFilters();
            }
        });
    }
}
// Helper to identify folder tasks (always visible regardless of date)
export function isTaskFolder(task) {
    return !!task.isFolder || (!task.date && !!task.color);
}
