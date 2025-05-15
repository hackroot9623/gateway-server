class MetricsDashboard {
    constructor() {
        this.currentTab = 'all';
        this.loading = false;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.setupTabListeners();
            this.setupRefreshButton();
            this.refreshMetrics();
        });
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
            refreshButton.addEventListener('click', () => this.refreshMetrics());
        }
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
        
        try {
            const response = await fetch('/metrics', {
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch metrics');
            }

            const metrics = await response.json();
            this.updateDashboard(metrics);
        } catch (error) {
            console.error('Error refreshing metrics:', error);
            this.showError('Failed to refresh metrics');
        } finally {
            this.hideLoading();
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
        // TODO: Implement error notification
        console.error(message);
    }

    updateDashboard(metrics) {
        // Update metrics for each tab
        Object.entries(metrics).forEach(([metricName, metricData]) => {
            const metricElement = document.querySelector(`[data-metric="${metricName}"]`);
            if (metricElement) {
                this.updateMetricGroup(metricElement, metricData);
            }
        });
    }

    updateMetricGroup(element, data) {
        const tableBody = element.querySelector('tbody');
        if (!tableBody) return;

        tableBody.innerHTML = this.generateMetricRows(data.metrics);
    }

    generateMetricRows(metrics) {
        return metrics.map(metric => {
            const statusCode = metric.labels.find(l => l.key === 'status_code')?.value;
            const statusClass = this.getStatusClass(statusCode);
            
            return `
                <tr>
                    <td>
                        ${this.generateLabelPairs(metric.labels)}
                    </td>
                    <td class="metric-value ${statusClass}">${metric.value.toFixed(4)}</td>
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

// Initialize dashboard
const dashboard = new MetricsDashboard(); 