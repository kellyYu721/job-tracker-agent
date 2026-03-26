const DEFAULT_API_URL = "http://localhost:3000";

// Load saved API URL
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["apiUrl"], (result) => {
    document.getElementById("apiUrl").value = result.apiUrl || DEFAULT_API_URL;
  });
});

// Save API URL when changed
document.getElementById("apiUrl").addEventListener("change", (e) => {
  chrome.storage.local.set({ apiUrl: e.target.value });
});

// Get API URL
function getApiUrl() {
  return document.getElementById("apiUrl").value || DEFAULT_API_URL;
}

// Parse button click
document.getElementById("parseBtn").addEventListener("click", async () => {
  const content = document.getElementById("content");
  content.innerHTML = `<div class="status loading">Extracting page content...</div>`;

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Execute script to get page content
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Remove noise elements
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll("script, style, nav, footer, header, aside, noscript, iframe").forEach(el => el.remove());
        return {
          text: clone.innerText.replace(/\s+/g, " ").trim().slice(0, 10000),
          url: window.location.href,
          title: document.title,
        };
      },
    });

    const pageData = result.result;
    content.innerHTML = `<div class="status loading">Parsing job details...</div>`;

    // Send to API
    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/api/parse-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: pageData.text,
        url: pageData.url,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    // Show parsed job details
    const job = data.job;
    content.innerHTML = `
      <div class="status success">✅ Job parsed successfully!</div>
      <div class="job-details">
        <h2>${job.company}</h2>
        <p><strong>${job.role}</strong></p>
        <p>📍 ${job.location || "Location not specified"}</p>
        ${job.salaryRange ? `<p>💰 ${job.salaryRange}</p>` : ""}
        ${job.requirements?.length > 0 ? `
          <div class="requirements">
            <strong>Requirements:</strong> ${job.requirements.slice(0, 5).join(", ")}${job.requirements.length > 5 ? "..." : ""}
          </div>
        ` : ""}
      </div>
      <button class="primary" id="saveBtn">Save to Tracker</button>
      <button class="secondary" id="cancelBtn">Cancel</button>
    `;

    // Save button
    document.getElementById("saveBtn").addEventListener("click", async () => {
      document.getElementById("saveBtn").disabled = true;
      document.getElementById("saveBtn").textContent = "Saving...";

      try {
        const saveResponse = await fetch(`${apiUrl}/api/parse-job`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: pageData.text,
            url: pageData.url,
            save: true,
          }),
        });

        const saveData = await saveResponse.json();

        if (saveData.error) {
          throw new Error(saveData.error);
        }

        content.innerHTML = `
          <div class="status success">
            ✅ Saved!<br>
            <strong>${saveData.application.company}</strong> — ${saveData.application.role}
          </div>
          <button class="secondary" id="closeBtn">Close</button>
        `;

        document.getElementById("closeBtn").addEventListener("click", () => window.close());

      } catch (err) {
        content.innerHTML = `
          <div class="status error">❌ Failed to save: ${err.message}</div>
          <button class="secondary" id="retryBtn">Try Again</button>
        `;
        document.getElementById("retryBtn").addEventListener("click", () => location.reload());
      }
    });

    // Cancel button
    document.getElementById("cancelBtn").addEventListener("click", () => {
      location.reload();
    });

  } catch (err) {
    content.innerHTML = `
      <div class="status error">❌ Error: ${err.message}</div>
      <button class="secondary" id="retryBtn">Try Again</button>
    `;
    document.getElementById("retryBtn").addEventListener("click", () => location.reload());
  }
});