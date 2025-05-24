const { validateConfig, validateField, validateRoute } = require('../lib/configValidator');

describe('Configuration Validation', () => {
  let validConfig;

  beforeEach(() => {
    // Deep copy of a valid configuration structure
    validConfig = {
      port: 8080,
      corsOptions: { origin: '*' },
      rateLimit: { windowMs: 15 * 60 * 1000, max: 100 },
      timeout: 30000,
      routes: [
        { prefix: '/service1', target: 'http://localhost:3001', healthCheck: '/health' },
        { prefix: '/service2', target: 'http://localhost:3002' }
      ],
      logging: { level: 'debug', format: 'pretty' },
      security: { enableHelmet: true, enableRateLimit: true, trustProxy: true }
    };
  });

  describe('validateConfig', () => {
    it('should not throw an error for a valid configuration', () => {
      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it('should throw an error if config is null or undefined', () => {
      expect(() => validateConfig(null)).toThrow('Configuration object cannot be null or undefined.');
      expect(() => validateConfig(undefined)).toThrow('Configuration object cannot be null or undefined.');
    });

    it('should throw an error if "port" is missing', () => {
      delete validConfig.port;
      expect(() => validateConfig(validConfig)).toThrow('Missing required configuration field: port');
    });

    it('should throw an error if "corsOptions" is missing', () => {
      delete validConfig.corsOptions;
      expect(() => validateConfig(validConfig)).toThrow('Missing required configuration field: corsOptions');
    });

    it('should throw an error if "routes" is missing', () => {
      delete validConfig.routes;
      expect(() => validateConfig(validConfig)).toThrow('Missing required configuration field: routes');
    });

    it('should throw an error if "routes" is not an array', () => {
      validConfig.routes = { not: 'an array' };
      expect(() => validateConfig(validConfig)).toThrow('Routes configuration must be a non-empty array');
    });

    it('should throw an error if "routes" is an empty array', () => {
      validConfig.routes = [];
      expect(() => validateConfig(validConfig)).toThrow('Routes configuration must be a non-empty array');
    });

    it('should throw an error if a route is missing "prefix"', () => {
      validConfig.routes.push({ target: 'http://localhost:3003' });
      expect(() => validateConfig(validConfig)).toThrow('Route at index 2 must have both prefix and target');
    });

    it('should throw an error if a route is missing "target"', () => {
      validConfig.routes.push({ prefix: '/service3' });
      expect(() => validateConfig(validConfig)).toThrow('Route at index 2 must have both prefix and target');
    });

    it('should throw an error if a route object is null', () => {
      validConfig.routes = [
        { prefix: '/service1', target: 'http://localhost:3001' },
        null
      ];
      expect(() => validateConfig(validConfig)).toThrow('Route at index 1 is null or undefined.');
    });
  });

  describe('validateField', () => {
    it('should not throw an error if field exists', () => {
      expect(() => validateField(validConfig, 'port')).not.toThrow();
    });

    it('should throw an error if field is missing', () => {
      expect(() => validateField(validConfig, 'nonExistentField')).toThrow('Missing required configuration field: nonExistentField');
    });
     it('should throw an error if field is null', () => {
      validConfig.nullableField = null;
      expect(() => validateField(validConfig, 'nullableField')).toThrow('Missing required configuration field: nullableField');
    });

    it('should throw an error if field is undefined', () => {
      validConfig.undefinedField = undefined;
      expect(() => validateField(validConfig, 'undefinedField')).toThrow('Missing required configuration field: undefinedField');
    });
  });

  describe('validateRoute', () => {
    it('should not throw an error for a valid route', () => {
      expect(() => validateRoute({ prefix: '/test', target: 'http://test.com' }, 0)).not.toThrow();
    });

    it('should throw an error if route is null or undefined', () => {
        expect(() => validateRoute(null, 0)).toThrow('Route at index 0 is null or undefined.');
        expect(() => validateRoute(undefined, 0)).toThrow('Route at index 0 is null or undefined.');
    });

    it('should throw an error if "prefix" is missing', () => {
      expect(() => validateRoute({ target: 'http://test.com' }, 0)).toThrow('Route at index 0 must have both prefix and target');
    });

    it('should throw an error if "target" is missing', () => {
      expect(() => validateRoute({ prefix: '/test' }, 0)).toThrow('Route at index 0 must have both prefix and target');
    });
  });
});
