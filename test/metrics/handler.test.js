const MetricsHandler = require('../../lib/metrics/handler');
const path = require('path');

jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn()
    }
}));

describe('MetricsHandler', () => {
    let handler;
    const mockPrometheus = {
        register: {
            metrics: jest.fn(),
            contentType: 'text/plain'
        }
    };

    beforeEach(() => {
        handler = new MetricsHandler(mockPrometheus);
        jest.clearAllMocks();
    });

    describe('loadTemplate', () => {
        it('should load template from correct path', async () => {
            const mockTemplate = '<div>{{metrics}}</div>';
            require('fs').promises.readFile.mockResolvedValue(mockTemplate);

            const result = await handler.loadTemplate();

            expect(require('fs').promises.readFile).toHaveBeenCalledWith(
                path.join(__dirname, '../../public/metrics-dashboard/template.html'),
                'utf8'
            );
            expect(result).toBe(mockTemplate);
            expect(handler.templateCache).toBe(mockTemplate);
        });

        it('should cache template after first load', async () => {
            const mockTemplate = '<div>{{metrics}}</div>';
            handler.templateCache = mockTemplate;

            const result = await handler.loadTemplate();

            expect(require('fs').promises.readFile).not.toHaveBeenCalled();
            expect(result).toBe(mockTemplate);
        });
    });

    describe('processMetrics', () => {
        it('should parse metrics correctly', async () => {
            const metrics = `# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status_code="200",route="/test"} 100
http_requests_total{method="POST",status_code="404",route="/test"} 5
`;

            jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await handler.processMetrics(metrics);
            expect(result.metrics[0].metrics[0]).toEqual({
                name: 'http_requests_total',
                fullName: 'http_requests_total',
                description: 'Total number of HTTP requests',
                type: 'counter',
                labels: [
                    { key: 'method', value: 'GET', isMethod: true },
                    { key: 'status_code', value: '200', isMethod: false },
                    { key: 'route', value: '/test', isMethod: false }
                ],
                value: 100,
                statusClass: 'status-2xx',
                formattedValue: '100.0000'
            });
        });

        it('should handle request details parsing', async () => {
            const metrics = `# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",request_details="{\\"path\\":\\"/test\\",\\"query\\":{}}",route="/test"} 100
`;

            jest.spyOn(console, 'error').mockImplementation(() => {});
            const result = await handler.processMetrics(metrics);
            expect(result.metrics[0].metrics[0].requestDetails).toEqual({
                path: '/test',
                query: {}
            });
        });
    });

    describe('handleMetricsRequest', () => {
        it('should handle HTML request', async () => {
            const mockReq = {
                headers: { accept: 'text/html' }
            };
            const mockRes = {
                setHeader: jest.fn(),
                end: jest.fn()
            };

            mockPrometheus.register.metrics.mockResolvedValue('metrics_data');
            jest.spyOn(handler, 'loadTemplate').mockResolvedValue('<div>{{metrics}}</div>');
            jest.spyOn(handler, 'processMetrics').mockResolvedValue({ metrics: [], routes: [] });

            await handler.handleMetricsRequest(mockReq, mockRes);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
            expect(mockRes.end).toHaveBeenCalled();
        });

        it('should handle JSON request', async () => {
            const mockReq = {
                headers: { accept: 'application/json' }
            };
            const mockRes = {
                setHeader: jest.fn(),
                end: jest.fn()
            };

            mockPrometheus.register.metrics.mockResolvedValue('metrics_data');
            jest.spyOn(handler, 'processMetrics').mockResolvedValue({ metrics: [], routes: [] });

            await handler.handleMetricsRequest(mockReq, mockRes);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
            expect(mockRes.end).toHaveBeenCalled();
        });

        it('should handle plain text request', async () => {
            const mockReq = {
                headers: { accept: 'text/plain' }
            };
            const mockRes = {
                setHeader: jest.fn(),
                end: jest.fn()
            };

            const metricsData = 'raw_metrics_data';
            mockPrometheus.register.metrics.mockResolvedValue(metricsData);

            await handler.handleMetricsRequest(mockReq, mockRes);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
            expect(mockRes.end).toHaveBeenCalledWith(metricsData);
        });

        it('should handle error gracefully', async () => {
            const mockReq = {
                headers: { accept: 'text/html' }
            };
            const mockRes = {
                setHeader: jest.fn(),
                end: jest.fn(),
                statusCode: 200
            };

            mockPrometheus.register.metrics.mockRejectedValue(new Error('Test error'));

            await handler.handleMetricsRequest(mockReq, mockRes);

            expect(mockRes.statusCode).toBe(500);
            expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Internal Server Error' }));
        });
    });
});
