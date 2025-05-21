const Mustache = require('mustache');
const fs = require('fs').promises;
const path = require('path');

class MetricsHandler {
    constructor(prometheus) {
        this.prometheus = prometheus;
        this.templateCache = null;
    }

    async loadTemplate() {
        if (!this.templateCache) {
            const templatePath = path.join(__dirname, '../../public/metrics-dashboard/template.html');
            this.templateCache = await fs.readFile(templatePath, 'utf8');
        }
        return this.templateCache;
    }

    async processMetrics(metrics) {
        const metricsLines = metrics.split('\n');
        const metricsData = {};
        let currentMetric = null;

        metricsLines.forEach(line => {
            if (line.startsWith('# HELP ')) {
                this.handleHelpLine(line, metricsData);
                currentMetric = line.match(/# HELP (.+?) (.+)/)[1];
            } else if (line.startsWith('# TYPE ')) {
                this.handleTypeLine(line, metricsData);
            } else if (line && currentMetric) {
                if (!line.startsWith('#')) {
                    this.handleMetricLine(line, currentMetric, metricsData);
                }
            }
        });

        return this.formatMetricsData(metricsData);
    }

    handleHelpLine(line, metricsData) {
        const [, name, help] = line.match(/# HELP (.+?) (.+)/);
        metricsData[name] = { name, help, type: '', metrics: [] };
    }

    handleTypeLine(line, metricsData) {
        const [, name, type] = line.match(/# TYPE (.+?) (.+)/);
        if (metricsData[name]) {
            metricsData[name].type = type;
        }
    }

    handleMetricLine(line, currentMetric, metricsData) {
        const metricMatch = line.match(/^([^{]+)({.+})\s+(.+)$/);
        if (metricMatch) {
            const [, rawName, labels, value] = metricMatch;
            const labelPairs = this.parseLabels(labels);

            const baseName = rawName.trim();

            metricsData[currentMetric].metrics.push({
                name: baseName,
                fullName: currentMetric,
                description: metricsData[currentMetric].help,
                type: metricsData[currentMetric].type,
                labels: labelPairs,
                value: parseFloat(value)
            });
        }
    }

    parseLabels(labelsString) {
        return labelsString
            .slice(1, -1)
            .split(',')
            .map(pair => {
                const [key, value] = pair.split('=');
                const trimmedKey = key.trim();
                const trimmedValue = value.trim().replace(/"/g, '');

                // Parse request details if present
                if (trimmedKey === 'request_details') {
                    try {
                        return {
                            key: trimmedKey,
                            value: trimmedValue,
                            details: JSON.parse(trimmedValue),
                            isMethod: false
                        };
                    } catch (e) {
                        console.error('Error parsing request details:', e);
                    }
                }

                return {
                    key: trimmedKey,
                    value: trimmedValue,
                    isMethod: trimmedKey === 'method'
                };
            });
    }

    getStatusClass(statusCode) {
        if (!statusCode) return '';
        if (statusCode.startsWith('2')) return 'status-2xx';
        if (statusCode.startsWith('3')) return 'status-3xx';
        if (statusCode.startsWith('4')) return 'status-4xx';
        if (statusCode.startsWith('5')) return 'status-5xx';
        return '';
    }

    formatMetricItem(metric) {
        const statusCode = metric.labels.find(l => l.key === 'status_code')?.value;
        const requestDetails = metric.labels.find(l => l.key === 'request_details')?.details;

        return {
            ...metric,
            statusClass: this.getStatusClass(statusCode),
            formattedValue: metric.value.toFixed(4),
            requestDetails
        };
    }

    getRouteMetricsForMetric(metric, route) {
        return {
            ...metric,
            routeMetrics: metric.metrics.filter(m =>
                m.labels.find(l => l.key === 'route')?.value === route
            ),
            hasRouteMetrics: metric.metrics.some(m =>
                m.labels.find(l => l.key === 'route')?.value === route
            )
        };
    }

    formatMetricsData(metricsData) {
        const routes = new Set();
        const formattedMetrics = Object.values(metricsData).map(metric => {
            const formattedMetricItems = metric.metrics.map(m => {
                const route = m.labels.find(l => l.key === 'route')?.value;
                if (route) routes.add(route);
                return this.formatMetricItem(m);
            });

            return {
                ...metric,
                metrics: formattedMetricItems,
                hasMetrics: formattedMetricItems.length > 0
            };
        });

        const routesList = Array.from(routes).map(route => ({
            route,
            metrics: formattedMetrics.map(metric => this.getRouteMetricsForMetric(metric, route))
        }));

        return {
            metrics: formattedMetrics,
            routes: routesList
        };
    }

    async handleMetricsRequest(req, res) {
        try {
            const acceptHeader = req.headers.accept || '';
            const metrics = await this.prometheus.register.metrics();

            if (acceptHeader.includes('text/html')) {
                const template = await this.loadTemplate();
                const data = await this.processMetrics(metrics);
                const html = Mustache.render(template, data);

                res.setHeader('Content-Type', 'text/html');
                res.end(html);
            } else if (acceptHeader.includes('application/json')) {
                const data = await this.processMetrics(metrics);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
            } else {
                res.setHeader('Content-Type', this.prometheus.register.contentType);
                res.end(metrics);
            }
        } catch (error) {
            console.error('Error handling metrics request:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
    }
}

module.exports = MetricsHandler;
