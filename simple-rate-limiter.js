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

    console.log(`\n[Check] Current Window ID: ${currentWindow}`);
    console.log(`[Check] Current User: ${userId}`);

    // if first time seeing the user
    if (!requestCounts[userId]) {
        console.log(`[Check] New user - initializing counter`);
        requestCounts[userId] = {
            count: 0,
            window: currentWindow
        };
    }

    const userData = requestCounts[userId];
    console.log(`[Check] Stored Window ID: ${userData.window}`);
    console.log(`[Check] Count Before Increment: ${userData.count}`);

    // Check if this is a new window
    if (userData.window != currentWindow) {
        console.log(`[Check] New Window Detected - Resetting counter`)
        // we reset for a new window
        userData.count = 0;
        userData.window = currentWindow;
    }
    // we then increment count
    userData.count++
    console.log(`[Check] Count After Increment: ${userData.count}/${RATE_LIMIT}`);

    // We check if over limit
    if (userData.count > RATE_LIMIT) {
        console.log(`[Check] Rejected - Exceeded Limit`);
        return false; // We reject the request
    }

    const remaining = RATE_LIMIT - userData.count;
    console.log(`[Check] Allowed - ${remaining} requests remaining`);
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

app.get('/debug', (req, res) => {
    res.json({
        currentWindow: getCurrentWindow(),
        currentTime: new Date().toISOString(),
        requestCounts: requestCounts,
        totalUsers: Object.keys(requestCounts).length,
        config: {
            windowSize: WINDOW_SIZE,
            rateLimit: RATE_LIMIT,
        }
    })
})
// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
