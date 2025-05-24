#!/usr/bin/env node

const colors = require('colors'); // Import colors at the VERY top level
const { validateConfig } = require('../lib/configValidator');

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
                default: path.resolve(process.cwd(), 'gateway.config.json')
            })
            .option('env', {
                alias: 'e',
                describe: 'Environment to use',
                type: 'string',
                default: 'development'
            })
            .command('init', 'Create a default gateway.config.json file in the current directory', () => {
                // Try requiring colors specifically for this handler's scope as a workaround
                const localColors = require('colors');
                const currentFs = require('fs'); // also ensure fs is fresh if there are scope issues
                const currentPath = require('path'); // also ensure path is fresh

                const targetFilename = 'gateway.config.json';
                const targetPath = currentPath.resolve(process.cwd(), targetFilename);

                if (currentFs.existsSync(targetPath)) {
                    console.error(localColors.red(`Error: ${targetFilename} already exists in the current directory.`));
                    process.exit(1);
                }

                const sourcePath = currentPath.join(__dirname, '../config/default.json');
                try {
                    const defaultConfigContent = currentFs.readFileSync(sourcePath, 'utf8');
                    currentFs.writeFileSync(targetPath, defaultConfigContent);
                    // Use a standard color like green directly, as .success was theme-dependent
                    console.log(localColors.green(`Successfully created ${targetFilename}. Please customize it to your needs.`));
                    process.exit(0);
                } catch (error) {
                    console.error(localColors.red(`Error creating ${targetFilename}: ${error.message}`));
                    process.exit(1);
                }
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

        // Validate configuration
        validateConfig(config);

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
        const colors = require('colors'); // Import colors
        const MetricsHandler = require('../lib/metrics/handler')
        const express = require('express')

        // Define custom color themes if still needed (though direct usage like colors.red() is preferred)
        // colors.setTheme({
        //     error: ['white', 'bgRed'], // Example: this would be colors.error('text')
        //     success: ['black', 'bgGreen'], // Example: this would be colors.success('text')
        //     warn: ['black', 'bgYellow'],
        //     info: ['white', 'bgBlue']
        // });

        const port = process.env.PORT || config.port; // Ensure process.env.PORT takes precedence
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
            const methodColor = methodColors[logData.method] || colors.white;
            const serviceColor = serviceColors[logData.service] || colors.white;

            console.log(
                colors.bold(colors.blue('➡️  REQUEST')) +
                colors.gray(` [${logData.timestamp}]`) +
                colors.bold(colors.white(` #${logData.requestId} `)) +
                colors.bold(methodColor(logData.method + ' ')) +
                serviceColor(logData.service) +
                colors.white(logData.url.replace(logData.service, '')) +
                colors.gray(` from ${logData.ip}`)
            );

            console.log(
                colors.gray(`   User-Agent: ${logData.userAgent}`) +
                (logData.contentType ? colors.gray(`\n   Content-Type: ${logData.contentType}`) : '') +
                (logData.contentLength ? colors.gray(`\n   Content-Length: ${logData.contentLength} bytes`) : '')
            );

            if (logData.query && Object.keys(logData.query).length > 0) {
                console.log(colors.gray(`   Query: ${JSON.stringify(logData.query)}`));
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

            const methodColor = methodColors[logData.method] || colors.white;
            const serviceColor = serviceColors[logData.service] || colors.white;

            const message =
                colors.bold(colors.magenta('⬅️  RESPONSE')) +
                colors.gray(` [${logData.timestamp}]`) +
                colors.bold(colors.white(` #${logData.requestId} `)) +
                colors.bold(methodColor(logData.method + ' ')) +
                serviceColor(logData.service) +
                colors.white(logData.url.replace(logData.service, '')) +
                ' ' + colors.bold(statusColor(`${statusCode} ${statusEmoji}`)) +
                colors.gray(` in ${logData.responseTime}`);

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
                console.warn(statusColors.unavailable('⚠️ This service is not responding or is unavailable'), statusColors.unavailable('503')); // This still uses prototype style due to statusColors definition
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
                // Using colors.themed approach if themes were kept, or direct colors.colorName()
                console.log('\n' + colors.green.bold('STARTED') + // Assuming 'success' theme was green and bold
                    colors.bold(` Gateway Server listening on http://127.0.0.1:${port} `) + '\n');

                console.log(colors.bold(colors.underline('Configured Gateways:')));
                routes.forEach(route => {
                    const serviceColorFunc = serviceColors[route.prefix] || colors.white;
                    // These still use prototype style due to serviceColors and methodColors definition.
                    // For full robustness, these would also need to be colors.colorName(string)
                    console.log(`  ➡️  ${serviceColorFunc(route.prefix)} ${colors.gray('⟶')} ${colors.cyan(route.target)}`);
                });
                console.log('');
            })
            .catch(error => {
                // Assuming 'error' theme was white text on red bg
                console.error(colors.bgRed(colors.white('ERROR')) + colors.red(` Error starting server: ${error} `));
            });
    } catch (error) {
        // Fallback error logging if colors itself is an issue
        console.error('FATAL Initialization Error (fallback):', error.message, error.stack);
        // console.error(colors.bgRed(colors.white('FATAL')) + colors.red(` Initialization error: ${error.message} `));
        throw error; // Re-throw the error to be caught by the test
    }
}

// Execute main function and handle errors
main().catch(error => {
    // Fallback error logging if colors itself is an issue
    console.error('Fatal Error (fallback):', error.message, error.stack);
    // console.error(colors.bgRed(colors.white('Fatal error:')), colors.red(error.message));
    process.exit(1);
});

module.exports = main;
