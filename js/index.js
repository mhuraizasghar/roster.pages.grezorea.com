(async function() {
    "use strict";
    await Store.init();

    // Check if student is signed in
    const student = Store.getStudent();
    if (student) {
        const banner = document.getElementById("loggedInBanner");
        const emailSpan = document.getElementById("loggedInUserEmail");
        if (banner && emailSpan) {
            emailSpan.textContent = student.email;
            banner.classList.remove("d-none");
        }
    }

    // Interactive Video / Simulation Mockup Logic
    let currentStep = 1;
    let autoTourTimer = null;
    const totalSteps = 4;
    const timers = ["00:15 / 01:00", "00:30 / 01:00", "00:45 / 01:00", "01:00 / 01:00"];

    function setStep(step) {
        currentStep = Math.max(1, Math.min(totalSteps, step));
        
        // Update tabs
        document.querySelectorAll(".video-step-tab").forEach(tab => {
            const s = Number(tab.dataset.step);
            tab.classList.toggle("active", s === currentStep);
        });

        // Update simulation frames
        for (let i = 1; i <= totalSteps; i++) {
            const frame = document.getElementById(`simStep${i}`);
            if (frame) {
                frame.classList.toggle("d-none", i !== currentStep);
            }
        }

        // Update progress indicators
        const stepNum = document.getElementById("currentStepNum");
        if (stepNum) stepNum.textContent = currentStep;

        const progressBar = document.getElementById("simProgressBar");
        if (progressBar) progressBar.style.width = `${(currentStep / totalSteps) * 100}%`;

        const timerDisplay = document.getElementById("videoTimerDisplay");
        if (timerDisplay) timerDisplay.textContent = timers[currentStep - 1];
    }

    // Step tabs click event
    document.querySelectorAll(".video-step-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            stopAutoTour();
            setStep(Number(tab.dataset.step));
        });
    });

    const nextBtn = document.getElementById("simNextBtn");
    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            stopAutoTour();
            setStep(currentStep >= totalSteps ? 1 : currentStep + 1);
        });
    }

    const prevBtn = document.getElementById("simPrevBtn");
    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            stopAutoTour();
            setStep(currentStep <= 1 ? totalSteps : currentStep - 1);
        });
    }

    function stopAutoTour() {
        if (autoTourTimer) {
            clearInterval(autoTourTimer);
            autoTourTimer = null;
            const playBtn = document.getElementById("simPlayPauseBtn");
            if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play me-1"></i>Auto Tour';
        }
    }

    const playBtn = document.getElementById("simPlayPauseBtn");
    if (playBtn) {
        playBtn.addEventListener("click", () => {
            if (autoTourTimer) {
                stopAutoTour();
            } else {
                playBtn.innerHTML = '<i class="fa-solid fa-pause me-1"></i>Pause Tour';
                autoTourTimer = setInterval(() => {
                    setStep(currentStep >= totalSteps ? 1 : currentStep + 1);
                }, 2800);
            }
        });
    }
})();
