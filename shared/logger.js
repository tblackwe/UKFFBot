/**
 * Lightweight structured logger.
 *
 * Emits one JSON object per line so CloudWatch Logs Insights can filter and
 * aggregate by level/field. Use instead of bare console.* for anything worth
 * querying or alarming on. Error objects passed as `context.error` are
 * serialized to { message, stack } (JSON.stringify drops Error fields otherwise).
 */

const LEVEL_METHOD = {
    error: 'error',
    warn: 'warn',
    info: 'log',
    debug: 'log'
};

function emit(level, message, context = {}) {
    const ctx = { ...context };
    if (ctx.error instanceof Error) {
        ctx.error = { message: ctx.error.message, stack: ctx.error.stack };
    }

    const entry = {
        level,
        message,
        ...ctx,
        timestamp: new Date().toISOString()
    };

    const method = LEVEL_METHOD[level] || 'log';
    console[method](JSON.stringify(entry));
}

module.exports = {
    info: (message, context) => emit('info', message, context),
    warn: (message, context) => emit('warn', message, context),
    error: (message, context) => emit('error', message, context),
    debug: (message, context) => emit('debug', message, context)
};
