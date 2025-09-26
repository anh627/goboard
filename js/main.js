'use strict';

// Global state
let appState = { gameInProgress: false };

// Utility functions as an object for modularity
const UIUtils = {
    showElement(id, displayType = 'block') {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = displayType;
        } else {
            console.warn(`Element with id "${id}" not found`);
        }
    },
    hideElement(id) {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
        } else {
            console.warn(`Element with id "${id}" not found`);
        }
    },
    updateStatus(message) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = message;
        } else {
            console.warn('Status element not found');
        }
    }
};

// Function to set game state (call this from other parts of your app)
function setGameInProgress(isInProgress) {
    appState.gameInProgress = isInProgress;
}

// Async init function for loading
async function initApp() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        UIUtils.showElement('loadingOverlay', 'flex');  // Use utility
        loadingOverlay.classList.add('fade-in');

        try {
            // Simulate or real data loading (replace with your actual fetch)
            const data = await fetch('/api/data')  // Example: replace with real endpoint
                .then(res => {
                    if (!res.ok) throw new Error('Network response was not ok');
                    return res.json();
                });
            // Process data if needed (e.g., console.log(data));
            UIUtils.updateStatus('Loading complete!');  // Example usage
        } catch (error) {
            console.error('Loading error:', error);
            UIUtils.updateStatus('Error loading data');
        } finally {
            loadingOverlay.classList.add('fade-out');
            setTimeout(() => {
                UIUtils.hideElement('loadingOverlay');
            }, 500);  // Wait for animation
        }
    } else {
        console.warn('Loading overlay not found');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;

    // Check saved theme or system preference
    let savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
        savedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    html.setAttribute('data-theme', savedTheme);

    if (themeToggle) {
        themeToggle.setAttribute('aria-label', 'Toggle theme');  // Accessibility
        themeToggle.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            // Add transition
            html.classList.add('theme-transition');
            setTimeout(() => html.classList.remove('theme-transition'), 300);
        });
    } else {
        console.warn('Theme toggle element not found');
    }

    // Initialize loading
    initApp();
});

// Prevent accidental page leave during game
window.addEventListener('beforeunload', (e) => {
    if (appState.gameInProgress) {
        e.preventDefault();
        e.returnValue = 'Bạn có chắc muốn rời khỏi? Tiến trình game sẽ mất!';  // Custom message
    }
});

// Export if using modules (optional, for larger projects)
// export { UIUtils, setGameInProgress };
