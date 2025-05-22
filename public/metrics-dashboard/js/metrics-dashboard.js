class MetricsDashboard {
    constructor() {
        this.currentTab = 'all';
        this.loading = false;
        this.routeRequestCounts = new Map();
        this.lastRefreshTime = null;
        this.autoRefreshInterval = null;
        this.autoRefreshEnabled = false;
        this.REFRESH_INTERVAL = 5000; // 5 seconds
        this.currentMetricsData = null; // Added property to store fetched data
    }

    initializeEventListeners() {
        // Initialize only after DOM is ready
        this.setupTabListeners();
        this.setupRefreshButton();
        this.setupRowClickListeners();
        this.setupAutoRefreshToggle();
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
                // Find the corresponding metric data from the current data
                const labels = Array.from(row.querySelectorAll('.label-pair')).map(pair => ({
                    key: pair.querySelector('.label-key').textContent,
                    value: pair.querySelector('.label-value').textContent
                }));

                let metricData = null;
                if (this.currentMetricsData) {
                    // Search in the main metrics array
                    metricData = this.currentMetricsData.metrics.find(m =>
                        m.metrics.some(item =>
                            item.labels.length === labels.length &&
                            item.labels.every(l1 => labels.some(l2 => l1.key === l2.key && l1.value === l2.value))
                        )
                    );
                    // If not found, search in route-specific metrics (if applicable)
                    if (!metricData && this.currentTab !== 'all' && this.currentMetricsData.routes) {
                        const currentRouteData = this.currentMetricsData.routes.find(r => r.route === this.currentTab);
                         if (currentRouteData) {
                             metricData = currentRouteData.metrics.find(m =>
                                m.routeMetrics.some(item =>
                                    item.labels.length === labels.length &&
                                    item.labels.every(l1 => labels.some(l2 => l1.key === l2.key && l1.value === l2.value))
                                )
                             );
                         }
                    }
                }


                if (metricData) {
                     // Find the specific metric item within the metricData that matches the row
                    const specificMetricItem = (metricData.metrics || metricData.routeMetrics).find(item =>
                        item.labels.length === labels.length &&
                        item.labels.every(l1 => labels.some(l2 => l1.key === l2.key && l1.value === l2.value))
                    );

                     if(specificMetricItem) {
                         this.toggleRowDetails(row, specificMetricItem);
                     }

                } else {
                     console.warn('Metric data not found for clicked row', labels);
                     // Fallback to old behavior if data not found (less ideal)
                     this.toggleRowDetails(row, null);
                }

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

    setupAutoRefreshToggle() {
        const refreshSection = document.querySelector('.refresh-section');
        if (!refreshSection) return;

        const toggleButton = document.createElement('button');
        toggleButton.className = 'refresh-button auto-refresh-toggle';
        toggleButton.innerHTML = `
            <span class="icon material-symbols-rounded">schedule</span>
            Auto Refresh: Off
        `;
        toggleButton.addEventListener('click', () => this.toggleAutoRefresh(toggleButton));
        refreshSection.insertBefore(toggleButton, refreshSection.firstChild);
    }

    toggleAutoRefresh(button) {
        this.autoRefreshEnabled = !this.autoRefreshEnabled;
        
        if (this.autoRefreshEnabled) {
            this.startAutoRefresh();
            button.innerHTML = `
                <span class="icon material-symbols-rounded">schedule</span>
                Auto Refresh: On
            `;
            button.classList.add('active');
        } else {
            this.stopAutoRefresh();
            button.innerHTML = `
                <span class="icon material-symbols-rounded">schedule</span>
                Auto Refresh: Off
            `;
            button.classList.remove('active');
        }
    }

    startAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        this.autoRefreshInterval = setInterval(() => this.refreshMetrics(), this.REFRESH_INTERVAL);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    toggleRowDetails(row, metricItemData) {
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

            // Use metricItemData if available. With the new updateDashboard logic, metricItemData should always be available here
            // when called from the click listener after an update.
            const labels = metricItemData?.labels || Array.from(row.querySelectorAll('.label-pair')).map(pair => ({
                key: pair.querySelector('.label-key').textContent,
                value: pair.querySelector('.label-value').textContent
            }));

            const method = metricItemData?.labels?.find(l => l.key === 'method')?.value || labels.find(l => l.key === 'method')?.value || '';
            const route = metricItemData?.labels?.find(l => l.key === 'route')?.value || labels.find(l => l.key === 'route')?.value || '';
            const statusCode = metricItemData?.labels?.find(l => l.key === 'status_code')?.value || labels.find(l => l.key === 'status_code')?.value || '';
            const value = metricItemData?.value || parseFloat(row.querySelector('.metric-value').textContent.trim());
            const le = metricItemData?.labels?.find(l => l.key === 'le')?.value || labels.find(l => l.key === 'le')?.value;
            const requestDetails = metricItemData?.requestDetails; // Use requestDetails directly from metricItemData

            const details = document.createElement('tr');
            details.className = 'request-details';
            // Pass relevant data to generateDetailsContent
            details.innerHTML = this.generateDetailsContent(method, route, statusCode, value, le, labels, requestDetails);

            row.parentNode.insertBefore(details, row.nextSibling);

            requestAnimationFrame(() => {
                details.classList.add('visible');
            });
        } else {
            row.classList.remove('expanded');
            row.nextElementSibling?.classList.contains('request-details') && row.nextElementSibling.remove();
        }
    }

    generateDetailsContent(method, route, statusCode, value, le, labels, requestDetails) {
        const methodClass = `method-${method}`;
        const statusClass = this.getStatusClass(statusCode);
        const duration = parseFloat(value);
        const bucket = le ? `<= ${le}s` : 'Total';

        // Extract service name from route
        const serviceName = route.split('/')[1];

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
        const refreshButton = document.querySelector('.refresh-button:not(.auto-refresh-toggle)');
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
            this.currentMetricsData = data; // Store the fetched data
            this.calculateRouteRequestCounts(data);
            this.updateDashboard(data);
            this.lastRefreshTime = new Date();
            this.updateLastRefreshTime();
        } catch (error) {
            console.error('Error refreshing metrics:', error);
            this.showError('Failed to refresh metrics');
            // Stop auto-refresh on error
            if (this.autoRefreshEnabled) {
                this.toggleAutoRefresh(document.querySelector('.auto-refresh-toggle'));
            }
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
        // Store data for use by toggleRowDetails and other functions that need access to the latest data
        this.currentMetricsData = data;

        console.log('UpdateDashboard: Starting update with new data:', data);

        // Update the main content for all tabs by updating existing elements
        document.querySelectorAll('.tab-content').forEach(content => {
            const route = content.id.replace('content-', '');
            console.log('UpdateDashboard: Processing tab:', route);

            // Find the relevant data for this tab (either all metrics or route-specific)
            const relevantMetricsData = route === 'all' ? data.metrics : data.routes.find(r => r.route === route)?.metrics;

            if (!relevantMetricsData) {
                 console.warn(`UpdateDashboard: No relevant metrics data found for route tab: ${route}`);
                 // Optionally clear content or show a message if no data
                 content.querySelectorAll('.metric-group').forEach(group => {
                    const tableBody = group.querySelector('tbody');
                    if(tableBody) tableBody.innerHTML = '';
                    group.querySelector('.no-data')?.classList.remove('hidden');
                 });
                 return;
            }

            relevantMetricsData.forEach(metricData => {
                console.log('UpdateDashboard: Processing metric group:', metricData.name);

                const metricElement = content.querySelector(`[data-metric="${metricData.name}"]`);
                if (metricElement) {
                    const tableBody = metricElement.querySelector('tbody');
                    if (!tableBody) {
                        console.warn('UpdateDashboard: Table body not found for metric group:', metricData.name);
                        return;
                    }

                    const metricItems = metricData.metrics || metricData.routeMetrics || [];

                    if (metricItems.length === 0) {
                        // If no data for this metric, show 'No data' message
                        console.log('UpdateDashboard: No metric items for', metricData.name, '. Clearing rows.');
                         tableBody.innerHTML = ''; // Clear existing rows
                         metricElement.querySelector('.no-data')?.classList.remove('hidden');
                    } else {
                        console.log('UpdateDashboard: Found', metricItems.length, 'metric items for', metricData.name);
                         metricElement.querySelector('.no-data')?.classList.add('hidden');

                        // Get existing rows and map them by their unique key (labels serialized as string)
                        const existingRowsMap = new Map();
                        tableBody.querySelectorAll('.metric-row').forEach(row => {
                            const labels = Array.from(row.querySelectorAll('.label-pair')).map(pair => `${pair.querySelector('.label-key').textContent}=${pair.querySelector('.label-value').textContent}`).join(',');
                            existingRowsMap.set(labels, row);
                            console.log('UpdateDashboard: Found existing row with labels key:', labels, 'Expanded:', row.classList.contains('expanded'));
                        });

                        const newRowsHtmlArray = []; // Collect HTML for new rows to append later

                        // Iterate through new metric items and update or create rows
                        metricItems.forEach(item => {
                             // Create a stable key from item labels for mapping
                             const itemLabelsKey = item.labels.map(label => `${label.key}=${label.value}`).join(',');
                             const existingRow = existingRowsMap.get(itemLabelsKey);

                             if (existingRow) {
                                 console.log('UpdateDashboard: Found existing row for item:', itemLabelsKey);
                                 // Update existing row content
                                 const valueElement = existingRow.querySelector('.metric-value');
                                 const statusCode = item.labels.find(l => l.key === 'status_code')?.value;
                                 const statusClass = this.getStatusClass(statusCode);

                                 // Include metric value even if formattedValue is not present
                                 const displayValue = item.formattedValue !== undefined ? item.formattedValue : item.value.toFixed(4);

                                 if (valueElement.textContent !== displayValue) {
                                     console.log('UpdateDashboard: Updating value for', itemLabelsKey, ':', valueElement.textContent, '->', displayValue);
                                     valueElement.textContent = displayValue;
                                 }

                                 // Update status class on value element
                                  if (!valueElement.classList.contains(statusClass)) {
                                     // Simple update, could be more robust to remove old status classes
                                     valueElement.className = `metric-value ${statusClass}`;
                                     console.log('UpdateDashboard: Updating status class for', itemLabelsKey, ':', statusClass);
                                 }


                                 // If the row is currently expanded, update its details as well
                                 if (existingRow.classList.contains('expanded')) {
                                     console.log('UpdateDashboard: Row is expanded, attempting to update details for:', itemLabelsKey);
                                     const detailsRow = existingRow.nextElementSibling;
                                     // Ensure the next element is actually a details row before updating
                                     if (detailsRow?.classList.contains('request-details')) {
                                         console.log('UpdateDashboard: Found details row, regenerating content with item data:', item.requestDetails);
                                         // Regenerate and replace the details content using the latest data (item)
                                         detailsRow.innerHTML = this.generateDetailsContent(
                                             item.labels.find(l => l.key === 'method')?.value,
                                             item.labels.find(l => l.key === 'route')?.value,
                                             statusCode,
                                             item.value,
                                             item.labels.find(l => l.key === 'le')?.value,
                                             item.labels,
                                             item.requestDetails // Pass the updated request details from the item
                                         );
                                     } else {
                                         console.warn('UpdateDashboard: Expanded row did not have a details row as the next sibling for', itemLabelsKey, '. Removing expanded class.', existingRow);
                                         // This case should ideally not happen if expanded state is correct,
                                         // but if it does, remove the expanded class to clean up.
                                         existingRow.classList.remove('expanded');
                                     }
                                 } else {
                                      console.log('UpdateDashboard: Row is NOT expanded, skipping details update for:', itemLabelsKey);
                                 }

                                 // Remove from map to track rows that are no longer present
                                 existingRowsMap.delete(itemLabelsKey);

                             } else {
                                 console.log('UpdateDashboard: Creating new row for item:', itemLabelsKey);
                                 // Create new row if it doesn't exist
                                 // Generate HTML here and add to a temporary array
                                 newRowsHtmlArray.push(this.generateMetricRows([item])); // generateMetricRows expects an array of metrics
                             }
                         });

                         // Remove rows that are still in the map (meaning they were not in the new data)
                         existingRowsMap.forEach((rowToRemove, labelsKey) => {
                            console.log('UpdateDashboard: Removing old row:', labelsKey);
                            // Also remove the associated details row if it exists and is expanded
                            if (rowToRemove.classList.contains('expanded')) {
                                console.log('UpdateDashboard: Removing details row for old row:', labelsKey);
                                rowToRemove.nextElementSibling?.classList.contains('request-details') && rowToRemove.nextElementSibling.remove();
                            }
                             rowToRemove.remove(); // Remove the metric row element
                         });

                        // Add new rows to the table body at the end
                         if (newRowsHtmlArray.length > 0) {
                            console.log('UpdateDashboard: Appending', newRowsHtmlArray.length, 'new rows.');
                            tableBody.insertAdjacentHTML('beforeend', newRowsHtmlArray.join(''));
                         }

                         // Note: Event delegation on tableBody for 'click' should handle new rows automatically.
                    }
                }
            });
        });

        console.log('UpdateDashboard: Finished update cycle.');

        // The expanded state is preserved by updating existing elements in place.
        // Details for expanded rows are updated within the loop.
    }

    generateMetricRows(metrics) {
        return metrics.map(metric => {
            const statusCode = metric.labels.find(l => l.key === 'status_code')?.value;
            const statusClass = this.getStatusClass(statusCode);

            // Include metric value even if formattedValue is not present
            const displayValue = metric.formattedValue !== undefined ? metric.formattedValue : metric.value.toFixed(4);

            return `
                <tr class="metric-row">
                    <td>
                        ${this.generateLabelPairs(metric.labels)}
                    </td>
                    <td class="metric-value ${statusClass}">
                        ${displayValue}
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
