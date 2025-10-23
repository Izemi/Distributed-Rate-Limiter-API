const express = require('express');

const app = express();
const requestCounts = {};

// max requests
const RATE_LIMIT = 10; 

// max requests should be per minute
const WINDOW_SIZE = 60;

// Helper function to find the minute we are in
function getCurrentWindow() {

    // milliseconds since 1970
    const now = Date.now();
    // which minute?
    return Math.floor(now / (WINDOW_SIZE * 1000))
}

// The rate limiting logic
function checkRateLimit(userId) {
    const currentWindow = getCurrentWindow();

    // if first time seeing the user
    if (!requestCounts[userId]) {
        requestCounts[userId] = {
            count: 0,
            window: currentWindow
        };
    }

    const userData = requestCounts[userId];

    // Check if this is a new window
    if (userData.window != currentWindow) {
        // we reset for a new window
        userData.count = 0;
        userData.window = currentWindow;
    }
    // we then increment count
    userData.count++

    // We check if over limit
    if (userData.count > RATE_LIMIT) {
        return false; // We reject the request
    }
    return true;
}

// API endpoint
app.get('/api/resource', (req, res) => {
    const userID = req.query.user || 'anonymous';

    const allowed = checkRateLimit(userID);

    if (!allowed) {
        return res.status(429).json({
            error: 'Too many requests',
            message: `Rate limit: ${RATE_LIMIT} requests per ${WINDOW_SIZE} seconds`
        })
    }

    // if allowed, we return the resource
    res.json({
        message: "Success!",
        data: 'Here is your data'
    });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
