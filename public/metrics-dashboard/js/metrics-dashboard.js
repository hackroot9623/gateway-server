class MetricsDashboard {
    constructor() {
        this.currentTab = 'all';
        this.loading = false;
        this.routeRequestCounts = new Map();
        this.lastRefreshTime = null;
        // Remove initialization from constructor to avoid timing issues
    }

    initializeEventListeners() {
        // Initialize only after DOM is ready
        this.setupTabListeners();
        this.setupRefreshButton();
        this.setupRowClickListeners();
        this.refreshMetrics();
    }

    setupTabListeners() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const route = e.target.getAttribute('data-route');
                this.showTab(route);
            });
        });
    }

    setupRefreshButton() {
        const refreshButton = document.querySelector('.refresh-button');
        if (refreshButton) {
            // Remove any existing listeners to prevent duplicates
            refreshButton.replaceWith(refreshButton.cloneNode(true));
            const newRefreshButton = document.querySelector('.refresh-button');

            // Add click event listener with bound context
            newRefreshButton.addEventListener('click', () => {
                this.refreshMetrics();
            });
        }
    }

    setupRowClickListeners() {
        document.addEventListener('click', (e) => {
            const row = e.target.closest('.metric-row');
            if (row) {
                this.toggleRowDetails(row);
            }

            // Handle copy button clicks
            if (e.target.closest('.copy-button')) {
                e.stopPropagation(); // Prevent row toggle
                const button = e.target.closest('.copy-button');
                const textToCopy = button.getAttribute('data-copy');
                if (textToCopy) {
                    navigator.clipboard.writeText(textToCopy)
                        .then(() => {
                            button.innerHTML = '<span class="material-symbols-rounded">check</span>';
                            setTimeout(() => {
                                button.innerHTML = '<span class="material-symbols-rounded">content_copy</span>';
                            }, 2000);
                        });
                }
            }
        });
    }

    toggleRowDetails(row) {
        const wasExpanded = row.classList.contains('expanded');

        // Close any other open rows
        document.querySelectorAll('.metric-row.expanded').forEach(expandedRow => {
            if (expandedRow !== row) {
                expandedRow.classList.remove('expanded');
                expandedRow.nextElementSibling?.classList.contains('request-details') && expandedRow.nextElementSibling.remove();
            }
        });

        if (!wasExpanded) {
            row.classList.add('expanded');

            // Extract metric data
            const labels = Array.from(row.querySelectorAll('.label-pair')).map(pair => ({
                key: pair.querySelector('.label-key').textContent,
                value: pair.querySelector('.label-value').textContent
            }));

            const method = labels.find(l => l.key === 'method')?.value || '';
            const route = labels.find(l => l.key === 'route')?.value || '';
            const statusCode = labels.find(l => l.key === 'status_code')?.value || '';
            const value = row.querySelector('.metric-value').textContent.trim();
            const le = labels.find(l => l.key === 'le')?.value;

            const details = document.createElement('tr');
            details.className = 'request-details';
            details.innerHTML = this.generateDetailsContent(method, route, statusCode, value, le, labels);

            row.parentNode.insertBefore(details, row.nextSibling);

            requestAnimationFrame(() => {
                details.classList.add('visible');
            });
        } else {
            row.classList.remove('expanded');
            row.nextElementSibling?.classList.contains('request-details') && row.nextElementSibling.remove();
        }
    }

    generateDetailsContent(method, route, statusCode, value, le, labels) {
        const methodClass = `method-${method}`;
        const statusClass = this.getStatusClass(statusCode);
        const duration = parseFloat(value);
        const bucket = le ? `<= ${le}s` : 'Total';

        // Extract service name from route
        const serviceName = route.split('/')[1];

        // Get request details if available
        const requestDetails = labels.find(l => l.key === 'request_details')?.details;

        // Determine status type and message
        const statusInfo = this.getStatusInfo(statusCode);

        // Generate curl command with actual request details
        const curlCommand = this.generateCurlCommand(method, route, requestDetails);

        return `
            <td colspan="2">
                <div class="details-grid">
                    <div class="detail-section">
                        <h3>
                            <span class="material-symbols-rounded">swap_horiz</span>
                            Request Details
                        </h3>
                        <div class="detail-item">
                            <span class="detail-label">Service:</span>
                            <span class="detail-value service-name">${serviceName}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Method:</span>
                            <span class="detail-value ${methodClass}">${method}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Endpoint:</span>
                            <span class="detail-value endpoint-path">${route}</span>
                            <button class="copy-button" data-copy="${route}">
                                <span class="material-symbols-rounded">content_copy</span>
                            </button>
                        </div>
                        ${this.generateHeadersList(requestDetails)}
                    </div>

                    <div class="detail-section">
                        <h3>
                            <span class="material-symbols-rounded">done_all</span>
                            Response Details
                        </h3>
                        <div class="detail-item">
                            <span class="detail-label">Status:</span>
                            <div class="status-indicator ${statusClass}">
                                <span class="status-code">${statusCode}</span>
                                <span class="status-text">${statusInfo.message}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Duration:</span>
                            <span class="detail-value">${duration.toFixed(4)}s</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Progress:</span>
                            <div class="timing-bar">
                                <div class="timing-bar-fill ${statusClass}" style="width: ${Math.min((duration / (le || 5)) * 100, 100)}%"></div>
                            </div>
                        </div>
                        ${this.generateResponseHeaders(requestDetails)}
                    </div>

                    <div class="detail-section">
                        <h3>
                            <span class="material-symbols-rounded">monitoring</span>
                            Performance Metrics
                        </h3>
                        <div class="detail-item">
                            <span class="detail-label">Bucket:</span>
                            <span class="detail-value">${bucket}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Threshold:</span>
                            <span class="detail-value">${this.getThresholdIndicator(duration)}</span>
                        </div>
                        <div class="performance-indicators">
                            ${this.generatePerformanceIndicators(duration)}
                        </div>
                    </div>

                    <div class="detail-section">
                        <h3>
                            <span class="material-symbols-rounded">code</span>
                            Curl Command
                        </h3>
                        <div class="curl-command">
                            <pre><code>${curlCommand}</code></pre>
                            <button class="copy-button" data-copy="${curlCommand}">
                                <span class="material-symbols-rounded">content_copy</span>
                            </button>
                        </div>
                    </div>
                </div>
            </td>
        `;
    }

    generateCurlCommand(method, route, requestDetails) {
        if (!requestDetails?.request) {
            return `curl --location --request ${method} '${window.location.origin}${route}'`;
        }

        const req = requestDetails.request;
        let curlCmd = `curl --location --request ${method} '${req.url}'`;

        // Add all headers from the actual request
        Object.entries(req.headers || {}).forEach(([key, value]) => {
            // Skip browser-specific and connection headers
            const skipHeaders = [
                'connection',
                'sec-fetch-site',
                'sec-fetch-mode',
                'sec-fetch-dest',
                'sec-ch-ua',
                'sec-ch-ua-mobile',
                'sec-ch-ua-platform',
                'dnt',
                'upgrade-insecure-requests'
            ];

            if (!skipHeaders.includes(key.toLowerCase())) {
                // Properly escape single quotes in header values
                const escapedValue = value.replace(/'/g, "'\\''");
                curlCmd += ` \\\n  --header '${key}: ${escapedValue}'`;
            }
        });

        // Add request body if present
        if (req.body) {
            let bodyStr;
            if (typeof req.body === 'string') {
                try {
                    // Try to parse and re-stringify to format JSON
                    const parsed = JSON.parse(req.body);
                    bodyStr = JSON.stringify(parsed, null, 2);
                } catch {
                    // If not JSON, use as is
                    bodyStr = req.body;
                }
            } else {
                // If object, stringify with formatting
                bodyStr = JSON.stringify(req.body, null, 2);
            }

            // Properly escape single quotes in the body
            const escapedBody = bodyStr.replace(/'/g, "'\\''");

            // Use --data for POST/PUT/PATCH, --data-raw for preserving exact string
            const contentType = req.headers?.['content-type'] || '';
            if (contentType.includes('application/json')) {
                curlCmd += ` \\\n  --header 'Content-Type: application/json' \\\n  --data '${escapedBody}'`;
            } else if (contentType.includes('application/x-www-form-urlencoded')) {
                curlCmd += ` \\\n  --data-urlencode '${escapedBody}'`;
            } else {
                curlCmd += ` \\\n  --data-raw '${escapedBody}'`;
            }
        }

        return curlCmd;
    }

    generateHeadersList(details) {
        if (!details?.request?.headers) {
            return '';
        }

        const headers = details.request.headers;
        return `
            <div class="detail-item">
                <span class="detail-label">Headers:</span>
                <div class="headers-list">
                    ${Object.entries(headers)
                        .filter(([key]) => !['connection', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest'].includes(key.toLowerCase()))
                        .map(([key, value]) => `
                            <div class="header-item">
                                <span class="header-name">${key}:</span>
                                <span class="header-value">${value}</span>
                                <button class="copy-button" data-copy="${value}">
                                    <span class="material-symbols-rounded">content_copy</span>
                                </button>
                            </div>
                        `).join('')}
                </div>
            </div>
        `;
    }

    generateResponseHeaders(details) {
        if (!details?.response?.headers) {
            return '';
        }

        return `
            <div class="detail-item">
                <span class="detail-label">Response Headers:</span>
                <div class="headers-list">
                    ${Object.entries(details.response.headers)
                        .map(([key, value]) => `
                            <div class="header-item">
                                <span class="header-name">${key}:</span>
                                <span class="header-value">${value}</span>
                            </div>
                        `).join('')}
                </div>
            </div>
        `;
    }

    getStatusInfo(statusCode) {
        const code = parseInt(statusCode);
        if (code >= 500) {
            return {
                message: 'Server Error',
                icon: 'error'
            };
        } else if (code >= 400) {
            return {
                message: 'Client Error',
                icon: 'warning'
            };
        } else if (code >= 300) {
            return {
                message: 'Redirect',
                icon: 'directions'
            };
        } else if (code >= 200) {
            return {
                message: 'Success',
                icon: 'check_circle'
            };
        }
        return {
            message: 'Unknown',
            icon: 'help'
        };
    }

    getThresholdIndicator(duration) {
        if (duration <= 0.1) {
            return '<span class="performance-good">Excellent</span>';
        } else if (duration <= 0.3) {
            return '<span class="performance-ok">Good</span>';
        } else if (duration <= 1.0) {
            return '<span class="performance-warning">Fair</span>';
        } else {
            return '<span class="performance-poor">Poor</span>';
        }
    }

    generatePerformanceIndicators(duration) {
        const thresholds = [
            { limit: 0.1, label: '100ms', class: 'performance-good' },
            { limit: 0.3, label: '300ms', class: 'performance-ok' },
            { limit: 1.0, label: '1s', class: 'performance-warning' },
            { limit: Infinity, label: '>1s', class: 'performance-poor' }
        ];

        return `
            <div class="performance-bars">
                ${thresholds.map(threshold => `
                    <div class="performance-bar-item ${threshold.class} ${duration <= threshold.limit ? 'active' : ''}">
                        <span class="performance-label">${threshold.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    showTab(route) {
        this.currentTab = route;
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });

        document.getElementById(`tab-${route}`).classList.add('active');
        document.getElementById(`content-${route}`).classList.add('active');
    }

    async refreshMetrics() {
        if (this.loading) return;

        this.showLoading();
        const refreshButton = document.querySelector('.refresh-button');
        if (refreshButton) {
            refreshButton.classList.add('refreshing');
        }

        try {
            const response = await fetch('/metrics', {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch metrics');
            }

            const data = await response.json();
            this.calculateRouteRequestCounts(data);
            this.updateDashboard(data);
            this.lastRefreshTime = new Date();
            this.updateLastRefreshTime();
        } catch (error) {
            console.error('Error refreshing metrics:', error);
            this.showError('Failed to refresh metrics');
        } finally {
            this.hideLoading();
            if (refreshButton) {
                refreshButton.classList.remove('refreshing');
            }
        }
    }

    calculateRouteRequestCounts(data) {
        this.routeRequestCounts.clear();
        const totalRequestsMetric = data.metrics.find(m => m.name === 'http_requests_total');

        if (totalRequestsMetric) {
            if (totalRequestsMetric.metrics) {
                // Calculate totals for each route
                totalRequestsMetric.metrics.forEach(metric => {
                    const route = metric.labels.find(l => l.key === 'route')?.value;
                    if (route) {
                        const currentCount = this.routeRequestCounts.get(route) || 0;
                        this.routeRequestCounts.set(route, currentCount + metric.value);
                    }
                });

                // Update the tabs with the counts
                this.routeRequestCounts.forEach((count, route) => {
                    const tab = document.getElementById(`tab-${route}`);
                    if (tab) {
                        const countSpan = tab.querySelector('.route-count') || document.createElement('span');
                        countSpan.className = 'route-count';
                        countSpan.textContent = Math.round(count);
                        if (!tab.querySelector('.route-count')) {
                            tab.appendChild(countSpan);
                        }
                    }
                });

                // Calculate and update total for "All Routes" tab
                const totalCount = Array.from(this.routeRequestCounts.values()).reduce((a, b) => a + b, 0);
                const allTab = document.getElementById('tab-all');
                if (allTab) {
                    const countSpan = allTab.querySelector('.route-count') || document.createElement('span');
                    countSpan.className = 'route-count';
                    countSpan.textContent = Math.round(totalCount);
                    if (!allTab.querySelector('.route-count')) {
                        allTab.appendChild(countSpan);
                    }
                }
            }
        }
    }

    updateLastRefreshTime() {
        const timeElement = document.querySelector('.last-refresh-time');
        if (timeElement && this.lastRefreshTime) {
            timeElement.textContent = `Last updated: ${this.lastRefreshTime.toLocaleTimeString()}`;
        }
    }

    showLoading() {
        this.loading = true;
        const loadingEl = document.createElement('div');
        loadingEl.className = 'loading';
        loadingEl.innerHTML = '<div class="loading-spinner"></div>';
        document.body.appendChild(loadingEl);
    }

    hideLoading() {
        this.loading = false;
        const loadingEl = document.querySelector('.loading');
        if (loadingEl) {
            loadingEl.remove();
        }
    }

    showError(message) {
        const errorEl = document.createElement('div');
        errorEl.className = 'error-notification';
        errorEl.textContent = message;
        document.body.appendChild(errorEl);

        setTimeout(() => {
            errorEl.remove();
        }, 5000);
    }

    updateDashboard(data) {
        // Update all metrics view
        data.metrics.forEach(metric => {
            const metricElement = document.querySelector(`[data-metric="${metric.name}"]`);
            if (metricElement) {
                this.updateMetricGroup(metricElement, metric);
            }
        });

        // Update route-specific views
        data.routes.forEach(route => {
            const routeContent = document.getElementById(`content-${route.route}`);
            if (routeContent) {
                route.metrics.forEach(metric => {
                    const metricElement = routeContent.querySelector(`[data-metric="${metric.name}"]`);
                    if (metricElement) {
                        this.updateMetricGroup(metricElement, {
                            ...metric,
                            metrics: metric.routeMetrics
                        });
                    }
                });
            }
        });
    }

    updateMetricGroup(element, data) {
        const tableBody = element.querySelector('tbody');
        if (!tableBody) return;

        if (!data.hasMetrics && !data.hasRouteMetrics) {
            element.querySelector('.no-data')?.classList.remove('hidden');
            tableBody.innerHTML = '';
            return;
        }

        element.querySelector('.no-data')?.classList.add('hidden');
        tableBody.innerHTML = this.generateMetricRows(data.metrics || []);
    }

    generateMetricRows(metrics) {
        return metrics.map(metric => {
            const statusCode = metric.labels.find(l => l.key === 'status_code')?.value;
            const statusClass = this.getStatusClass(statusCode);

            return `
                <tr class="metric-row">
                    <td>
                        ${this.generateLabelPairs(metric.labels)}
                    </td>
                    <td class="metric-value ${statusClass}">
                        ${metric.formattedValue || metric.value.toFixed(4)}
                    </td>
                </tr>
            `;
        }).join('');
    }

    generateLabelPairs(labels) {
        return labels.map(label => `
            <span class="label-pair">
                <span class="label-key">${label.key}</span>
                <span class="label-equals">=</span>
                <span class="label-value ${label.key === 'method' ? `method-${label.value}` : ''}">${label.value}</span>
            </span>
        `).join(' ');
    }

    getStatusClass(statusCode) {
        if (!statusCode) return '';
        if (statusCode.startsWith('2')) return 'status-2xx';
        if (statusCode.startsWith('3')) return 'status-3xx';
        if (statusCode.startsWith('4')) return 'status-4xx';
        if (statusCode.startsWith('5')) return 'status-5xx';
        return '';
    }
}

// Initialize dashboard after DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new MetricsDashboard();
    window.dashboard.initializeEventListeners();
});
