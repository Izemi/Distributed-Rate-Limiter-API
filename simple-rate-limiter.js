const express = require('express');
const redisClient = require('./redis-client');
const logger = require('./logger');

const app = express();

// Configuration
const WINDOW_SIZE = parseInt(process.env.WINDOW_SIZE) || 60;

// API key to tier mapping
const API_KEYS = {
    'sk_test_free_1': 'free',
    'sk_test_free_2': 'free',
    'sk_test_premium_1': 'premium',
    'sk_test_premium_2': 'premium',
    'sk_test_enterprise_1': 'enterprise'
};

const TIER_LIMITS = {
    'free': 5,
    'premium': 20,
    'enterprise': 100
};

// Get tier from API key
function getTierFromAPIKey(apiKey) {
    return API_KEYS[apiKey] || 'free';
}

// Get rate limit for API key
function getRateLimitForAPIKey(apiKey) {
    const tier = getTierFromAPIKey(apiKey);
    return TIER_LIMITS[tier];
}

// Get current window ID
function getCurrentWindow() {
    const now = Date.now();
    return Math.floor(now / (WINDOW_SIZE * 1000));
}

// Production rate limiting with Redis
async function checkRateLimit(apiKey) {
    const currentWindow = getCurrentWindow();
    const userLimit = getRateLimitForAPIKey(apiKey);
    const tier = getTierFromAPIKey(apiKey);
    
    const redisKey = `rate_limit:${apiKey}:${currentWindow}`;
    
    logger.debug('[RateLimit] Checking limit', {
        apiKey: apiKey.substring(0, 15) + '...',
        tier,
        limit: userLimit,
        window: currentWindow
    });
    
    try {
        // Atomic increment
        const count = await redisClient.incr(redisKey);
        
        // Set expiry on first request
        if (count === 1) {
            await redisClient.expire(redisKey, WINDOW_SIZE * 2);
            logger.debug('[RateLimit] Set key expiry', { 
                redisKey,
                ttl: WINDOW_SIZE * 2 
            });
        }
        
        // Check if over limit
        if (count > userLimit) {
            logger.warn('[RateLimit] Request rejected - limit exceeded', {
                apiKey: apiKey.substring(0, 15) + '...',
                tier,
                count,
                limit: userLimit
            });
            return { allowed: false, count, limit: userLimit, tier };
        }
        
        const remaining = userLimit - count;
        logger.debug('[RateLimit] Request allowed', {
            apiKey: apiKey.substring(0, 15) + '...',
            tier,
            count,
            limit: userLimit,
            remaining
        });
        
        return { allowed: true, count, limit: userLimit, tier, remaining };
        
    } catch (error) {
        logger.error('[RateLimit] Redis operation failed - failing open', {
            message: error.message,
            stack: error.stack,
            apiKey: apiKey.substring(0, 15) + '...',
            operation: 'incr',
            redisKey
        });
        // Fail open - availability over perfect rate limiting
        return { allowed: true, count: 0, limit: userLimit, tier, remaining: userLimit };
    }
}

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('[HTTP] Request completed', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: duration,
            apiKey: req.headers['x-api-key'] ? req.headers['x-api-key'].substring(0, 15) + '...' : 'none'
        });
    });
    next();
});

// API endpoint
app.get('/api/resource', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
        logger.warn('[HTTP] Unauthorized request - missing API key', {
            ip: req.ip,
            path: req.path
        });
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'API key required. Include X-API-Key header.'
        });
    }

    const result = await checkRateLimit(apiKey);
    
    // Set headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining || 0);
    res.setHeader('X-RateLimit-Window', WINDOW_SIZE);
    res.setHeader('X-RateLimit-Tier', result.tier);

    if (!result.allowed) {
        return res.status(429).json({
            error: 'Too many requests',
            message: `Rate limit exceeded. Your tier (${result.tier}) allows ${result.limit} requests per ${WINDOW_SIZE} seconds.`,
            retryAfter: WINDOW_SIZE,
            tier: result.tier
        });
    }

    res.json({
        message: "Success!",
        data: 'Here is your data',
        rateLimit: {
            tier: result.tier,
            limit: result.limit,
            remaining: result.remaining,
            windowSize: WINDOW_SIZE
        }
    });
});

// Debug endpoint
app.get('/debug', async (req, res) => {
    try {
        const currentWindow = getCurrentWindow();
        const keys = await redisClient.keys('rate_limit:*');
        
        const counts = {};
        for (const key of keys) {
            const count = await redisClient.get(key);
            counts[key] = parseInt(count);
        }
        
        logger.debug('[Debug] Debug endpoint accessed', {
            keysCount: keys.length,
            currentWindow
        });
        
        res.json({
            currentWindow: currentWindow,
            currentTime: new Date().toISOString(),
            redisKeys: counts,
            totalKeys: keys.length,
            config: {
                windowSize: WINDOW_SIZE,
                tierLimits: TIER_LIMITS
            }
        });
    } catch (error) {
        logger.error('[Debug] Debug endpoint failed', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Internal server error',
            message: 'Debug endpoint unavailable'
        });
    }
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        await redisClient.ping();
        res.json({ 
            status: 'healthy', 
            redis: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('[Health] Health check failed', {
            message: error.message
        });
        res.status(503).json({ 
            status: 'unhealthy', 
            redis: 'disconnected',
            timestamp: new Date().toISOString()
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('[HTTP] Unhandled error', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });
    res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    logger.info('[Server] Started', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        windowSize: WINDOW_SIZE
    });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    logger.info('[Server] Shutdown signal received', { signal });
    
    server.close(async () => {
        logger.info('[Server] HTTP server closed');
        
        try {
            await redisClient.quit();
            logger.info('[Server] Redis connection closed');
            process.exit(0);
        } catch (err) {
            logger.error('[Server] Error during shutdown', {
                message: err.message,
                stack: err.stack
            });
            process.exit(1);
        }
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
        logger.error('[Server] Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));