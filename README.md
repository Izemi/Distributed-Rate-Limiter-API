# Rate Limiter API

A rate limiting system built with Node.js and Express.

## What It Does

Protects API endpoints from abuse by limiting the number of requests per user within a time window.

**Current Features:**
- Fixed window rate limiting (10 requests per 60 seconds)
- Per-user tracking
- RESTful API design
- In-memory storage

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation
```bash
# Clone the repository
git clone https://github.com/Izemi/distributed-rate-limiter.git
cd rate-limiter

# Install dependencies
npm install

# Start the server
node simple-rate-limiter.js
```

### Usage

**Make a request:**
```bash
curl "http://localhost:3000/api/resource?user=example"
```

**Response (success):**
```json
{
  "message": "Success!",
  "data": "Here is your data"
}
```

**Response (rate limited):**
```json
{
  "error": "Too many requests",
  "message": "Rate limit: 10 requests per 60 seconds"
}
```

## How It Works

Uses a **fixed window** algorithm:
1. Time is divided into 60-second windows
2. Each user gets a counter that resets every window
3. Requests are rejected once the limit is exceeded
```
Window 1 (0-59s)    Window 2 (60-119s)
User: 10 requests   User: 10 requests (counter resets)
```

## Architecture
```
Request → checkRateLimit() → Allow/Deny → Response
                ↓
         requestCounts{} 
         (in-memory storage)
```

## Configuration

Edit these constants in `simple-rate-limiter.js`:
```javascript
const RATE_LIMIT = 10;   // Maximum requests
const WINDOW_SIZE = 60;  // Time window in seconds
```

## API Endpoints

### `GET /api/resource`

Protected resource that enforces rate limiting.

**Query Parameters:**
- `user` (optional) - User identifier (defaults to "anonymous")

**Responses:**
- `200` - Request allowed
- `429` - Rate limit exceeded

## 🚧 Known Limitations

Current version has some limitations (to be fixed in future versions):

1. **Boundary Problem**: Users can make 2x the limit at window boundaries
2. **Single Server Only**: Doesn't work across multiple server instances
3. **No Persistence**: Counters reset on server restart
4. **Memory Leak**: Stores all users forever (no cleanup)

##  Roadmap
- [ ] Implement sliding window algorithm
- [ ] Add Redis for distributed storage
- [ ] Add memory cleanup
- [ ] Add monitoring dashboard
- [ ] Performance optimization
- [ ] Add tests


## Author

Emile Izere - Yale CS Student

## 📄 License

MIT License - feel free to contribute!