// js/main.js - Main application controller
document.addEventListener('DOMContentLoaded', () => {
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;
    
    // Check saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    html.setAttribute('data-theme', savedTheme);
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
    
    // Initialize loading
    const loadingOverlay = document.getElementById('loadingOverlay');
    
    // Simulate initial loading
    loadingOverlay.style.display = 'flex';
    setTimeout(() => {
        loadingOverlay.style.display = 'none';
    }, 500);
});

// Global utility functions
function showElement(id) {
    document.getElementById(id).style.display = 'block';
}

function hideElement(id) {
    document.getElementById(id).style.display = 'none';
}

function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

// Prevent accidental page leave during game
let gameInProgress = false;
window.addEventListener('beforeunload', (e) => {
    if (gameInProgress) {
        e.preventDefault();
        e.returnValue = '';
    }
});
