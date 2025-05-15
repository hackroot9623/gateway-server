require('dotenv').config();

const environments = {
  development: {
    port: process.env.PORT || 8080,
    corsOptions: {
      origin: process.env.CORS_ORIGIN || '*',
      exposedHeaders: ['Authorization', 'hub_url', 'hub_token', 'hub_topics'],
      credentials: true
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    },
    timeout: 30000, // 30 seconds
    routes: [
      {
        prefix: '/ms-auth',
        target: process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:8082',
        timeout: 10000, // service specific timeout
        healthCheck: '/health',
        rateLimit: {
          windowMs: 15 * 60 * 1000,
          max: 50
        }
      },
      {
        prefix: '/ms-project',
        target: process.env.PROJECT_SERVICE_URL || 'http://127.0.0.1:8083',
        timeout: 20000,
        healthCheck: '/health'
      },
      {
        prefix: '/ms-rrhh',
        target: process.env.RRHH_SERVICE_URL || 'http://127.0.0.1:8085',
        timeout: 20000,
        healthCheck: '/health'
      },
      {
        prefix: '/ms-query-dwh',
        target: process.env.DWH_SERVICE_URL || 'http://127.0.0.1:8087',
        timeout: 40000, // longer timeout for data warehouse queries
        healthCheck: '/health'
      },
      {
        prefix: '/ms-crm',
        target: process.env.CRM_SERVICE_URL || 'http://127.0.0.1:8089',
        timeout: 20000,
        healthCheck: '/health'
      }
    ],
    logging: {
      level: 'debug',
      format: 'pretty' // or 'json'
    },
    security: {
      enableHelmet: true,
      enableRateLimit: true,
      trustProxy: true
    }
  }
};

// Validation function for configuration
const validateConfig = (config) => {
  const requiredFields = ['port', 'corsOptions', 'routes'];
  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`Missing required configuration field: ${field}`);
    }
  }

  if (!Array.isArray(config.routes) || config.routes.length === 0) {
    throw new Error('Routes configuration must be a non-empty array');
  }

  config.routes.forEach((route, index) => {
    if (!route.prefix || !route.target) {
      throw new Error(`Route at index ${index} must have both prefix and target`);
    }
  });
};

const environment = process.env.NODE_ENV || 'development';
const config = environments[environment];

validateConfig(config);

module.exports = config;
