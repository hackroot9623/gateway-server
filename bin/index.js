try {
    const config = require('../f-gateway.conf')
    const gateway = require('fast-gateway')
    const cors = require('cors')
    const helmet = require('helmet')
    const rateLimit = require('express-rate-limit')
    const CircuitBreaker = require('opossum')
    const prometheus = require('prom-client')
    const healthCheck = require('@godaddy/terminus')
    const colors = require('colors')

    // Configure colors theme
    colors.setTheme({
        error: ['white', 'bgRed'],
        success: ['black', 'bgGreen'],
        warn: ['black', 'bgYellow'],
        info: ['white', 'bgBlue']
    });

    const port = config.port;
    const routes = config.routes.map((route) => ({ prefixRewrite: route.prefix, ...route}));
    const corsOptions = config.corsOptions || {};

    // Method color mapping
    const methodColors = {
        GET: (text) => text.green,
        POST: (text) => text.blue,
        PUT: (text) => text.yellow,
        DELETE: (text) => text.red,
        PATCH: (text) => text.magenta,
        OPTIONS: (text) => text.cyan,
        HEAD: (text) => text.gray
    };

    // Status code color mapping
    const statusColors = {
        success: (text) => text.green,    // 2xx
        redirect: (text) => text.cyan,    // 3xx
        clientError: (text) => text.yellow, // 4xx
        serverError: (text) => text.red,  // 5xx
        unknown: (text) => text.gray      // anything else
    };

    // Service color mapping for better visualization
    const serviceColors = {};
    routes.forEach((route, index) => {
        const colorFunctions = [
            (text) => text.blue,
            (text) => text.magenta,
            (text) => text.cyan,
            (text) => text.green,
            (text) => text.yellow
        ];
        serviceColors[route.prefix] = colorFunctions[index % colorFunctions.length];
    });

    // Initialize Prometheus metrics
    const metrics = {
        requestDuration: new prometheus.Histogram({
            name: 'http_request_duration_seconds',
            help: 'Duration of HTTP requests in seconds',
            labelNames: ['method', 'route', 'status_code'],
            buckets: [0.1, 0.5, 1, 2, 5]
        }),
        requestTotal: new prometheus.Counter({
            name: 'http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'route', 'status_code']
        })
    };

    // Circuit breaker configuration
    const circuitBreakerOptions = {
        timeout: 3000, // Time in milliseconds to wait for a response
        errorThresholdPercentage: 50, // Error percentage at which to open circuit
        resetTimeout: 30000 // Time in milliseconds to wait before testing circuit
    };

    // Create circuit breakers for each service
    const circuitBreakers = {};
    config.routes.forEach(route => {
        circuitBreakers[route.prefix] = new CircuitBreaker(
            async (req) => {
                // Your service call logic here
                return await fetch(route.target + req.url);
            },
            circuitBreakerOptions
        );
    });

    // Configure rate limiter
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        standardHeaders: true,
        legacyHeaders: false,
        trustProxy: true,
        handler: (req, res) => {
            res.status(429).json({
                error: {
                    message: 'Too many requests, please try again later.',
                    code: 'RATE_LIMIT_EXCEEDED'
                }
            });
        },
        keyGenerator: (req) => {
            return req.headers['x-forwarded-for'] ||
                req.connection.remoteAddress ||
                req.socket.remoteAddress ||
                req.ip;
        }
    });

    // Helper function to format log messages
    const formatLogMessage = (req, serviceName) => {
        const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(2, 10);

        req.requestId = requestId;

        return {
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.url,
            service: serviceName,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
            requestId: requestId,
            query: Object.keys(req.query || {}).length > 0 ? req.query : undefined,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length']
        };
    };

    const prettyPrintRequest = (logData) => {
        const methodColor = methodColors[logData.method] || ((text) => text.white);
        const serviceColor = serviceColors[logData.service] || ((text) => text.white);

        console.log(
            '➡️  REQUEST'.blue.bold +
            ` [${logData.timestamp}]`.gray +
            ` #${logData.requestId} `.white.bold +
            methodColor(logData.method + ' ').bold +
            serviceColor(logData.service) +
            logData.url.replace(logData.service, '').white +
            ` from ${logData.ip}`.gray
        );

        console.log(
            `   User-Agent: ${logData.userAgent}`.gray +
            (logData.contentType ? `\n   Content-Type: ${logData.contentType}`.gray : '') +
            (logData.contentLength ? `\n   Content-Length: ${logData.contentLength} bytes`.gray : '')
        );

        if (logData.query && Object.keys(logData.query).length > 0) {
            console.log(`   Query: ${JSON.stringify(logData.query)}`.gray);
        }
    };

    const prettyPrintResponse = (logData) => {
        const statusCode = logData.statusCode;
        let statusColor;
        let statusEmoji;

        if (statusCode >= 500) {
            statusColor = statusColors.serverError;
            statusEmoji = '❌ ';
        } else if (statusCode >= 400) {
            statusColor = statusColors.clientError;
            statusEmoji = '⚠️  ';
        } else if (statusCode >= 300) {
            statusColor = statusColors.redirect;
            statusEmoji = '↪️  ';
        } else {
            statusColor = statusColors.success;
            statusEmoji = '✅ ';
        }

        const methodColor = methodColors[logData.method] || ((text) => text.white);
        const serviceColor = serviceColors[logData.service] || ((text) => text.white);

        const message =
            '⬅️  RESPONSE'.magenta.bold +
            ` [${logData.timestamp}]`.gray +
            ` #${logData.requestId} `.white.bold +
            methodColor(logData.method + ' ').bold +
            serviceColor(logData.service) +
            logData.url.replace(logData.service, '').white +
            ' ' + statusColor(`${statusCode} ${statusEmoji}`).bold +
            ` in ${logData.responseTime}`.gray;

        console.log(message);
    };

    const createErrorResponse = (error, req, res) => {
        const errorResponse = {
            error: {
                message: error.message || 'Internal Server Error',
                code: error.code || 'INTERNAL_ERROR',
                requestId: req.requestId
            }
        };

        if (config.logging.level === 'debug') {
            errorResponse.error.stack = error.stack;
        }

        return errorResponse;
    };

    const server = gateway({
        middlewares: [
            cors(corsOptions),
            helmet(),
            limiter,

            // Prometheus metrics middleware
            (req, res, next) => {
                const start = process.hrtime();

                res.on('finish', () => {
                    const duration = process.hrtime(start);
                    const durationSeconds = duration[0] + duration[1] / 1e9;

                    metrics.requestDuration.observe(
                        {
                            method: req.method,
                            route: req.route?.path || 'unknown',
                            status_code: res.statusCode
                        },
                        durationSeconds
                    );

                    metrics.requestTotal.inc({
                        method: req.method,
                        route: req.route?.path || 'unknown',
                        status_code: res.statusCode
                    });
                });

                next();
            },

            // Logging middleware
            (req, res, next) => {
                const serviceName = config.routes.find(route => req.url.startsWith(route.prefix))?.prefix || 'unknown';
                const logData = formatLogMessage(req, serviceName);

                prettyPrintRequest(logData);

                const originalEnd = res.end;
                const startTime = Date.now();

                res.end = function(chunk, encoding) {
                    const responseTime = Date.now() - startTime;
                    const responseLogData = {
                        ...logData,
                        statusCode: res.statusCode,
                        responseTime: `${responseTime}ms`,
                        responseSize: res.getHeader('content-length') || (chunk ? chunk.length : 0),
                        responseType: res.getHeader('content-type')
                    };

                    prettyPrintResponse(responseLogData);
                    return originalEnd.apply(this, arguments);
                };

                next();
            },
        ],
        routes: config.routes.map(route => ({
            ...route,
            prefixRewrite: route.prefix,
            middlewares: [
                // Route specific rate limiting if configured
                route.rateLimit && rateLimit({
                    ...route.rateLimit,
                    trustProxy: true,
                    standardHeaders: true,
                    legacyHeaders: false,
                    keyGenerator: (req) => {
                        return req.headers['x-forwarded-for'] ||
                            req.connection.remoteAddress ||
                            req.socket.remoteAddress ||
                            req.ip;
                    }
                }),

                // Circuit breaker middleware
                async (req, res, next) => {
                    try {
                        await circuitBreakers[route.prefix].fire(req);
                        next();
                    } catch (error) {
                        if (circuitBreakers[route.prefix].opened) {
                            res.status(503).json(createErrorResponse({
                                message: 'Service temporarily unavailable',
                                code: 'CIRCUIT_OPEN'
                            }, req, res));
                        } else {
                            res.status(500).json(createErrorResponse(error, req, res));
                        }
                    }
                }
            ].filter(Boolean)
        })),
        // Enable proxy trust
        trustProxy: true
    });

    // Add health check endpoint directly
    server.get('/health', async (req, res) => {
        try {
            const checks = await Promise.all(
                config.routes.map(async route => {
                    try {
                        const response = await fetch(`${route.target}${route.healthCheck}`);
                        return {
                            [route.prefix]: {
                                status: response.ok ? 'up' : 'down',
                                responseTime: response.headers.get('x-response-time')
                            }
                        };
                    } catch (error) {
                        return {
                            [route.prefix]: {
                                status: 'down',
                                error: error.message
                            }
                        };
                    }
                })
            );

            const health = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                services: Object.assign({}, ...checks)
            };

            res.json(health);
        } catch (error) {
            res.status(500).json(createErrorResponse(error, req, res));
        }
    });

    // Expose Prometheus metrics endpoint
    server.get('/metrics', async (req, res) => {
        try {
            res.set('Content-Type', prometheus.register.contentType);
            res.end(await prometheus.register.metrics());
        } catch (error) {
            res.status(500).json(createErrorResponse(error, req, res));
        }
    });

    server.start(port)
        .then((address) => {
            console.log('\n' + 'STARTED'.success +
                ` Gateway Server listening on http://127.0.0.1:${port} `.bold + '\n');

            console.log('Configured Gateways:'.bold.underline);
            routes.forEach(route => {
                const serviceColor = serviceColors[route.prefix] || ((text) => text.white);
                console.log(`  ➡️  ${serviceColor(route.prefix)} ${'⟶'.gray} ${route.target.cyan}`);
            });
            console.log('');
        })
        .catch(error => console.error('ERROR'.error +
            ` Error starting server: ${error} `.red));
} catch (error) {
    console.error('FATAL'.error +
        ` Initialization error: ${error} `.red)
}
