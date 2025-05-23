<div align="center">
  <img src="https://github.com/user-attachments/assets/a73bb023-8661-4af5-a452-8d5606445d51" alt="Octopus Server Gateway" width="300"/>
</div>

# Octopus API Gateway Server

A high-performance, configurable API Gateway for microservices architecture, built on [fast-gateway](https://www.npmjs.com/package/fast-gateway).

> ## ⚠️ **DISCLAIMER**
> **This tool is primarily intended for development and local testing purposes.**
>
> While it includes features like rate limiting and security headers, for production environments, consider solutions with more comprehensive management, security, and scalability features.

## Features

- **High Performance**: Efficient request routing powered by `fast-gateway`.
- **Dynamic Configuration**: Primarily configured via an external JSON file (`gateway.config.json`).
- **Security**:
    - CORS protection.
    - Helmet security headers.
    - Configurable global and per-route rate limiting.
- **Resilience**:
    - Circuit Breaker (Opossum) for fault tolerance against downstream service failures.
    - Configurable timeouts (global and per-route).
- **Observability**:
    - Prometheus metrics exposed at `/metrics`.
    - Interactive metrics dashboard at `/metrics-dashboard`.
    - Health check endpoints for individual services and a global health check.
- **Developer-Friendly**:
    - Detailed request/response logging with color-coding.
    - Environment-based configuration (e.g., `development`, `production` within the JSON config).
    - Simple CLI for initialization and running.

## Installation & Usage

There are two main ways to use the Octopus API Gateway Server: as a global CLI tool or by running it locally from a cloned repository (e.g., for development on the gateway itself).

### 1. Using as a Global Tool (Recommended for Most Users)

This method is suitable for using the gateway to manage your microservices in a development or testing environment.

**A. Install the Gateway Globally:**

   Install the package using npm:
   ```bash
   npm install -g octopus-gateway-server
   ```

**B. Initialize Configuration:**

   Navigate to the directory where you want to manage your gateway's configuration and run:
   ```bash
   gateway-server init
   ```
   This command creates a `gateway.config.json` file in your current directory. This file is a copy of the default configuration and is where you'll define your services, ports, and other settings.

**C. Customize `gateway.config.json`:**

   Open the newly created `gateway.config.json` and modify it to suit your microservices setup. See the "JSON Configuration File (`gateway.config.json`)" section below for detailed information on all available options.

   Example snippet:
   ```json
   {
     "development": {
       "port": 8080,
       "routes": [
         {
           "prefix": "/my-service",
           "target": "http://localhost:3001/api",
           "healthCheck": "/health"
         }
         // ... other routes
       ]
     }
     // ... other environments like "production"
   }
   ```

**D. Run the Gateway:**

   Once your `gateway.config.json` is configured, you can start the server:
   ```bash
   # If gateway.config.json is in the current directory:
   gateway-server

   # To specify a different configuration file path:
   gateway-server --config path/to/your/gateway.config.json

   # To run with a specific environment defined in your config (e.g., "production"):
   gateway-server --env production
   ```
   The server will look for `gateway.config.json` in the current directory by default.

   **Important for Global Users:** You should **not** need to modify `f-gateway.conf.js`. This file is part of the gateway's internal structure. All your configuration should be done through the `gateway.config.json` file.

### 2. Developing the Gateway Locally

This method is for developers who want to modify or contribute to the Octopus API Gateway Server itself.

**A. Clone the Repository:**

   ```bash
   git clone https://github.com/hackroot9623/gateway-server.git
   cd gateway-server
   ```

**B. Install Dependencies:**

   ```bash
   yarn install
   # or
   npm install
   ```

**C. Development Mode:**

   To run the gateway in development mode with automatic restarts on file changes:
   ```bash
   yarn dev
   ```
   When running locally for development:
   * The server typically uses `config/default.json` if no specific `--config` path is provided.
   * The `f-gateway.conf.js` file is used by the application internally for loading environment variables and defining default configurations if the primary JSON config is not found or for certain fallback values. Environment variables (e.g., `PORT`, `AUTH_SERVICE_URL`) can also influence the configuration when developing locally.

## JSON Configuration File (`gateway.config.json`)

The `gateway.config.json` file is the primary way to configure the Octopus API Gateway. It's a JSON object where keys represent different environments (e.g., `development`, `production`). Each environment has its own set of configurations.

Here's a breakdown of the properties available within each environment object (e.g., `"development": { ... }`):

| Property          | Type    | Description                                                                                                | Default (from `config/default.json`) |
|-------------------|---------|------------------------------------------------------------------------------------------------------------|--------------------------------------|
| `port`            | number  | The port on which the gateway server will listen.                                                          | `8080`                               |
| `corsOptions`     | object  | Configuration for CORS (Cross-Origin Resource Sharing).                                                    | See below                            |
| `rateLimit`       | object  | Global rate limiting settings for all routes. Can be overridden per route.                                 | See below                            |
| `timeout`         | number  | Global request timeout in milliseconds for all routes. Can be overridden per route.                        | `30000` (30 seconds)                 |
| `routes`          | array   | An array of route objects, defining how requests are proxied to your microservices.                        | See below                            |
| `logging`         | object  | Configuration for logging.                                                                                 | See below                            |
| `security`        | object  | Security-related configurations.                                                                           | See below                            |

### `corsOptions` Object

| Property         | Type    | Description                                                                    | Default                                 |
|------------------|---------|--------------------------------------------------------------------------------|-----------------------------------------|
| `origin`         | string  | Configures the `Access-Control-Allow-Origin` CORS header.                      | `"*"` (allows all origins)              |
| `exposedHeaders` | array   | Configures the `Access-Control-Expose-Headers` CORS header.                    | `["Authorization", "hub_url", ...]`     |
| `credentials`    | boolean | Configures the `Access-Control-Allow-Credentials` CORS header.                 | `true`                                  |

### Global `rateLimit` Object

| Property   | Type   | Description                                                        | Default         |
|------------|--------|--------------------------------------------------------------------|-----------------|
| `windowMs` | number | Time window in milliseconds for which requests are counted.        | `900000` (15 minutes) |
| `max`      | number | Maximum number of requests allowed from an IP within `windowMs`.   | `100`           |

### `routes` Array

Each object in the `routes` array defines a microservice or a group of endpoints to be proxied.

| Property      | Type   | Required | Description                                                                                                | Example                               |
|---------------|--------|----------|------------------------------------------------------------------------------------------------------------|---------------------------------------|
| `prefix`      | string | Yes      | URL path prefix. Requests starting with this prefix will be routed to the `target`.                        | `"/ms-auth"`                          |
| `target`      | string | Yes      | The base URL of the target microservice.                                                                   | `"http://127.0.0.1:8082"`             |
| `timeout`     | number | No       | Per-route request timeout in milliseconds. Overrides the global `timeout`.                                 | `10000` (10 seconds)                  |
| `healthCheck` | string | No       | A specific path on the target service used for health checks (e.g., `/health`, `/status`).                 | `"/health"`                           |
| `rateLimit`   | object | No       | Per-route rate limiting settings. Overrides global `rateLimit`. Structure is the same as global `rateLimit`. | `{ "windowMs": 60000, "max": 20 }`    |
| `middlewares` | array  | No       | *(Advanced)* Array of custom middleware functions for this specific route. Generally not needed for typical JSON configuration. |                                       |

**Note on `prefixRewrite`**: The `prefixRewrite` property from `fast-gateway` is automatically managed based on the `prefix` you provide. For example, if `prefix` is `/ms-auth`, a request to `/ms-auth/login` will be forwarded to `target/login`.

### `logging` Object

| Property | Type   | Description                                                                 | Default    |
|----------|--------|-----------------------------------------------------------------------------|------------|
| `level`  | string | Logging level. Can be `"debug"`, `"info"`, `"warn"`, `"error"`.             | `"debug"`  |
| `format` | string | Log format. Can be `"pretty"` (colorized, human-readable) or `"json"`.      | `"pretty"` |

### `security` Object

| Property          | Type    | Description                                                              | Default |
|-------------------|---------|--------------------------------------------------------------------------|---------|
| `enableHelmet`    | boolean | If `true`, enables Helmet middleware for various security HTTP headers.  | `true`  |
| `enableRateLimit` | boolean | If `true`, enables global rate limiting.                                 | `true`  |
| `trustProxy`      | boolean | Set to `true` if the gateway is behind a trusted proxy (e.g., load balancer). Necessary for correct IP detection for rate limiting. | `true`  |

### Example `gateway.config.json` Structure:

```json
{
  "development": {
    "port": 8080,
    "corsOptions": {
      "origin": "*",
      "exposedHeaders": ["Authorization", "Content-Type"],
      "credentials": true
    },
    "rateLimit": {
      "windowMs": 900000, // 15 minutes
      "max": 100
    },
    "timeout": 30000, // 30 seconds
    "routes": [
      {
        "prefix": "/users",
        "target": "http://localhost:3001/api/v1/users",
        "timeout": 10000,
        "healthCheck": "/health",
        "rateLimit": { // Specific rate limit for /users
          "windowMs": 60000, // 1 minute
          "max": 60
        }
      },
      {
        "prefix": "/products",
        "target": "http://localhost:3002/products-service",
        "healthCheck": "/ping"
      }
    ],
    "logging": {
      "level": "debug",
      "format": "pretty"
    },
    "security": {
      "enableHelmet": true,
      "enableRateLimit": true,
      "trustProxy": true
    }
  },
  "production": {
    // Similar structure, but with production-specific settings
    "port": 80,
    "rateLimit": {
      "windowMs": 60000,
      "max": 1000
    },
    "logging": {
      "level": "info",
      "format": "json"
    },
    // ... other production settings
    "routes": [
        // ...
    ]
  }
}
```

## Environment Variables

While the `gateway.config.json` is the primary configuration method, some settings can be influenced by environment variables, especially when developing locally or for specific overrides:

- `NODE_ENV`: Sets the environment (e.g., `development`, `production`). The gateway will use the configuration block corresponding to this environment from `gateway.config.json`. Defaults to `development`.
- `PORT`: Overrides the `port` specified in the configuration file.
- Service URLs (primarily for local development or if `f-gateway.conf.js` is involved):
    - `AUTH_SERVICE_URL`
    - `PROJECT_SERVICE_URL`
    - `RRHH_SERVICE_URL`
    - `DWH_SERVICE_URL`
    - `CRM_SERVICE_URL`
  *(Note: When using `gateway.config.json`, these environment variables for service URLs are less critical as targets are defined directly in the JSON. They are more relevant if you are running from a cloned repo and relying on `f-gateway.conf.js` fallbacks.)*

## Advanced Features

### Circuit Breaker
The gateway uses the `opossum` circuit breaker pattern to prevent cascading failures. If a downstream service becomes unresponsive or consistently returns errors, the circuit "opens" for that service, and requests will fail fast without overwhelming the failing service. The circuit breaker will periodically attempt to "half-open" to check if the service has recovered. Circuit breaker settings are currently global and not configurable via the JSON file.

### Prometheus Metrics & Dashboard
- **Metrics Endpoint**: Raw Prometheus metrics are available at `/metrics`.
- **Metrics Dashboard**: A simple, view-only dashboard to visualize key metrics is available at `/metrics-dashboard`.

![Metrics Dashboard](https://github.com/user-attachments/assets/cc2fb5c2-d13c-4d24-83a2-9739807f817e)

### Health Checks
- **Global Health Check**: `/health` endpoint on the gateway provides a status of the gateway itself and tries to check the health of all configured downstream services (using their `healthCheck` paths).
- **Per-Service Health Checks**: Each route can have a `healthCheck` path defined. The global health check uses these paths.

## License

MIT

## Author
Original concept by Antonio Navarro Ortiz <navarrortiz1@gmail.com>

## Maintained & Enhanced by
- [hackroot9623](https://github.com/hackroot9623)
