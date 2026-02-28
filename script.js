document.addEventListener("DOMContentLoaded", () => {
    // UI Elements
    const problemInput = document.getElementById("problem-input");
    const sendBtn = document.getElementById("send-btn");
    const uploadBtn = document.getElementById("upload-btn");
    const fileUpload = document.getElementById("file-upload");
    const byteExpertContent = document.getElementById("byte-expert-content");
    const aiGeneralContent = document.getElementById("ai-general-content");
    
    // Sidebar & Profile Elements
    const sidebar = document.getElementById("sidebar");
    const toggleSidebarBtn = document.getElementById("toggle-sidebar");
    const incognitoBtn = document.getElementById("incognito-btn");
    const profileBtn = document.getElementById("profile-btn");
    const dropdownMenu = document.getElementById("dropdown-menu");

    // --- NEW FEATURES ---

    // Toggle Sidebar Collapse/Expand
    toggleSidebarBtn.addEventListener("click", () => {
        sidebar.classList.toggle("collapsed");
    });

    // Handle Incognito Button (Opens in new tab)
    incognitoBtn.addEventListener("click", () => {
        // Opens the current window URL in a new blank tab to act as a "fresh" unsaved session
        window.open(window.location.href, "_blank");
    });

    // --- EXISTING FEATURES ---

    // Toggle Profile Dropdown
    profileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle("show");
    });

    document.addEventListener("click", (e) => {
        if (!dropdownMenu.contains(e.target) && !profileBtn.contains(e.target)) {
            dropdownMenu.classList.remove("show");
        }
    });

    // Handle File Upload
    uploadBtn.addEventListener("click", () => {
        fileUpload.click(); 
    });

    fileUpload.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            const fileName = e.target.files[0].name;
            problemInput.value = `[File Attached: ${fileName}] `;
            problemInput.focus();
        }
    });

    // Simulate generating responses
    function handleSend() {
        const text = problemInput.value;
        if (text.trim() === "") return;

        byteExpertContent.innerHTML = `<p class="placeholder-text">Analyzing deeply with ByteExpert...</p>`;
        aiGeneralContent.innerHTML = `<p class="placeholder-text">Generating generalized response...</p>`;
        problemInput.value = ""; 

        setTimeout(() => {
            byteExpertContent.innerHTML = `
                <div class="user-query-label">Problem: ${text}</div>
                <p><strong>Diagnosis:</strong> Based on the specific architecture of ByteMe, the bottleneck is likely occurring at the database indexing level.</p><br>
                <p><strong>Actionable Solution:</strong></p>
                <ol style="margin-left: 20px;">
                    <li>Implement a composite index on the queried fields.</li>
                    <li>Refactor the API payload to paginate results.</li>
                    <li>Refer to internal documentation section 4.2 for cache invalidation.</li>
                </ol>
            `;

            aiGeneralContent.innerHTML = `
                <div class="user-query-label">Problem: ${text}</div>
                <p>Here are a few common reasons this issue might happen in a standard web application:</p><br>
                <ul style="margin-left: 20px;">
                    <li><strong>Server Latency:</strong> Your backend might be taking too long to process the request.</li>
                    <li><strong>Network Issues:</strong> The user's connection might be unstable.</li>
                    <li><strong>Inefficient Code:</strong> Check for loops or complex calculations slowing down the thread.</li>
                </ul><br>
                <p>I recommend profiling your application's performance to isolate the root cause.</p>
            `;
        }, 1200); 
    }

    sendBtn.addEventListener("click", handleSend);

    problemInput.addEventListener("keypress", function (e) {
        if (e.key === "Enter") {
            handleSend();
        }
    });
});