const redis = require('redis');
const logger = require('./logger');

// Redis connection configuration
const redisClient = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6279,
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                logger.error(`[Redis] Max connection attempts reached`, { retries });
                return new Error('Max reconnection attempts reached');
            }
            const delay = Math.min(retries * 100, 3000);
            logger.warn(`[Redis] Reconnecting`, { attempt: retries, delayMs: delay });
            return delay;
        }
    }
});

// Error handling
redisClient.on('error', (err) => {
    logger.error(`[Redis] Connection error`, {
        message: err.message,
        code: err.code,
        syscall: err.syscall,
        address: err.address,
        port: err.port,
        stack: err.stack
    });
});

// Connection events
redisClient.on('connect', () => {
    logger.info(`[Redis] Connected and ready`);
});

redisClient.on('ready', () => {
    logger.info('[Redis] Connected and ready');
});

redisClient.on('reconnecting', () => {
    logger.warn('[Redis] Connection lost, attempting to reconnect');
});

redisClient.on('end', () => {
    logger.info('[Redis] Connection closed');
});

// Initial connection
(async () => {
    try {
        await redisClient.connect();
        logger.info('[Redis] Initial connection successful');
    } catch (err) {
        logger.error('[Redis] FATAL: Faild to establish initial connection', {
            message: err.message,
            stack: err.stack,
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379
        });
        process.exit(1);
    }
})();

module.exports = redisClient;