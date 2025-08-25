// Auto-capture monitor for MagicEyes
interface MonitorConfig {
  enabled: boolean;
  captureOnError: boolean;
  captureOnNavigation: boolean;
  captureOnMutation: boolean;
  captureOnClick: boolean;
  captureOnFormSubmit: boolean;
  debounceMs: number;
}

class VisionMonitor {
  private config: MonitorConfig = {
    enabled: true,  // Default to enabled
    captureOnError: true,
    captureOnNavigation: true,
    captureOnMutation: true,
    captureOnClick: true,
    captureOnFormSubmit: true,
    debounceMs: 500
  };

  private mutationObserver: MutationObserver | null = null;
  private lastCapture = 0;
  private pendingCapture: NodeJS.Timeout | null = null;
  private captureQueue: Set<string> = new Set();

  constructor() {
    this.init();
  }

  private init() {
    // Listen for config updates from extension
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'UPDATE_MONITOR_CONFIG') {
        this.config = { ...this.config, ...msg.config };
        this.config.enabled ? this.start() : this.stop();
        sendResponse({ success: true });
      }
      if (msg.type === 'GET_MONITOR_STATUS') {
        sendResponse({ enabled: this.config.enabled, config: this.config });
      }
    });

    // Auto-start based on autoCaptureEnabled setting (default to true)
    chrome.storage.local.get('autoCaptureEnabled', (result) => {
      // Default to true if not explicitly set to false
      const enabled = result.autoCaptureEnabled !== false;
      this.config.enabled = enabled;
      if (enabled) {
        this.start();
      }
    });
  }

  private start() {
    
    // Monitor console errors
    if (this.config.captureOnError) {
      this.monitorErrors();
    }

    // Monitor navigation
    if (this.config.captureOnNavigation) {
      this.monitorNavigation();
    }

    // Monitor DOM mutations
    if (this.config.captureOnMutation) {
      this.monitorMutations();
    }

    // Monitor clicks
    if (this.config.captureOnClick) {
      this.monitorClicks();
    }

    // Monitor form submissions
    if (this.config.captureOnFormSubmit) {
      this.monitorForms();
    }

    // Initial capture
    this.capture('initial_load');
  }

  private stop() {
    
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    // Remove all listeners
    window.removeEventListener('error', this.handleError);
  }

  private monitorErrors() {
    // Intercept console.error
    const originalError = console.error;
    console.error = (...args) => {
      originalError.apply(console, args);
      this.capture('console_error', {
        error: args.map(a => String(a)).join(' '),
        stack: new Error().stack
      });
    };

    // Monitor unhandled errors
    window.addEventListener('error', this.handleError);
    window.addEventListener('unhandledrejection', (event) => {
      this.capture('unhandled_rejection', {
        reason: String(event.reason),
        promise: String(event.promise)
      });
    });
  }

  private handleError = (event: ErrorEvent) => {
    this.capture('runtime_error', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error?.stack
    });
  };

  private monitorNavigation() {
    // Monitor history changes
    const pushState = history.pushState;
    const replaceState = history.replaceState;

    history.pushState = (...args) => {
      const result = pushState.apply(history, args);
      this.capture('navigation_push', { url: window.location.href });
      return result;
    };

    history.replaceState = (...args) => {
      const result = replaceState.apply(history, args);
      this.capture('navigation_replace', { url: window.location.href });
      return result;
    };

    window.addEventListener('popstate', () => {
      this.capture('navigation_back', { url: window.location.href });
    });
  }

  private monitorMutations() {
    this.mutationObserver = new MutationObserver((mutations) => {
      // Debounce mutations
      const significantChange = mutations.some(m => 
        m.type === 'childList' && 
        (m.addedNodes.length > 5 || m.removedNodes.length > 5)
      );

      if (significantChange) {
        this.debouncedCapture('dom_mutation', {
          mutations: mutations.length,
          timestamp: Date.now()
        });
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'disabled']
    });
  }

  private monitorClicks() {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const selector = this.getSelector(target);
      
      // Capture important clicks
      if (target.matches('button, a, input[type="submit"], [role="button"]')) {
        this.capture('user_click', {
          selector,
          text: target.textContent?.trim().substring(0, 50),
          tagName: target.tagName
        });
      }
    }, true);
  }

  private monitorForms() {
    document.addEventListener('submit', (event) => {
      const form = event.target as HTMLFormElement;
      const selector = this.getSelector(form);
      
      this.capture('form_submit', {
        selector,
        action: form.action,
        method: form.method
      });

      // Capture result after submission
      setTimeout(() => {
        this.capture('form_result', {
          url: window.location.href,
          selector
        });
      }, 2000);
    }, true);
  }

  private getSelector(element: HTMLElement): string {
    if (element.id) return `#${element.id}`;
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c).join('.');
      if (classes) return `.${classes}`;
    }
    return element.tagName.toLowerCase();
  }

  private debouncedCapture(reason: string, metadata?: any) {
    if (this.pendingCapture) {
      clearTimeout(this.pendingCapture);
    }

    this.pendingCapture = setTimeout(() => {
      this.capture(reason, metadata);
      this.pendingCapture = null;
    }, this.config.debounceMs);
  }

  private async capture(reason: string, metadata?: any) {
    // Rate limiting
    const now = Date.now();
    if (now - this.lastCapture < 200) return;
    this.lastCapture = now;

    // Dedupe similar captures
    const captureKey = `${reason}-${JSON.stringify(metadata)}`;
    if (this.captureQueue.has(captureKey)) return;
    this.captureQueue.add(captureKey);

    // Clear queue after processing
    setTimeout(() => this.captureQueue.delete(captureKey), 1000);


    // Send to background for processing
    chrome.runtime.sendMessage({
      type: 'AUTO_CAPTURE',
      reason,
      metadata,
      timestamp: now,
      url: window.location.href,
      title: document.title
    });
  }
}

// Initialize monitor on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new VisionMonitor());
} else {
  new VisionMonitor();
}