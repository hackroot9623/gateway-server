<div align="center">
  <img src="https://github.com/user-attachments/assets/a73bb023-8661-4af5-a452-8d5606445d51" alt="20250516_1013_Octopus Server Gateway_remix_01jvcq17d1fj2bw7dzhkmq8df3 (1)" width="300"/>
</div>


A high-performance API Gateway for microservices architecture built on [fast-gateway](https://www.npmjs.com/package/fast-gateway).

> ## ⚠️ **DISCLAIMER**
> **This tool is intended for development and local testing purposes only.**
>
> 🚫 **Do NOT use this in production environments.**
>
> Use this gateway solely to test integrations with APIs and/or the frontend during development.

## Features

- **High Performance**: Built on fast-gateway for efficient request routing
- **Security**: CORS protection and Helmet security headers
- **Rate Limiting**: Configurable rate limiting to prevent abuse
- **Circuit Breaker**: Fault tolerance with Opossum circuit breaker
- **Monitoring**: 
  - Prometheus metrics for observability
  - Health check endpoints for service monitoring
- **Logging**: Detailed request/response logging with color coding
- **Environment-based Configuration**: Different settings for development and testing

## Architecture

The gateway server acts as a central entry point for all client requests, routing them to appropriate microservices based on URL prefixes. It provides:

- Request routing and load balancing
- Authentication and authorization (via ms-auth service)
- Request/response transformation
- Monitoring and logging
- Error handling and circuit breaking

## Installation

### As a Global Package

1. Install the package globally:
   ```bash
   npm install -g gateway-server
   ```

2. Create a configuration file (default: `gateway.json`):
   ```bash
   cp /usr/local/lib/node_modules/gateway-server/config/default.json gateway.json
   ```

3. Edit the configuration file to match your services:
   ```json
   {
     "development": {
       "port": 8080,
       "routes": [
         {
           "prefix": "/ms-auth",
           "target": "http://127.0.0.1:8082",
           "timeout": 10000
         }
       ]
     }
   }
   ```

### Running the Gateway

Start the gateway with your configuration:
```bash
# Using default configuration
gateway-server

# Using custom configuration file
gateway-server --config path/to/your/config.json

# Using specific environment
gateway-server --env production
```

### Environment Variables

The gateway supports the following environment variables:
- `NODE_ENV`: Environment to use (development, production, etc.)
- `PORT`: Port number to listen on
- Service URLs can be overridden through environment variables
   - `AUTH_SERVICE_URL`
   - `PROJECT_SERVICE_URL`
   - `RRHH_SERVICE_URL`
   - `DWH_SERVICE_URL`
   - `CRM_SERVICE_URL`

## Usage

### Starting the Server

Development mode with auto-restart:
```bash
yarn run dev
```

Production mode:
```bash
yarn start
```

### Configuration

The server configuration is in `f-gateway.conf.js`. You can customize:

- **Port**: The port the gateway listens on
- **CORS Options**: Control cross-origin requests
- **Rate Limiting**: Configure request limits
- **Timeouts**: Global and per-service timeouts
- **Routes**: Define service routes, including:
  - Prefix: URL path prefix for routing
  - Target: Destination service URL
  - Health Check: Path for service health checks

Example route configuration:
```javascript
{
  prefix: '/ms-auth',
  target: process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:8082',
  timeout: 10000,
  healthCheck: '/health'
}
```

## Advanced Features

### Circuit Breaker
The gateway implements the circuit breaker pattern to prevent cascading failures. If a service fails repeatedly, the circuit opens and fails fast until the service recovers.

### Prometheus Metrics
Metrics are exposed at `/metrics` for monitoring with Prometheus.

![image](https://github.com/user-attachments/assets/cc2fb5c2-d13c-4d24-83a2-9739807f817e)


### Health Checks
The gateway provides health check endpoints for each service and a global health check at `/health`.

## License

MIT

## Author
Antonio Navarro Ortiz <navarrortiz1@gmail.com>

## Forked by
- [hackroot9623](https://github.com/hackroot9623)
