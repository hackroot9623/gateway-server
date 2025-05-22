async function main() {
    try {
        const fs = require('fs');
        const path = require('path');
        const dotenv = require('dotenv');
        const yargs = require('yargs');
        const packageJson = require('../package.json');

        // Parse command line arguments
        const argv = yargs
            .option('config', {
                alias: 'c',
                describe: 'Path to configuration file',
                type: 'string',
                default: path.resolve(packageJson.config.default)
            })
            .option('env', {
                alias: 'e',
                describe: 'Environment to use',
                type: 'string',
                default: 'development'
            })
            .help()
            .argv;

        // Load environment variables from .env file if exists
        dotenv.config();

        // Load configuration
        const configPath = path.resolve(argv.config);
        if (!fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configPath}`);
        }

        const configFileContent = fs.readFileSync(configPath, 'utf8');
        let configObj;
        try {
            configObj = JSON.parse(configFileContent);
        } catch (e) {
            throw new Error(`Invalid JSON in configuration file: ${configPath}`);
        }
        const config = configObj[argv.env];
        if (!config) {
            console.log('DEBUG: Throwing error for missing environment configuration:', argv.env);
            throw new Error(`Environment configuration not found: ${argv.env}`);
        }

        console.log('Starting Gateway Server with configuration:');
        console.log(`Environment: ${argv.env}`);
        console.log(`Configuration file: ${configPath}`);
        console.log(`Port: ${config.port}`);
        console.log(`Routes: ${config.routes.length} services`);

//------------------------------------------------------------------------------
        const gateway = require('fast-gateway')
        const cors = require('cors')
        const helmet = require('helmet')
        const rateLimit = require('express-rate-limit')
        const CircuitBreaker = require('opossum')
        const prometheus = require('prom-client')
        const colors = require('colors')
        const MetricsHandler = require('../lib/metrics/handler')
        const express = require('express')

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
            unavailable: (text) => text.red,    // 503
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
                return req?.headers['x-forwarded-for'] ||
                    req?.connection.remoteAddress ||
                    req?.socket.remoteAddress ||
                    req?.ip;
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
            }else if (statusCode >= 503) {
                statusColor = statusColors.unavailable;
                statusEmoji = '❌ ';
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

        const createErrorResponse = (error, req, _res) => {
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

        function handleServiceError(res, error) {
            console.error('Service error:', error?.message || error);

            if (res && typeof res?.status === 'function') {
                metrics.requestTotal.inc({
                    method: 'SERVICE_UNAVAILABLE',
                    route: 'service_error', // Customize this to reflect the service
                    status_code: 503
                });

                res.status(503).json(createErrorResponse({
                    error: 'Service unavailable. Please try again later.'
                }));
            } else {
                console.warn(statusColors.unavailable('⚠️ This service is not responding or is unavailable'), statusColors.unavailable('503'));
            }
        }

        const server = gateway({
            middlewares: [
                cors(corsOptions),
                helmet(),
                limiter,
                // Serve static files for metrics dashboard
                (req, res, next) => {
                    if (req.url.startsWith('/metrics-dashboard/')) {
                        const filePath = path.join(__dirname, '..', 'public', req.url);
                        fs.readFile(filePath, (err, data) => {
                            if (err) {
                                next();
                                return;
                            }
                            const ext = path.extname(filePath);
                            const contentType = {
                                '.css': 'text/css',
                                '.js': 'application/javascript',
                                '.html': 'text/html'
                            }[ext] || 'text/plain';

                            res?.setHeader('Content-Type', contentType);
                            res?.end(data);
                        });
                        return;
                    }
                    next();
                },
                // Prometheus metrics middleware
                (req, res, next) => {
                    // Skip metrics for internal paths and browser-specific requests
                    const skipPaths = ['/metrics', '/metrics-dashboard', '/.well-known', '/favicon.ico'];
                    if (skipPaths.some(path => req.url.startsWith(path) || req.url === path)) {
                        return next();
                    }

                    // Only collect metrics for configured service routes
                    const matchingRoute = config.routes.find(route => req.url.startsWith(route.prefix));
                    if (!matchingRoute) {
                        return next();
                    }

                    const start = process.hrtime();
                    const routePrefix = matchingRoute.prefix;

                    res.on('finish', () => {
                        const duration = process.hrtime(start);
                        const durationSeconds = duration[0] + duration[1] / 1e9;

                        metrics.requestDuration.observe(
                            {
                                method: req.method,
                                route: routePrefix,
                                status_code: res.statusCode
                            },
                            durationSeconds
                        );

                        metrics.requestTotal.inc({
                            method: req.method,
                            route: routePrefix,
                            status_code: res.statusCode
                        });
                    });

                    next();
                },
                // Logging middleware
                (req, res, next) => {
                    if (req.url.startsWith('/metrics') || req.url.startsWith('/metrics-dashboard')) {
                        return next();
                    }

                    const matchingRoute = config.routes.find(route => req.url.startsWith(route.prefix));

                    if (matchingRoute) {
                        const logData = formatLogMessage(req, matchingRoute.prefix);
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
                    }

                    next();
                },
            ],
            routes: config.routes.map(route => ({
                ...route,
                prefixRewrite: route.prefix,
                middlewares: [
                    route.rateLimit && rateLimit({
                        ...route.rateLimit,
                        trustProxy: true,
                        standardHeaders: true,
                        legacyHeaders: false,
                        keyGenerator: (req) => {
                            return req?.headers['x-forwarded-for'] ||
                                req?.connection.remoteAddress ||
                                req?.socket.remoteAddress ||
                                req?.ip;
                        }
                    }),

                    // Circuit breaker middleware
                    async (req, res, next) => {
                        try {
                            await circuitBreakers[route.prefix].fire(req);
                            next();
                        } catch (error) {
                                handleServiceError(res, error);
                        }
                    }
                ].filter(Boolean)
            })),
            trustProxy: true
        });

        const metricsHandler = new MetricsHandler(prometheus);

        server.get('/health', async (req, res) => {
            try {
                const checks = await Promise.all(
                    config.routes.map(async route => {
                        try {
                            const response = await fetch(`${route.target}${route.healthCheck}`);
                            return {
                                [route?.prefix]: {
                                    status: response.ok ? 'up' : 'down',
                                    responseTime: response.headers.get('x-response-time')
                                }
                            };
                        } catch (error) {
                            handleServiceError(res, error);
                            return {
                                [route?.prefix]: {
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

                await res.json(health);
            } catch (error) {
                handleServiceError(res, error)
                await res.status(500).json(createErrorResponse(error, req, res));
            }
        });

        // Expose Prometheus metrics endpoint
        server.get('/metrics', (req, res) => metricsHandler.handleMetricsRequest(req, res));

        // Serve static files
        server.use('/metrics-dashboard', express.static(path.join(__dirname, '../public/metrics-dashboard')));

        server.start(port)
            .then(() => {
                console.log('\n' + 'STARTED'.success +
                    ` Gateway Server listening on http://127.0.0.1:${port} `.bold + '\n');

                console.log('Configured Gateways:'.bold.underline);
                routes.forEach(route => {
                    const serviceColor = serviceColors[route.prefix] || ((text) => text.white);
                    console.log(`  ➡️  ${serviceColor(route.prefix)} ${'⟶'.gray} ${route.target.cyan}`);
                });
                console.log('');
            })
            .catch(error => {
                console.error('ERROR'.error +
                    ` Error starting server: ${error} `.red);
            });
    } catch (error) {
        console.error('FATAL'.error +
            ` Initialization error: ${error.message} `.red);
        throw error; // Re-throw the error to be caught by the test
    }
}

if (require.main === module && process.env.NODE_ENV !== 'test') {
    main();
}

module.exports = main;
