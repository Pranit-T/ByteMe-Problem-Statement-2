document.addEventListener("DOMContentLoaded", () => {
    const problemInput = document.getElementById("problem-input");
    const sendBtn = document.getElementById("send-btn");
    const byteExpertContent = document.getElementById("byte-expert-content");
    const geminiContent = document.getElementById("gemini-content");
    const sidebar = document.getElementById("sidebar");
    const toggleSidebarBtn = document.getElementById("toggle-sidebar");
    const incognitoBtn = document.getElementById("incognito-btn");
    const profileBtn = document.getElementById("profile-btn");
    const dropdownMenu = document.getElementById("dropdown-menu");

    // Sidebar Toggle
    toggleSidebarBtn.addEventListener("click", () => {
        sidebar.classList.toggle("collapsed");
    });

    // Profile Dropdown Toggle
    profileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle("show");
    });

    document.addEventListener("click", () => {
        dropdownMenu.classList.remove("show");
    });

    // Incognito Tab (Opens fresh window)
    incognitoBtn.addEventListener("click", () => {
        window.open(window.location.href, "_blank");
    });

    // Handle Search Simulation
    function handleSend() {
        const text = problemInput.value;
        if (!text.trim()) return;

        byteExpertContent.innerHTML = `<p class="placeholder-text">Analyzing deeply...</p>`;
        geminiContent.innerHTML = `<p class="placeholder-text">Gemini is thinking...</p>`;
        problemInput.value = ""; 

        setTimeout(() => {
            byteExpertContent.innerHTML = `
                <div style="font-weight:bold; margin-bottom:10px;">Problem: ${text}</div>
                <p><strong>Technical Diagnosis:</strong> Our system identifies a specific conflict in the logic layer.</p>
                <p><strong>Expert Recommendation:</strong> Review the local dependency tree and clear the cache.</p>
            `;
            geminiContent.innerHTML = `
                <div style="font-weight:bold; margin-bottom:10px;">Problem: ${text}</div>
                <p>Gemini suggests checking standard network protocols for this error.</p>
                <p>Common fixes include verifying server credentials and updating API keys.</p>
            `;
        }, 1200); 
    }

    sendBtn.addEventListener("click", handleSend);
    problemInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSend();
    });
});