import { state } from './state.js';

export function setupAuthListeners() {
    const authForm = document.getElementById('auth-form');
    const authTitle = document.getElementById('auth-title');
    const emailInput = document.getElementById('auth-email');
    const passInput = document.getElementById('auth-password');
    const passConfirmInput = document.getElementById('auth-password-confirm');
    const inviteInput = document.getElementById('auth-invite-code');
    const grpConfirm = document.getElementById('grp-auth-confirm');
    const grpInvite = document.getElementById('grp-auth-invite');
    const errorMsg = document.getElementById('auth-error');
    const btnSubmit = document.getElementById('btn-auth-submit');
    const btnToggle = document.getElementById('btn-toggle-auth');
    const switchText = document.getElementById('auth-switch-text');
    const btnLogout = document.getElementById('logout-btn');

    let isLoginMode = true;

    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            isLoginMode = !isLoginMode;
            errorMsg.style.display = 'none';
            if (isLoginMode) {
                authTitle.textContent = "Iniciar Sesión";
                btnSubmit.textContent = "Iniciar Sesión";
                switchText.textContent = "¿No tienes cuenta?";
                btnToggle.textContent = "Registrarse";
                grpConfirm.style.display = 'none';
                grpInvite.style.display = 'none';
                passConfirmInput.required = false;
                inviteInput.required = false;
            } else {
                authTitle.textContent = "Crear Cuenta";
                btnSubmit.textContent = "Registrarse";
                switchText.textContent = "¿Ya tienes cuenta?";
                btnToggle.textContent = "Iniciar Sesión";
                grpConfirm.style.display = 'block';
                grpInvite.style.display = 'block';
                passConfirmInput.required = true;
                inviteInput.required = true;
            }
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorMsg.style.display = 'none';
            const email = emailInput.value;
            const password = passInput.value;

            if (!email || !password) return;
            if (password.length < 6) {
                errorMsg.textContent = "La contraseña debe tener al menos 6 caracteres.";
                errorMsg.style.display = 'block';
                return;
            }

            let result;
            if (isLoginMode) {
                if (window.authLogin) {
                    btnSubmit.textContent = "Iniciando...";
                    btnSubmit.disabled = true;
                    result = await window.authLogin(email, password);
                }
            } else {
                const passConfirm = passConfirmInput.value;
                const inviteCode = inviteInput.value.trim();

                if (password !== passConfirm) {
                    errorMsg.textContent = "Las contraseñas no coinciden.";
                    errorMsg.style.display = 'block';
                    return;
                }
                if (!inviteCode) {
                    errorMsg.textContent = "Código de invitación requerido.";
                    errorMsg.style.display = 'block';
                    return;
                }

                // Verificación de código (simulado o real)
                btnSubmit.textContent = "Verificando código...";
                btnSubmit.disabled = true;

                if (window.checkInvitationCode) {
                    const codeCheck = await window.checkInvitationCode(inviteCode);
                    if (!codeCheck.valid) {
                        errorMsg.textContent = codeCheck.message || "Código inválido.";
                        errorMsg.style.display = 'block';
                        btnSubmit.textContent = "Registrarse";
                        btnSubmit.disabled = false;
                        return;
                    }
                }

                if (window.authRegister) {
                    btnSubmit.textContent = "Registrando...";
                    result = await window.authRegister(email, password);
                }
            }

            btnSubmit.disabled = false;
            if (result) {
                if (!result.success) {
                    errorMsg.textContent = result.message;
                    errorMsg.style.display = 'block';
                    btnSubmit.textContent = isLoginMode ? "Iniciar Sesión" : "Registrarse";
                } else {
                    emailInput.value = '';
                    passInput.value = '';
                    if (!isLoginMode) alert("Cuenta creada con éxito.");
                    btnSubmit.textContent = isLoginMode ? "Iniciar Sesión" : "Registrarse";
                }
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm("¿Cerrar sesión?")) {
                if (window.authLogout) window.authLogout();
            }
        });
        const btnLogoutDup = document.querySelector('.logout-btn-dup');
        if (btnLogoutDup) {
            btnLogoutDup.addEventListener('click', () => {
                if (confirm("¿Cerrar sesión?")) {
                    if (window.authLogout) window.authLogout();
                }
            });
        }
    }
}

export function setupSidebar() {
    const appContainer = document.getElementById('app-container');
    const sidebar = document.querySelector('.sidebar');
    const resizer = document.getElementById('resizer');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const expandBtn = document.getElementById('sidebar-expand-btn');

    if (!appContainer || !sidebar || !resizer || !collapseBtn || !expandBtn) return;

    let isResizing = false;
    let lastWidth = 350;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        let newWidth = e.clientX;
        if (newWidth < 50) newWidth = 50;
        if (newWidth > 600) newWidth = 600;
        appContainer.style.gridTemplateColumns = `${newWidth}px 1fr`;
        lastWidth = newWidth;
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = '';
        }
    });

    collapseBtn.addEventListener('click', () => {
        appContainer.style.gridTemplateColumns = '1fr';
        sidebar.style.display = 'none';
        expandBtn.style.display = 'block';
    });

    expandBtn.addEventListener('click', () => {
        appContainer.style.gridTemplateColumns = `${lastWidth}px 1fr`;
        sidebar.style.display = 'flex';
        expandBtn.style.display = 'none';
    });
}

export async function loadTheme(themeName) {
    // If no theme provided, try local storage or default
    if (!themeName) {
        themeName = localStorage.getItem('planner_theme') || 'default';
    }

    try {
        const response = await fetch(`temas/tema_${themeName}.json`);
        if (!response.ok) throw new Error('Theme not found');
        const themeData = await response.json();
        for (const [key, value] of Object.entries(themeData)) {
            document.documentElement.style.setProperty(key, value);
        }
        // Save logic should be here or where it's called? 
        // Usually called with specific theme when changing.
        // If called without arg (init), we just load.
    } catch (error) {
        console.error('Error loading theme:', error);
        // Fallback to default if custom fails?
        if (themeName !== 'default') loadTheme('default');
    }
}

export function setupCustomSelect() {
    const select = document.getElementById('task-icon-select');
    if (!select) return;

    // Check if wrapper already exists
    if (select.parentNode.classList.contains('custom-select-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    select.style.display = 'none';
    const customSelect = document.createElement('div');
    customSelect.className = 'custom-select';
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    trigger.innerHTML = `<span>${select.options[select.selectedIndex].text}</span> <div class="custom-select-arrow"></div>`;
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'custom-options';

    Array.from(select.options).forEach(option => {
        const customOption = document.createElement('div');
        customOption.className = 'custom-option';
        customOption.dataset.value = option.value;
        if (option.value && option.value !== 'custom') {
            customOption.innerHTML = `<i class="${option.value}"></i> <span>${option.text}</span>`;
        } else {
            customOption.innerHTML = `<span>${option.text}</span>`;
        }
        if (option.selected) customOption.classList.add('selected');
        customOption.addEventListener('click', () => {
            customSelect.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
            customOption.classList.add('selected');
            trigger.querySelector('span').innerHTML = customOption.innerHTML;
            select.value = option.value;
            select.dispatchEvent(new Event('change'));
            customSelect.classList.remove('open');
        });
        optionsContainer.appendChild(customOption);
    });

    customSelect.appendChild(trigger);
    customSelect.appendChild(optionsContainer);
    wrapper.appendChild(customSelect);
    trigger.addEventListener('click', (e) => { e.stopPropagation(); customSelect.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!customSelect.contains(e.target)) customSelect.classList.remove('open'); });
    select.addEventListener('change', () => {
        const selectedOption = Array.from(select.options).find(opt => opt.value === select.value);
        if (selectedOption) {
            let content = `<span>${selectedOption.text}</span>`;
            if (selectedOption.value && selectedOption.value !== 'custom') {
                content = `<i class="${selectedOption.value}"></i> <span>${selectedOption.text}</span>`;
            }
            trigger.querySelector('span').innerHTML = content;
            customSelect.querySelectorAll('.custom-option').forEach(opt => {
                if (opt.dataset.value === select.value) opt.classList.add('selected');
                else opt.classList.remove('selected');
            });
        }
    });
}

export function setupSettings() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings');
    const settingsTabBtns = document.querySelectorAll('.settings-tabs-container .tab-btn');
    const settingsTabContents = document.querySelectorAll('.settings-tab-content');

    if (settingsBtn && settingsModal && closeSettingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('active');
            if (window.populateExportFilters) window.populateExportFilters();
        });

        // Duplicate settings button for mobile header
        const settingsBtnDup = document.querySelector('.settings-btn-dup');
        if (settingsBtnDup) {
            settingsBtnDup.addEventListener('click', () => {
                settingsModal.classList.add('active');
                if (window.populateExportFilters) window.populateExportFilters();
            });
        }

        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('active');
        });

        // Close on outside click
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('active');
            }
        });

        // Tab Switching
        settingsTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons and contents
                settingsTabBtns.forEach(b => b.classList.remove('active'));
                settingsTabContents.forEach(c => {
                    c.style.display = 'none';
                    c.classList.remove('active');
                });

                // Activate clicked button and corresponding content
                btn.classList.add('active');
                const tabId = btn.getAttribute('data-tab');
                const content = document.getElementById(`tab-${tabId}`);
                if (content) {
                    content.style.display = 'block';
                    content.classList.add('active');
                }
            });
        });

        // Theme Selector Logic
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            // Load saved theme
            const savedTheme = localStorage.getItem('planner_theme') || 'default';
            themeSelect.value = savedTheme;
            // Note: loadTheme is already called in main.js on init, but we ensure UI sync here.

            themeSelect.addEventListener('change', (e) => {
                const theme = e.target.value;
                loadTheme(theme);
                localStorage.setItem('planner_theme', theme);
            });
        }
    }
}
