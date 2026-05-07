const buckets = new Map();

export const createRateLimit = ({
    windowMs = 60000,
    max = 60,
    key = (req) => req.ip || req.socket?.remoteAddress || 'unknown',
    message = 'Too many requests. Please try again shortly.'
} = {}) => {
    return (req, res, next) => {
        const now = Date.now();
        const bucketKey = key(req);
        const bucket = buckets.get(bucketKey) || { count: 0, resetAt: now + windowMs };

        if (now > bucket.resetAt) {
            bucket.count = 0;
            bucket.resetAt = now + windowMs;
        }

        bucket.count += 1;
        buckets.set(bucketKey, bucket);

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - bucket.count));
        res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));

        if (bucket.count > max) {
            return res.status(429).json({ error: message });
        }

        return next();
    };
};

