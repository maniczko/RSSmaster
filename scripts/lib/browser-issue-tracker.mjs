function isFailedResourceConsole(entry) {
  return entry.type === "error" && entry.text.startsWith("Failed to load resource:");
}

function isBenignResourceFailure(entry) {
  if (
    entry.method === "GET" &&
    entry.errorText.includes("net::ERR_ABORTED") &&
    ["document", "fetch", "xhr"].includes(entry.resourceType)
  ) {
    return {
      ignored: true,
      reason: "navigation_aborted_get_request",
    };
  }

  if (
    ["font", "image", "media"].includes(entry.resourceType) &&
    /ERR_ABORTED|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED/i.test(entry.errorText)
  ) {
    return {
      ignored: true,
      reason: "benign_media_load_failure",
    };
  }

  return (
    false
  );
}

function isIgnoredResponse(response, ignoredResponsePaths) {
  try {
    const url = new URL(response.url());
    return ignoredResponsePaths.some((path) => url.pathname === path);
  } catch {
    return false;
  }
}

export function createBrowserIssueTracker({
  consoleTypes = ["error"],
  failOnHttpStatus = true,
  ignoredResponsePaths = ["/favicon.ico"],
} = {}) {
  const consoleIssues = [];
  const ignoredConsoleIssues = [];
  const pageErrors = [];
  const requestFailures = [];
  const ignoredRequestFailures = [];
  const httpFailures = [];

  return {
    attachToPage(page) {
      page.on("console", (message) => {
        if (!consoleTypes.includes(message.type())) {
          return;
        }
        const location = message.location();
        const entry = {
          columnNumber: location.columnNumber ?? null,
          lineNumber: location.lineNumber ?? null,
          pageUrl: page.url(),
          text: message.text(),
          type: message.type(),
          url: location.url || null,
        };

        if (isFailedResourceConsole(entry)) {
          ignoredConsoleIssues.push({
            ...entry,
            reason: "browser_resource_console_noise_tracked_by_request_events",
          });
          return;
        }
        consoleIssues.push(entry);
      });

      page.on("pageerror", (error) => {
        pageErrors.push({
          message: String(error),
          pageUrl: page.url(),
        });
      });

      page.on("requestfailed", (request) => {
        const failure = request.failure();
        const entry = {
          errorText: failure?.errorText ?? "unknown",
          method: request.method(),
          pageUrl: page.url(),
          resourceType: request.resourceType(),
          url: request.url(),
        };

        const benignFailure = isBenignResourceFailure(entry);
        if (benignFailure) {
          ignoredRequestFailures.push({
            ...entry,
            reason: benignFailure.reason,
          });
          return;
        }
        requestFailures.push(entry);
      });

      if (failOnHttpStatus) {
        page.on("response", (response) => {
          const status = response.status();
          if (status < 400 || isIgnoredResponse(response, ignoredResponsePaths)) {
            return;
          }
          const request = response.request();
          httpFailures.push({
            method: request.method(),
            pageUrl: page.url(),
            resourceType: request.resourceType(),
            status,
            url: response.url(),
          });
        });
      }
    },
    consoleIssues,
    ignoredConsoleIssues,
    ignoredRequestFailures,
    httpFailures,
    pageErrors,
    requestFailures,
    get issues() {
      return {
        console: consoleIssues,
        http: httpFailures,
        ignoredConsole: ignoredConsoleIssues,
        ignoredRequest: ignoredRequestFailures,
        page: pageErrors,
        request: requestFailures,
      };
    },
    get hasBlockingIssues() {
      return consoleIssues.length > 0 || pageErrors.length > 0 || requestFailures.length > 0 || httpFailures.length > 0;
    },
    formatBlockingIssues() {
      return JSON.stringify({
        console: consoleIssues,
        http: httpFailures,
        page: pageErrors,
        request: requestFailures,
      });
    },
  };
}
