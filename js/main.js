// Navigation and Menu Functions
function toggleMobileNav() {
    const mobileNav = document.getElementById("mobileNav");
    const mobileOverlay = document.getElementById("mobileOverlay");
    const isActive = mobileNav.classList.contains("active");

    if (isActive) {
        closeMobileNav();
    } else {
        openMobileNav();
    }
}

function openMobileNav() {
    const mobileNav = document.getElementById("mobileNav");
    const mobileOverlay = document.getElementById("mobileOverlay");

    mobileNav.classList.add("active");
    mobileOverlay.classList.add("active");
    document.body.style.overflow = "hidden"; // Prevent scrolling
}

function closeMobileNav() {
    const mobileNav = document.getElementById("mobileNav");
    const mobileOverlay = document.getElementById("mobileOverlay");

    mobileNav.classList.remove("active");
    mobileOverlay.classList.remove("active");
    document.body.style.overflow = ""; // Restore scrolling
}

// Initialize events on page load
document.addEventListener('DOMContentLoaded', function() {
    // Close menu when clicking links
    document.querySelectorAll(".mobile-nav a").forEach(link => {
        link.addEventListener("click", () => {
            closeMobileNav();
        });
    });

    // Close menu on Escape key
    document.addEventListener("keydown", function(event) {
        if (event.key === "Escape") {
            closeMobileNav();
        }
    });

    // Prevent closing when clicking inside the menu
    const mobileNav = document.getElementById("mobileNav");
    if (mobileNav) {
        mobileNav.addEventListener("click", function(event) {
            event.stopPropagation();
        });
    }
});
