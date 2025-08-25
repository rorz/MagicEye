// Content script for MagicEyes
// Handles in-page operations that require DOM access

export async function captureFullPageScreenshot(): Promise<string | null> {
  const originalPosition = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };

  try {
    // Get page dimensions
    const pageHeight = document.documentElement.scrollHeight;
    const pageWidth = document.documentElement.scrollWidth;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Calculate number of screenshots needed
    const rows = Math.ceil(pageHeight / viewportHeight);
    const cols = Math.ceil(pageWidth / viewportWidth);

    const screenshots: Array<{ x: number; y: number; data: string }> = [];

    // Capture each viewport
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * viewportWidth;
        const y = row * viewportHeight;

        window.scrollTo(x, y);

        // Wait for scroll to settle
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Request screenshot from background
        const response = await chrome.runtime.sendMessage({
          type: "capture_viewport_internal",
        });

        if (response.success) {
          screenshots.push({ x, y, data: response.data });
        }
      }
    }

    // Restore original scroll position
    window.scrollTo(originalPosition.scrollX, originalPosition.scrollY);

    // TODO: Stitch screenshots together using canvas
    // For now, return the first screenshot as a placeholder
    return screenshots[0]?.data || null;
  } catch (error) {
    console.error("Error capturing full page:", error);
    window.scrollTo(originalPosition.scrollX, originalPosition.scrollY);
    return null;
  }
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "capture_full_page_from_content") {
    captureFullPageScreenshot().then(sendResponse);
    return true; // Keep message channel open
  }
});
