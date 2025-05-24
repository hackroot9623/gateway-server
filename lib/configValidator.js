// Configuration validation functions

const validateConfig = (config) => {
  if (!config) {
    throw new Error('Configuration object cannot be null or undefined.');
  }
  const requiredFields = ['port', 'corsOptions', 'routes'];

  requiredFields.forEach(field => {
    validateField(config, field);
  });

  if (!Array.isArray(config.routes) || config.routes.length === 0) {
    throw new Error('Routes configuration must be a non-empty array');
  }

  config.routes.forEach((route, index) => {
    validateRoute(route, index);
  });
};

const validateField = (config, field) => {
  if (config[field] === undefined || config[field] === null) {
    throw new Error(`Missing required configuration field: ${field}`);
  }
};

const validateRoute = (route, index) => {
  if (!route) {
    throw new Error(`Route at index ${index} is null or undefined.`);
  }
  if (!route.prefix || !route.target) {
    throw new Error(`Route at index ${index} must have both prefix and target`);
  }
};

module.exports = {
  validateConfig,
  validateField,
  validateRoute
};
