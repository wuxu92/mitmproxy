// Jest stub for CSS Module imports: returns the class name as its own value so
// component tests can assert on className substrings (e.g. "selected").
module.exports = new Proxy(
    {},
    {
        get: (_target, key) => (key === "__esModule" ? false : key),
    },
);
