# f-gateway-server

![20250516_1013_Octopus Server Gateway_remix_01jvcq17d1fj2bw7dzhkmq8df3 (1)](https://github.com/user-attachments/assets/a73bb023-8661-4af5-a452-8d5606445d51)


A high-performance API Gateway for microservices architecture built on [fast-gateway](https://www.npmjs.com/package/fast-gateway).

## Features

- **High Performance**: Built on fast-gateway for efficient request routing
- **Security**: CORS protection and Helmet security headers
- **Rate Limiting**: Configurable rate limiting to prevent abuse
- **Circuit Breaker**: Fault tolerance with Opossum circuit breaker
- **Monitoring**: 
  - Prometheus metrics for observability
  - Health check endpoints for service monitoring
- **Logging**: Detailed request/response logging with color coding
- **Environment-based Configuration**: Different settings for development, testing, and production

## Architecture

The gateway server acts as a central entry point for all client requests, routing them to appropriate microservices based on URL prefixes. It provides:

- Request routing and load balancing
- Authentication and authorization (via ms-auth service)
- Request/response transformation
- Monitoring and logging
- Error handling and circuit breaking

## Installation

### Prerequisites
- Node.js >= 18.0.0
- Node Package Manager: yarn

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/navarrortiz/f-gateway-server.git
   cd f-gateway-server
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Configure environment variables in a `.env` file:
   ```plaintext
   NODE_ENV=development
   PORT=8080
   CORS_ORIGIN='*'
   AUTH_SERVICE_URL='http://127.0.0.1:8082'
   USER_SERVICE_URL='http://127.0.0.1:8083'
   NOTIFICATION_SERVICE_URL='http://127.0.0.1:8084'
   ```

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

### Health Checks
The gateway provides health check endpoints for each service and a global health check at `/health`.

## License

MIT

## Author
Antonio Navarro Ortiz <navarrortiz1@gmail.com>

## Forked by
- [hackroot9623](https://github.com/hackroot9623)
