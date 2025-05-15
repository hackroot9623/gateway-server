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
                const [, name, help] = line.match(/# HELP (.+?) (.+)/);
                metricsData[name] = { name, help, type: '', metrics: [] };
                currentMetric = name;
            } else if (line.startsWith('# TYPE ')) {
                const [, name, type] = line.match(/# TYPE (.+?) (.+)/);
                if (metricsData[name]) {
                    metricsData[name].type = type;
                }
            } else if (line && !line.startsWith('#') && currentMetric) {
                const metricMatch = line.match(/^([^{]+)({.+})\s+(.+)$/);
                if (metricMatch) {
                    const [, name, labels, value] = metricMatch;
                    const labelPairs = this.parseLabels(labels);
                    metricsData[currentMetric].metrics.push({
                        labels: labelPairs,
                        value: parseFloat(value)
                    });
                }
            }
        });

        return this.formatMetricsData(metricsData);
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

    formatMetricsData(metricsData) {
        const routes = new Set();
        
        // Extract routes and format metrics
        Object.values(metricsData).forEach(metric => {
            metric.hasMetrics = metric.metrics.length > 0;
            metric.metrics.forEach(m => {
                const route = m.labels.find(l => l.key === 'route')?.value;
                if (route) routes.add(route);
                
                const statusCode = m.labels.find(l => l.key === 'status_code')?.value;
                const requestDetails = m.labels.find(l => l.key === 'request_details')?.details;
                
                m.statusClass = this.getStatusClass(statusCode);
                m.formattedValue = m.value.toFixed(4);
                m.requestDetails = requestDetails;
            });
        });

        // Format route-specific data
        const routesList = Array.from(routes).map(route => {
            const routeMetrics = Object.values(metricsData).map(metric => ({
                ...metric,
                routeMetrics: metric.metrics.filter(m => 
                    m.labels.find(l => l.key === 'route')?.value === route
                ),
                hasRouteMetrics: metric.metrics.some(m => 
                    m.labels.find(l => l.key === 'route')?.value === route
                )
            }));

            return {
                route,
                metrics: routeMetrics
            };
        });

        return {
            metrics: Object.values(metricsData),
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